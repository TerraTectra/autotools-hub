import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  createApp,
  mapContactToMindbox,
  normalizeBitrixPayload,
  withRetry,
  type AppConfig,
  type BitrixClient,
  type MindboxClient
} from "../src/index.js";

const config: AppConfig = {
  PORT: 3000,
  WEBHOOK_SHARED_SECRET: "test-secret",
  BITRIX_WEBHOOK_BASE_URL: "https://example.bitrix24.ru/rest/1/token/",
  MINDBOX_API_BASE_URL: "https://api.mindbox.ru/v3/operations/async",
  MINDBOX_ENDPOINT_ID: "demo",
  MINDBOX_SECRET_KEY: "secret",
  MINDBOX_OPERATION: "Bitrix24.SyncContact",
  RETRY_ATTEMPTS: 1,
  RETRY_BASE_DELAY_MS: 50
};

describe("Bitrix24 → Mindbox PoC", () => {
  it("parses bracket notation", () => {
    expect(normalizeBitrixPayload({ "data[FIELDS][ID]": "42" }).data?.FIELDS?.ID).toBe("42");
  });

  it("maps CRM data", () => {
    const result = mapContactToMindbox(
      { ID: "7", NAME: "Terra", EMAIL: [{ VALUE: "terra@example.com" }] },
      { ID: "42", CONTACT_ID: "7", OPPORTUNITY: "15000", CURRENCY_ID: "RUB" }
    );
    expect(result.customer.email).toBe("terra@example.com");
    expect(result.customer.customFields.bitrix24DealAmount).toBe(15000);
  });

  it("retries transient failures", async () => {
    const operation = vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValue("ok");
    const sleep = vi.fn(async () => undefined);
    await expect(withRetry(operation, 2, 100, () => true, sleep)).resolves.toBe("ok");
    expect(sleep).toHaveBeenCalledWith(100);
  });

  it("accepts a deal event and dispatches to Mindbox", async () => {
    const bitrix = {
      getDeal: vi.fn(async () => ({ ID: "42", CONTACT_ID: "7" })),
      getContact: vi.fn(async () => ({ ID: "7", NAME: "Terra" }))
    } as unknown as BitrixClient;
    const mindbox = { send: vi.fn(async () => ({ status: "Success" })) } as unknown as MindboxClient;
    const app = createApp(config, { bitrix, mindbox });
    const response = await request(app)
      .post("/webhooks/bitrix?secret=test-secret")
      .type("form")
      .send({ event: "ONCRMDEALUPDATE", "data[FIELDS][ID]": "42" });
    expect(response.status).toBe(202);
    await vi.waitFor(() => expect(mindbox.send).toHaveBeenCalledOnce());
  });
});
