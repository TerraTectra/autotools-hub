import http from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  buildCrmPayload,
  buildTelegramMessage,
  eventKey,
  isMissedIncomingCall,
  normalizeCallEvent,
  safeEqual,
} from "./core.js";

const config = {
  port: Number(process.env.PORT || 8080),
  path: process.env.WEBHOOK_PATH || "/webhooks/uis",
  secret: process.env.WEBHOOK_SECRET || "",
  secretHeader: (process.env.WEBHOOK_SECRET_HEADER || "x-webhook-secret").toLowerCase(),
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
  crmWebhookUrl: process.env.CRM_WEBHOOK_URL || "",
  stateFile: process.env.STATE_FILE || "data/state.json",
  dryRun: process.env.DRY_RUN === "true",
};

function validateConfig() {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error("PORT must be a valid TCP port");
  }
  if (!config.secret) throw new Error("WEBHOOK_SECRET is required");
  if (!config.dryRun && (!config.telegramToken || !config.telegramChatId)) {
    throw new Error("Telegram credentials are required unless DRY_RUN=true");
  }
}

async function loadState() {
  try {
    const parsed = JSON.parse(await readFile(config.stateFile, "utf8"));
    return new Set(Array.isArray(parsed.processedKeys) ? parsed.processedKeys : []);
  } catch (error) {
    if (error.code === "ENOENT") return new Set();
    throw error;
  }
}

async function saveState(processedKeys) {
  await mkdir(dirname(config.stateFile), { recursive: true });
  const values = [...processedKeys].slice(-10_000);
  const temporary = `${config.stateFile}.tmp`;
  await writeFile(temporary, JSON.stringify({ processedKeys: values }, null, 2));
  await rename(temporary, config.stateFile);
}

async function postJson(url, body, headers = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

async function deliver(call) {
  const message = buildTelegramMessage(call);
  if (config.dryRun) {
    console.log(`\n[DRY RUN]\n${message}\n`);
  } else {
    await postJson(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
      chat_id: config.telegramChatId,
      text: message,
    });
  }

  if (config.crmWebhookUrl) {
    await postJson(config.crmWebhookUrl, buildCrmPayload(call));
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Payload too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

export function createServer(processedKeys) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      if (request.method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, { ok: true });
      }
      if (request.method !== "POST" || url.pathname !== config.path) {
        return sendJson(response, 404, { ok: false, error: "not_found" });
      }

      const suppliedSecret = request.headers[config.secretHeader] || url.searchParams.get("secret");
      if (!safeEqual(suppliedSecret, config.secret)) {
        return sendJson(response, 401, { ok: false, error: "unauthorized" });
      }

      const payload = await readJson(request);
      const call = normalizeCallEvent(payload);
      if (!isMissedIncomingCall(call)) {
        return sendJson(response, 202, { ok: true, ignored: true });
      }

      const key = eventKey(call);
      if (processedKeys.has(key)) {
        return sendJson(response, 200, { ok: true, duplicate: true });
      }

      await deliver(call);
      processedKeys.add(key);
      await saveState(processedKeys);
      return sendJson(response, 200, { ok: true, processed: true });
    } catch (error) {
      console.error(error);
      return sendJson(response, error instanceof SyntaxError ? 400 : 500, {
        ok: false,
        error: error instanceof SyntaxError ? "invalid_json" : "internal_error",
      });
    }
  });
}

async function main() {
  validateConfig();
  const processedKeys = await loadState();
  const server = createServer(processedKeys);
  server.listen(config.port, () => console.log(`UIS recovery webhook listening on :${config.port}${config.path}`));
}

if (process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
