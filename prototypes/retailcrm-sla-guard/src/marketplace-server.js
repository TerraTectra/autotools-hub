import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import http from "node:http";
import {
  alertKey,
  buildAlert,
  buildOrdersUrl,
  collectNewAlerts,
  parseRules,
} from "./core.js";
import {
  buildIntegrationModuleForm,
  buildMarketplaceConfig,
  generateClientId,
  getPayloadField,
  normalizePublicBaseUrl,
  parseAllowedDomains,
  parseBoolean,
  publicErrorMessage,
  validateRetailCrmSystemUrl,
  verifyRegisterToken,
} from "./marketplace-core.js";
import { TenantStore } from "./tenant-store.js";

const config = {
  port: Number(process.env.PORT || 8080),
  publicBaseUrl: process.env.PUBLIC_BASE_URL,
  marketplaceSecret: process.env.MARKETPLACE_SECRET,
  moduleCode: process.env.MARKETPLACE_MODULE_CODE || "retailcrm-sla-guard",
  tenantsFile: process.env.TENANTS_FILE || "data/tenants.json",
  auditLogFile: process.env.AUDIT_LOG_FILE || "data/audit.log",
  domainsUrl:
    process.env.RETAILCRM_DOMAINS_URL ||
    "https://infra-data.retailcrm.tech/crm-domains.json",
  pollIntervalMs: Number(process.env.POLL_INTERVAL_SECONDS || 300) * 1000,
  dryRun: process.env.DRY_RUN === "true",
};

const store = new TenantStore(config.tenantsFile);
let polling = false;

function validateStartupConfig() {
  if (!config.publicBaseUrl) throw new Error("PUBLIC_BASE_URL is required");
  config.publicBaseUrl = normalizePublicBaseUrl(config.publicBaseUrl);
  if (!config.marketplaceSecret) throw new Error("MARKETPLACE_SECRET is required");
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/i.test(config.moduleCode)) {
    throw new Error("MARKETPLACE_MODULE_CODE has invalid format");
  }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error("PORT must be between 1 and 65535");
  }
  if (!Number.isFinite(config.pollIntervalMs) || config.pollIntervalMs < 10_000) {
    throw new Error("POLL_INTERVAL_SECONDS must be at least 10");
  }
}

async function audit(event, details = {}) {
  await mkdir(dirname(config.auditLogFile), { recursive: true });
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...details,
  };
  await appendFile(config.auditLogFile, `${JSON.stringify(entry)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "content-security-policy":
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  response.end(html);
}

async function readPayload(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  const contentType = String(request.headers["content-type"] || "");
  if (contentType.includes("application/json")) return JSON.parse(raw);
  return Object.fromEntries(new URLSearchParams(raw));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchAllowedDomains() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(config.domainsUrl, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`RetailCRM domains returned ${response.status}`);
    return parseAllowedDomains(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

async function callRetailCrm(tenant, path, options = {}) {
  const url = new URL(path, `${tenant.crmUrl}/`);
  url.searchParams.set("apiKey", tenant.apiKey);
  const startedAt = Date.now();
  const response = await fetch(url, options);
  await audit("retailcrm_api", {
    clientId: tenant.clientId.slice(0, 12),
    method: options.method || "GET",
    path: url.pathname,
    status: response.status,
    durationMs: Date.now() - startedAt,
  });
  return response;
}

async function registerModule(payload) {
  const apiKey = getPayloadField(payload, "register[apiKey]", ["register", "apiKey"]);
  const token = getPayloadField(payload, "register[token]", ["register", "token"]);
  const rawSystemUrl = getPayloadField(payload, "register[systemUrl]", [
    "register",
    "systemUrl",
  ]);

  if (!apiKey || !token || !rawSystemUrl) {
    throw new Error("RetailCRM did not provide all registration fields");
  }
  if (!verifyRegisterToken(apiKey, config.marketplaceSecret, token)) {
    throw new Error("Registration request signature is invalid");
  }

  const crmUrl = validateRetailCrmSystemUrl(rawSystemUrl, await fetchAllowedDomains());
  const clientId = generateClientId();
  const accountUrl = new URL(
    "/marketplace/account",
    `${config.publicBaseUrl}/`,
  ).toString();

  const tenant = await store.upsert(clientId, {
    crmUrl,
    apiKey,
    active: false,
    frozen: false,
    configured: false,
    slaRules: "new:30,assembling:120,delivery:1440",
    telegramBotToken: null,
    telegramChatId: null,
    sentKeys: [],
    createdAt: new Date().toISOString(),
    registrationState: "pending",
  });

  try {
    const form = buildIntegrationModuleForm({
      moduleCode: config.moduleCode,
      clientId,
      publicBaseUrl: config.publicBaseUrl,
    });
    const response = await callRetailCrm(
      tenant,
      `/api/v5/integration-modules/${encodeURIComponent(config.moduleCode)}/edit`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form,
      },
    );
    const result = await response.json().catch(() => ({}));
    if (response.status === 402) {
      throw new Error("Недостаточно средств на балансе RetailCRM для активации модуля");
    }
    if (!response.ok || result.success === false) {
      throw new Error(result.errorMsg || `RetailCRM registration returned ${response.status}`);
    }

    await store.upsert(clientId, {
      active: true,
      frozen: false,
      registrationState: "registered",
      registeredAt: new Date().toISOString(),
    });
    await audit("tenant_registered", {
      clientId: clientId.slice(0, 12),
      crmHost: new URL(crmUrl).hostname,
    });
    return { success: true, accountUrl };
  } catch (error) {
    await store.remove(clientId);
    await audit("tenant_registration_failed", {
      clientId: clientId.slice(0, 12),
      error: publicErrorMessage(error),
    });
    throw error;
  }
}

async function handleActivity(payload) {
  const clientId = getPayloadField(payload, "clientId", ["clientId"]);
  if (!clientId) throw new Error("clientId is missing");
  const tenant = await store.get(clientId);
  if (!tenant) throw new Error("Unknown clientId");

  const rawSystemUrl = getPayloadField(payload, "systemUrl", ["systemUrl"]);
  const crmUrl = rawSystemUrl
    ? validateRetailCrmSystemUrl(rawSystemUrl, await fetchAllowedDomains())
    : tenant.crmUrl;
  const active = parseBoolean(
    getPayloadField(payload, "activity[active]", ["activity", "active"]),
  );
  const frozen = parseBoolean(
    getPayloadField(payload, "activity[freeze]", ["activity", "freeze"]),
  );

  await store.upsert(clientId, {
    crmUrl,
    active,
    frozen,
    billingInfo: {
      price: getPayloadField(payload, "billingInfo[price]", ["billingInfo", "price"]),
      priceWithDiscount: getPayloadField(payload, "billingInfo[priceWithDiscount]", [
        "billingInfo",
        "priceWithDiscount",
      ]),
      currencyCode: getPayloadField(payload, "billingInfo[currency][code]", [
        "billingInfo",
        "currency",
        "code",
      ]),
      billingType: getPayloadField(payload, "billingInfo[billingType]", [
        "billingInfo",
        "billingType",
      ]),
    },
    lastActivityCallbackAt: new Date().toISOString(),
  });
  await audit("tenant_activity", {
    clientId: clientId.slice(0, 12),
    active,
    frozen,
  });
}

function accountPage(tenant, message = "") {
  const tokenState = tenant.telegramBotToken ? "настроен" : "не настроен";
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>RetailCRM SLA Guard</title><style>
body{font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 18px;color:#171717}label{display:block;margin:18px 0 6px;font-weight:600}input{box-sizing:border-box;width:100%;padding:11px;border:1px solid #aaa;border-radius:7px}button{margin-top:22px;padding:11px 18px;border:0;border-radius:7px;background:#171717;color:white;font-weight:700}.status{padding:12px;background:#f3f3f3;border-radius:7px}.message{padding:12px;background:#e8f6e8;border-radius:7px;margin-bottom:16px}small{color:#666}</style></head><body>
<h1>RetailCRM SLA Guard</h1>${message ? `<div class="message">${escapeHtml(message)}</div>` : ""}
<div class="status">Аккаунт: <b>${escapeHtml(tenant.crmUrl)}</b><br>Модуль: ${tenant.active ? "активен" : "выключен"}; ${tenant.frozen ? "заморожен" : "не заморожен"}<br>Telegram-токен: ${tokenState}</div>
<form method="post" action="/marketplace/account/save">
<input type="hidden" name="clientId" value="${escapeHtml(tenant.clientId)}">
<label for="slaRules">SLA по статусам</label><input id="slaRules" name="slaRules" required value="${escapeHtml(tenant.slaRules)}"><small>Формат: status:minutes,status:minutes</small>
<label for="telegramChatId">Telegram chat ID</label><input id="telegramChatId" name="telegramChatId" required value="${escapeHtml(tenant.telegramChatId || "")}">
<label for="telegramBotToken">Telegram bot token</label><input id="telegramBotToken" name="telegramBotToken" type="password" autocomplete="new-password" placeholder="Оставьте пустым, чтобы сохранить текущий">
<button type="submit">Сохранить настройки</button></form></body></html>`;
}

async function saveAccount(payload) {
  const clientId = getPayloadField(payload, "clientId", ["clientId"]);
  const tenant = clientId ? await store.get(clientId) : null;
  if (!tenant) throw new Error("Unknown clientId");
  const slaRules = String(getPayloadField(payload, "slaRules", ["slaRules"]) || "").trim();
  const telegramChatId = String(
    getPayloadField(payload, "telegramChatId", ["telegramChatId"]) || "",
  ).trim();
  const suppliedToken = String(
    getPayloadField(payload, "telegramBotToken", ["telegramBotToken"]) || "",
  ).trim();
  parseRules(slaRules);
  if (!telegramChatId) throw new Error("Telegram chat ID is required");
  const telegramBotToken = suppliedToken || tenant.telegramBotToken;
  if (!telegramBotToken) throw new Error("Telegram bot token is required");

  return store.upsert(clientId, {
    slaRules,
    telegramChatId,
    telegramBotToken,
    configured: true,
    lastConfigurationAt: new Date().toISOString(),
  });
}

async function fetchOrders(tenant) {
  const orders = [];
  let page = 1;
  while (true) {
    const response = await callRetailCrm(
      tenant,
      buildOrdersUrl(tenant.crmUrl, tenant.apiKey, page).pathname +
        buildOrdersUrl(tenant.crmUrl, tenant.apiKey, page).search.replace(
          new RegExp(`([?&])apiKey=[^&]*&?`),
          "$1",
        ).replace(/[?&]$/, ""),
    );
    if (!response.ok) throw new Error(`RetailCRM orders returned ${response.status}`);
    const result = await response.json();
    if (result.success === false) throw new Error(result.errorMsg || "RetailCRM API error");
    orders.push(...(result.orders || []));
    const totalPages = Number(result.pagination?.totalPageCount || 1);
    if (page >= totalPages) return orders;
    page += 1;
  }
}

async function sendTelegram(tenant, text) {
  if (config.dryRun) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${tenant.telegramBotToken}/sendMessage`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: tenant.telegramChatId, text }),
      },
    );
    await audit("telegram_api", {
      clientId: tenant.clientId.slice(0, 12),
      status: response.status,
    });
    if (!response.ok) throw new Error(`Telegram returned ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function pollTenant(tenant) {
  if (!tenant.active || tenant.frozen || !tenant.configured) return;
  const sentKeys = new Set(Array.isArray(tenant.sentKeys) ? tenant.sentKeys : []);
  try {
    const orders = await fetchOrders(tenant);
    const alerts = collectNewAlerts(orders, parseRules(tenant.slaRules), sentKeys);
    for (const order of alerts) {
      await sendTelegram(tenant, buildAlert(order));
      sentKeys.add(alertKey(order));
    }
    const compactKeys = [...sentKeys].slice(-5000);
    await store.upsert(tenant.clientId, {
      sentKeys: compactKeys,
      lastPollAt: new Date().toISOString(),
      lastPollOrders: orders.length,
      lastPollAlerts: alerts.length,
      lastError: null,
    });
  } catch (error) {
    const message = publicErrorMessage(error);
    await store.upsert(tenant.clientId, {
      lastPollAt: new Date().toISOString(),
      lastError: message,
    });
    await audit("tenant_poll_failed", {
      clientId: tenant.clientId.slice(0, 12),
      error: message,
    });
  }
}

async function pollCycle() {
  if (polling) return;
  polling = true;
  try {
    for (const tenant of await store.list()) await pollTenant(tenant);
  } finally {
    polling = false;
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, "http://localhost");
  try {
    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { success: true, service: "retailcrm-sla-guard" });
    }
    if (request.method === "GET" && url.pathname === "/marketplace/config") {
      return sendJson(response, 200, buildMarketplaceConfig(config.publicBaseUrl));
    }
    if (request.method === "POST" && url.pathname === "/marketplace/register") {
      return sendJson(response, 200, await registerModule(await readPayload(request)));
    }
    if (request.method === "POST" && url.pathname === "/marketplace/activity") {
      await handleActivity(await readPayload(request));
      return sendJson(response, 200, { success: true });
    }
    if (
      (request.method === "POST" || request.method === "GET") &&
      url.pathname === "/marketplace/account"
    ) {
      const payload = request.method === "POST" ? await readPayload(request) : {};
      const clientId = getPayloadField(payload, "clientId", ["clientId"]) || url.searchParams.get("clientId");
      const tenant = clientId ? await store.get(clientId) : null;
      if (!tenant) return sendHtml(response, 404, "<h1>Настройки не найдены</h1>");
      return sendHtml(response, 200, accountPage(tenant));
    }
    if (request.method === "POST" && url.pathname === "/marketplace/account/save") {
      const tenant = await saveAccount(await readPayload(request));
      await audit("tenant_configured", { clientId: tenant.clientId.slice(0, 12) });
      return sendHtml(response, 200, accountPage(tenant, "Настройки сохранены"));
    }
    return sendJson(response, 404, { success: false, errorMsg: "Not found" });
  } catch (error) {
    const message = publicErrorMessage(error);
    await audit("request_failed", {
      method: request.method,
      path: url.pathname,
      error: message,
    }).catch(() => {});
    return sendJson(response, 200, { success: false, errorMsg: message });
  }
}

async function main() {
  validateStartupConfig();
  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      sendJson(response, 500, { success: false, errorMsg: publicErrorMessage(error) });
    });
  });
  server.listen(config.port, "0.0.0.0", () => {
    console.log(`RetailCRM SLA Guard listening on port ${config.port}`);
  });
  setTimeout(() => pollCycle().catch(console.error), 1_000);
  setInterval(() => pollCycle().catch(console.error), config.pollIntervalMs);
}

main().catch((error) => {
  console.error(publicErrorMessage(error));
  process.exitCode = 1;
});
