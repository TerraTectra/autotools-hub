import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildIntegrationModuleForm,
  buildMarketplaceConfig,
  parseAllowedDomains,
  parseBoolean,
  validateRetailCrmSystemUrl,
  verifyRegisterToken,
} from "../src/marketplace-core.js";
import { TenantStore } from "../src/tenant-store.js";

test("builds the documented simple-connection config", () => {
  assert.deepEqual(buildMarketplaceConfig("https://guard.example.com"), {
    success: true,
    scopes: ["order_read", "integration_write"],
    registerUrl: "https://guard.example.com/marketplace/register",
  });
});

test("verifies RetailCRM registration HMAC in constant-size hex form", () => {
  const apiKey = "crm-api-key";
  const secret = "partner-secret";
  const token = createHmac("sha256", secret).update(apiKey).digest("hex");
  assert.equal(verifyRegisterToken(apiKey, secret, token), true);
  assert.equal(verifyRegisterToken(apiKey, secret, `${token.slice(0, -1)}0`), false);
  assert.equal(verifyRegisterToken(apiKey, secret, "not-a-token"), false);
});

test("validates CRM URL against the live-domain payload shape", () => {
  const domains = parseAllowedDomains({
    createDate: "2026-07-13T14:35:08+00:00",
    domains: [{ domain: "retailcrm.ru" }, { domain: "simla.com" }],
  });
  assert.equal(
    validateRetailCrmSystemUrl("https://demo.retailcrm.ru/admin", domains),
    "https://demo.retailcrm.ru",
  );
  assert.equal(
    validateRetailCrmSystemUrl("https://shop.simla.com", domains),
    "https://shop.simla.com",
  );
  assert.throws(
    () => validateRetailCrmSystemUrl("http://demo.retailcrm.ru", domains),
    /HTTPS/,
  );
  assert.throws(
    () => validateRetailCrmSystemUrl("https://demo.retailcrm.ru.evil.example", domains),
    /not allowed/,
  );
});

test("builds integration-module registration fields", () => {
  const form = buildIntegrationModuleForm({
    moduleCode: "retailcrm-sla-guard",
    clientId: "client-1",
    publicBaseUrl: "https://guard.example.com",
  });
  assert.equal(form.get("integrationModule[code]"), "retailcrm-sla-guard");
  assert.equal(form.get("integrationModule[integrationCode]"), "retailcrm-sla-guard");
  assert.equal(form.get("integrationModule[active]"), "1");
  assert.equal(form.get("integrationModule[clientId]"), "client-1");
  assert.equal(form.get("integrationModule[baseUrl]"), "https://guard.example.com");
  assert.equal(form.get("integrationModule[actions][activity]"), "/marketplace/activity");
  assert.equal(
    form.get("integrationModule[accountUrl]"),
    "https://guard.example.com/marketplace/account",
  );
});

test("parses activity booleans", () => {
  assert.equal(parseBoolean("1"), true);
  assert.equal(parseBoolean("false"), false);
  assert.equal(parseBoolean(0), false);
  assert.equal(parseBoolean(true), true);
});

test("persists tenants atomically", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "sla-guard-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "tenants.json");
  const store = new TenantStore(file);

  await Promise.all([
    store.upsert("a", { active: true }),
    store.upsert("b", { active: false }),
  ]);
  assert.equal((await store.get("a")).active, true);
  assert.equal((await store.list()).length, 2);
  await store.remove("b");
  assert.equal(await store.get("b"), null);

  const raw = JSON.parse(await readFile(file, "utf8"));
  assert.equal(raw.version, 1);
  assert.deepEqual(Object.keys(raw.tenants), ["a"]);
});
