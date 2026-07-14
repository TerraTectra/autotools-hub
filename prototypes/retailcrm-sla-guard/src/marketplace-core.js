import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const DEFAULT_MARKETPLACE_SCOPES = ["order_read", "integration_write"];

export function normalizePublicBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("PUBLIC_BASE_URL must use HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("PUBLIC_BASE_URL must not contain credentials, query, or fragment");
  }
  return url.origin;
}

export function buildMarketplaceConfig(publicBaseUrl) {
  const baseUrl = normalizePublicBaseUrl(publicBaseUrl);
  return {
    success: true,
    scopes: [...DEFAULT_MARKETPLACE_SCOPES],
    registerUrl: new URL("/marketplace/register", `${baseUrl}/`).toString(),
  };
}

export function verifyRegisterToken(apiKey, secret, token) {
  if (!apiKey || !secret || !token) return false;
  const expected = createHmac("sha256", secret).update(apiKey).digest("hex");
  if (!/^[a-f0-9]{64}$/i.test(token)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(token, "hex"));
}

export function generateClientId() {
  return randomBytes(32).toString("hex");
}

export function parseEncryptionKey(value) {
  if (!value) throw new Error("TENANT_ENCRYPTION_KEY is required");

  let key;
  if (/^[a-f0-9]{64}$/i.test(value)) {
    key = Buffer.from(value, "hex");
  } else {
    try {
      key = Buffer.from(value, "base64");
    } catch {
      throw new Error("TENANT_ENCRYPTION_KEY must be 32-byte hex or base64");
    }
  }

  if (key.length !== 32) {
    throw new Error("TENANT_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export function encryptSecret(value, key) {
  if (value == null || value === "") return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecret(value, key) {
  if (!value) return null;
  const [version, rawIv, rawTag, rawEncrypted, ...extra] = String(value).split(".");
  if (version !== "v1" || !rawIv || !rawTag || !rawEncrypted || extra.length) {
    throw new Error("Encrypted secret has unsupported format");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(rawIv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(rawTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(rawEncrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Encrypted secret could not be decrypted");
  }
}

export function parseAllowedDomains(payload) {
  const rawDomains = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.domains)
      ? payload.domains
      : [];

  const domains = rawDomains
    .map((entry) => (typeof entry === "string" ? entry : entry?.domain))
    .filter(Boolean)
    .map((domain) => String(domain).trim().toLowerCase().replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);

  if (!domains.length) throw new Error("RetailCRM domain list is empty");
  return [...new Set(domains)];
}

export function validateRetailCrmSystemUrl(value, allowedDomains) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("RetailCRM system URL must use HTTPS");
  if (url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("RetailCRM system URL contains forbidden credentials or port");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const allowed = allowedDomains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
  if (!allowed) throw new Error("RetailCRM system domain is not allowed");

  return url.origin;
}

export function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

export function getPayloadField(payload, flatName, nestedPath = []) {
  if (payload && Object.hasOwn(payload, flatName)) return payload[flatName];
  let current = payload;
  for (const part of nestedPath) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

export function buildIntegrationModuleForm({
  moduleCode,
  clientId,
  publicBaseUrl,
  activityPath = "/marketplace/activity",
  accountPath = "/marketplace/account",
}) {
  const baseUrl = normalizePublicBaseUrl(publicBaseUrl);
  const form = new URLSearchParams();
  form.set("integrationModule[code]", moduleCode);
  form.set("integrationModule[integrationCode]", moduleCode);
  form.set("integrationModule[active]", "1");
  form.set("integrationModule[clientId]", clientId);
  form.set("integrationModule[baseUrl]", baseUrl);
  form.set("integrationModule[actions][activity]", activityPath);
  form.set(
    "integrationModule[accountUrl]",
    new URL(accountPath, `${baseUrl}/`).toString(),
  );
  return form;
}

export function publicErrorMessage(error) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError") {
    return "Внешний сервис не ответил вовремя";
  }
  const message = String(error?.message || "Неизвестная ошибка");
  return message
    .replace(/apiKey=[^&\s]+/gi, "apiKey=[hidden]")
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[hidden]")
    .slice(0, 300);
}
