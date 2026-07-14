import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  alertKey,
  buildAlert,
  buildOrdersUrl,
  collectNewAlerts,
  parseRules,
} from "./core.js";

const config = {
  retailcrmUrl: process.env.RETAILCRM_URL,
  apiKey: process.env.RETAILCRM_API_KEY,
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  rules: parseRules(process.env.SLA_RULES || "new:30,assembling:120"),
  intervalMs: Number(process.env.POLL_INTERVAL_SECONDS || 300) * 1000,
  stateFile: process.env.STATE_FILE || "data/state.json",
  dryRun: process.env.DRY_RUN === "true",
};

function validateConfig() {
  const required = ["retailcrmUrl", "apiKey"];
  if (!config.dryRun) required.push("telegramToken", "telegramChatId");
  const missing = required.filter((key) => !config[key]);
  if (missing.length) throw new Error(`Missing configuration: ${missing.join(", ")}`);
  if (!Number.isFinite(config.intervalMs) || config.intervalMs < 10_000) {
    throw new Error("POLL_INTERVAL_SECONDS must be at least 10");
  }
}

async function loadState() {
  try {
    const data = JSON.parse(await readFile(config.stateFile, "utf8"));
    return new Set(Array.isArray(data.sentKeys) ? data.sentKeys : []);
  } catch (error) {
    if (error.code === "ENOENT") return new Set();
    throw error;
  }
}

async function saveState(sentKeys) {
  await mkdir(dirname(config.stateFile), { recursive: true });
  const tempFile = `${config.stateFile}.tmp`;
  await writeFile(tempFile, JSON.stringify({ sentKeys: [...sentKeys] }, null, 2));
  await rename(tempFile, config.stateFile);
}

async function fetchOrders() {
  const orders = [];
  let page = 1;

  while (true) {
    const response = await fetch(buildOrdersUrl(config.retailcrmUrl, config.apiKey, page));
    if (!response.ok) throw new Error(`RetailCRM API returned ${response.status}`);
    const payload = await response.json();
    if (payload.success === false) throw new Error(payload.errorMsg || "RetailCRM API error");

    orders.push(...(payload.orders || []));
    const totalPages = Number(payload.pagination?.totalPageCount || 1);
    if (page >= totalPages) return orders;
    page += 1;
  }
}

async function sendTelegram(text) {
  if (config.dryRun) {
    console.log(`\n[DRY RUN]\n${text}\n`);
    return;
  }

  const endpoint = `https://api.telegram.org/bot${config.telegramToken}/sendMessage`;
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: config.telegramChatId, text }),
      });
      if (!response.ok) throw new Error(`Telegram returned ${response.status}`);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  throw lastError;
}

async function runOnce(sentKeys) {
  const orders = await fetchOrders();
  const alerts = collectNewAlerts(orders, config.rules, sentKeys);

  for (const order of alerts) {
    await sendTelegram(buildAlert(order));
    sentKeys.add(alertKey(order));
  }

  await saveState(sentKeys);
  console.log(`${new Date().toISOString()} checked=${orders.length} alerts=${alerts.length}`);
}

async function main() {
  validateConfig();
  const sentKeys = await loadState();

  await runOnce(sentKeys);
  setInterval(() => {
    runOnce(sentKeys).catch((error) => console.error("Polling failed:", error));
  }, config.intervalMs).unref();

  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
