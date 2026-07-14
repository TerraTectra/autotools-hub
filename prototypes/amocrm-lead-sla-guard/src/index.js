import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  alertKey,
  buildTask,
  formatAlert,
  isLeadBreached,
  normalizeLeads,
  parseRules,
} from "./core.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseNumber(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  return value;
}

function parseIdSet(raw) {
  return new Set((raw || "").split(",").map((item) => Number(item.trim())).filter(Number.isFinite));
}

const config = {
  baseUrl: required("AMO_BASE_URL").replace(/\/$/, ""),
  token: required("AMO_ACCESS_TOKEN"),
  telegramToken: required("TELEGRAM_BOT_TOKEN"),
  telegramChatId: required("TELEGRAM_CHAT_ID"),
  pollIntervalMs: parseNumber("POLL_INTERVAL_MS", 60000),
  maxPages: Math.max(1, parseNumber("MAX_PAGES", 4)),
  lookbackHours: Math.max(1, parseNumber("LOOKBACK_HOURS", 48)),
  stateFile: process.env.STATE_FILE || "data/state.json",
  rules: parseRules(process.env.SLA_RULES || "", parseNumber("DEFAULT_SLA_SECONDS", 1800)),
  closedStatusIds: parseIdSet(process.env.CLOSED_STATUS_IDS),
  autoCreateTask: /^(1|true|yes)$/i.test(process.env.AUTO_CREATE_TASK || "false"),
  taskDeadlineMinutes: Math.max(1, parseNumber("TASK_DEADLINE_MINUTES", 15)),
};

async function fetchWithRetry(url, init = {}, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;
      const body = await response.text();
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
      }
      lastError = new Error(`Temporary HTTP ${response.status}: ${body.slice(0, 200)}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500 * 2 ** attempt);
  }
  throw lastError;
}

async function amoRequest(path, init = {}) {
  const response = await fetchWithRetry(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/hal+json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  if (response.status === 204) return null;
  return response.json();
}

async function loadState() {
  try {
    const raw = await readFile(config.stateFile, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function saveState(state) {
  await mkdir(dirname(config.stateFile), { recursive: true });
  await writeFile(config.stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function listRecentLeads(nowSeconds) {
  const result = [];
  const cutoff = nowSeconds - config.lookbackHours * 3600;
  for (let page = 1; page <= config.maxPages; page += 1) {
    const data = await amoRequest(`/api/v4/leads?limit=250&page=${page}&order[updated_at]=desc`);
    const leads = normalizeLeads(data);
    if (leads.length === 0) break;
    result.push(...leads.filter((lead) => Number(lead.updated_at) >= cutoff));
    if (leads.some((lead) => Number(lead.updated_at) < cutoff)) break;
    if (!data?._links?.next) break;
  }
  return result;
}

async function sendTelegram(text) {
  const response = await fetchWithRetry(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: config.telegramChatId, text, disable_web_page_preview: true }),
  });
  return response.json();
}

async function createTask(lead, nowSeconds) {
  const task = buildTask(lead, nowSeconds, config.taskDeadlineMinutes);
  return amoRequest("/api/v4/tasks", { method: "POST", body: JSON.stringify([task]) });
}

async function runOnce() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const [state, leads] = await Promise.all([loadState(), listRecentLeads(nowSeconds)]);
  let changed = false;

  for (const lead of leads) {
    if (!isLeadBreached(lead, {
      nowSeconds,
      rules: config.rules,
      closedStatusIds: config.closedStatusIds,
    })) continue;

    const key = alertKey(lead);
    if (state[key]) continue;

    await sendTelegram(formatAlert(lead, config.baseUrl, nowSeconds));
    if (config.autoCreateTask && Number.isFinite(Number(lead.responsible_user_id))) {
      await createTask(lead, nowSeconds);
    }
    state[key] = { sentAt: nowSeconds, taskCreated: config.autoCreateTask };
    changed = true;
  }

  const activeKeys = new Set(leads.map(alertKey));
  for (const key of Object.keys(state)) {
    if (!activeKeys.has(key)) {
      delete state[key];
      changed = true;
    }
  }
  if (changed) await saveState(state);
  console.log(`[${new Date().toISOString()}] checked=${leads.length} alerts=${Object.keys(state).length}`);
}

async function main() {
  for (;;) {
    try {
      await runOnce();
    } catch (error) {
      console.error(`[${new Date().toISOString()}]`, error);
    }
    await sleep(config.pollIntervalMs);
  }
}

void main();
