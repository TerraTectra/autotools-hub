import http from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  buildCrmPayload,
  buildTelegramMessage,
  normalizeTildaSubmission,
  parseUrlEncoded,
  safeEqual,
  submissionKey,
} from "./core.js";

const config = {
  port: Number(process.env.PORT || 8080),
  path: process.env.WEBHOOK_PATH || "/webhooks/tilda",
  secret: process.env.WEBHOOK_SECRET || "",
  secretHeader: (process.env.WEBHOOK_SECRET_HEADER || "x-webhook-secret").toLowerCase(),
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
  crmWebhookUrl: process.env.CRM_WEBHOOK_URL || "",
  stateFile: process.env.STATE_FILE || "data/state.json",
  dryRun: process.env.DRY_RUN === "true",
};

function validateConfig() {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65_535) {
    throw new Error("PORT must be a valid TCP port");
  }
  if (!config.secret) throw new Error("WEBHOOK_SECRET is required");
  if (!config.dryRun && !config.crmWebhookUrl && (!config.telegramToken || !config.telegramChatId)) {
    throw new Error("Configure Telegram, CRM_WEBHOOK_URL, or DRY_RUN=true");
  }
}

async function loadState() {
  try {
    const parsed = JSON.parse(await readFile(config.stateFile, "utf8"));
    return {
      processedKeys: new Set(Array.isArray(parsed.processedKeys) ? parsed.processedKeys : []),
      pending: Array.isArray(parsed.pending) ? parsed.pending : [],
    };
  } catch (error) {
    if (error.code === "ENOENT") return { processedKeys: new Set(), pending: [] };
    throw error;
  }
}

async function saveState(state) {
  await mkdir(dirname(config.stateFile), { recursive: true });
  const temporary = `${config.stateFile}.tmp`;
  const body = {
    processedKeys: [...state.processedKeys].slice(-10_000),
    pending: state.pending.slice(-2_000),
  };
  await writeFile(temporary, JSON.stringify(body, null, 2));
  await rename(temporary, config.stateFile);
}

async function postJson(url, body) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(4_000),
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

async function deliver(submission) {
  const message = buildTelegramMessage(submission);
  if (config.dryRun) {
    console.log(`\n[DRY RUN]\n${message}\n`);
  } else if (config.telegramToken && config.telegramChatId) {
    await postJson(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
      chat_id: config.telegramChatId,
      text: message,
      disable_web_page_preview: true,
    });
  }

  if (config.crmWebhookUrl) {
    await postJson(config.crmWebhookUrl, buildCrmPayload(submission));
  }
}

async function readPayload(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Payload too large");
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  const contentType = String(request.headers["content-type"] || "").toLowerCase();
  if (contentType.includes("application/json")) return JSON.parse(raw);
  if (contentType.includes("application/x-www-form-urlencoded") || !contentType) {
    return parseUrlEncoded(raw);
  }
  const error = new Error("Unsupported content type");
  error.statusCode = 415;
  throw error;
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function sendOk(response) {
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  response.end("ok");
}

export function createServer(state) {
  let workerPromise = null;

  async function processQueue() {
    if (workerPromise) return workerPromise;
    workerPromise = (async () => {
      while (state.pending.length > 0) {
        const item = state.pending[0];
        try {
          await deliver(item.submission);
          state.pending.shift();
          state.processedKeys.add(item.key);
          await saveState(state);
        } catch (error) {
          item.attempts = Number(item.attempts || 0) + 1;
          item.lastError = String(error?.message || error);
          await saveState(state);
          console.error("Delivery failed; item remains queued", error);
          break;
        }
      }
    })().finally(() => {
      workerPromise = null;
    });
    return workerPromise;
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      if (request.method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, {
          ok: true,
          pending: state.pending.length,
          processed: state.processedKeys.size,
        });
      }
      if (request.method !== "POST" || url.pathname !== config.path) {
        return sendJson(response, 404, { ok: false, error: "not_found" });
      }

      const suppliedSecret = request.headers[config.secretHeader] || url.searchParams.get("secret");
      if (!safeEqual(suppliedSecret, config.secret)) {
        return sendJson(response, 401, { ok: false, error: "unauthorized" });
      }

      const payload = await readPayload(request);
      const submission = normalizeTildaSubmission(payload, request.headers);
      const key = submissionKey(submission);
      const duplicate = state.processedKeys.has(key) || state.pending.some((item) => item.key === key);
      if (!duplicate) {
        state.pending.push({ key, submission, attempts: 0 });
        await saveState(state);
      }

      // Tilda expects a fast successful response; delivery continues from the durable local queue.
      sendOk(response);
      if (!duplicate) setImmediate(() => processQueue());
      return undefined;
    } catch (error) {
      console.error(error);
      const status = error.statusCode || (error instanceof SyntaxError ? 400 : 500);
      return sendJson(response, status, {
        ok: false,
        error: status === 400 ? "invalid_payload" : status === 415 ? "unsupported_media_type" : "internal_error",
      });
    }
  });

  return { server, processQueue };
}

async function main() {
  validateConfig();
  const state = await loadState();
  const { server, processQueue } = createServer(state);
  server.listen(config.port, () => {
    console.log(`Tilda webhook router listening on :${config.port}${config.path}`);
    if (state.pending.length > 0) setImmediate(() => processQueue());
  });
}

if (process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
