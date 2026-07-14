import { writeFile } from 'node:fs/promises';
import {
  buildRefreshPayload,
  classifyCheck,
  classifyRefresh,
  maskSecret,
  normalizeBaseUrl,
  safeBody
} from './core.js';

const env = process.env;
const baseUrl = normalizeBaseUrl(env.AMOCRM_BASE_URL);
const mode = env.MODE === 'refresh' ? 'refresh' : 'check';
const timeoutMs = Number(env.TIMEOUT_MS || 10000);
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return { raw: text.slice(0, 500) }; }
}

async function check(accessToken) {
  if (!accessToken) throw new Error('AMOCRM_ACCESS_TOKEN is required for check mode');
  const response = await fetch(`${baseUrl}/api/v4/account`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: controller.signal
  });
  const body = await readJson(response);
  return { status: response.status, body, diagnosis: classifyCheck(response.status, body) };
}

async function refresh() {
  const payload = buildRefreshPayload({
    clientId: env.AMOCRM_CLIENT_ID,
    clientSecret: env.AMOCRM_CLIENT_SECRET,
    refreshToken: env.AMOCRM_REFRESH_TOKEN,
    redirectUri: env.AMOCRM_REDIRECT_URI
  });
  const response = await fetch(`${baseUrl}/oauth2/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: controller.signal
  });
  const body = await readJson(response);
  const result = { status: response.status, body, diagnosis: classifyRefresh(response.status, body) };
  if (response.status === 200 && body.access_token && body.refresh_token) {
    const output = {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      token_type: body.token_type,
      expires_in: body.expires_in,
      received_at: new Date().toISOString()
    };
    const path = env.TOKEN_OUTPUT_FILE || 'new-tokens.json';
    await writeFile(path, JSON.stringify(output, null, 2), { encoding: 'utf8', mode: 0o600 });
    result.tokenOutput = path;
  }
  return result;
}

try {
  console.log(`Mode: ${mode}`);
  console.log(`Account: ${baseUrl}`);
  if (mode === 'check') console.log(`Token: ${maskSecret(env.AMOCRM_ACCESS_TOKEN)}`);
  const result = mode === 'refresh' ? await refresh() : await check(env.AMOCRM_ACCESS_TOKEN);
  console.log(JSON.stringify({ ...result, body: safeBody(result.body) }, null, 2));
  process.exitCode = result.diagnosis.severity === 'error' ? 2 : 0;
} catch (error) {
  console.error(JSON.stringify({ code: 'local-error', message: error.message }, null, 2));
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
