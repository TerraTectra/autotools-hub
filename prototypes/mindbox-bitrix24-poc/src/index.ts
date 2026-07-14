import { createHash } from "node:crypto";
import express, { type Request, type Response } from "express";
import { z } from "zod";

export interface BitrixWebhookPayload {
  event?: string;
  data?: { FIELDS?: { ID?: string | number } };
  [key: string]: unknown;
}

export interface BitrixContact {
  ID: string;
  NAME?: string;
  LAST_NAME?: string;
  SECOND_NAME?: string;
  EMAIL?: Array<{ VALUE?: string }>;
  PHONE?: Array<{ VALUE?: string }>;
}

export interface BitrixDeal {
  ID: string;
  TITLE?: string;
  CONTACT_ID?: string;
  STAGE_ID?: string;
  OPPORTUNITY?: string;
  CURRENCY_ID?: string;
}

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  WEBHOOK_SHARED_SECRET: z.string().min(8),
  BITRIX_WEBHOOK_BASE_URL: z.string().url(),
  MINDBOX_API_BASE_URL: z.string().url().default("https://api.mindbox.ru/v3/operations/async"),
  MINDBOX_ENDPOINT_ID: z.string().min(1),
  MINDBOX_SECRET_KEY: z.string().min(1),
  MINDBOX_OPERATION: z.string().min(1),
  RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(4),
  RETRY_BASE_DELAY_MS: z.coerce.number().int().min(50).max(60_000).default(500)
});
export type AppConfig = z.infer<typeof configSchema>;
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => configSchema.parse(env);

function setNested(target: Record<string, unknown>, path: string[], value: unknown): void {
  let cursor = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (!cursor[segment] || typeof cursor[segment] !== "object") cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
}

export function normalizeBitrixPayload(input: unknown): BitrixWebhookPayload {
  if (!input || typeof input !== "object") return {};
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    setNested(normalized, key.match(/[^\[\]]+/g) ?? [key], value);
  }
  return normalized as BitrixWebhookPayload;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  attempts: number,
  baseDelayMs: number,
  shouldRetry: (error: unknown) => boolean = () => true,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetry(error)) throw error;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

class IdempotencyStore {
  private readonly entries = new Map<string, number>();
  constructor(private readonly ttlMs = 10 * 60 * 1000) {}
  claim(value: unknown, now = Date.now()): boolean {
    for (const [key, expiresAt] of this.entries) if (expiresAt <= now) this.entries.delete(key);
    const key = createHash("sha256").update(JSON.stringify(value)).digest("hex");
    if (this.entries.has(key)) return false;
    this.entries.set(key, now + this.ttlMs);
    return true;
  }
}

export class BitrixClient {
  constructor(private readonly baseUrl: string, private readonly fetchImpl: typeof fetch = fetch) {}
  getContact(id: string) { return this.call<BitrixContact>("crm.contact.get", { id }); }
  getDeal(id: string) { return this.call<BitrixDeal>("crm.deal.get", { id }); }
  private async call<T>(method: string, params: Record<string, string>): Promise<T> {
    const base = this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`;
    const url = new URL(`${method}.json`, base);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await this.fetchImpl(url, { method: "POST" });
    const body = await response.json() as { result?: T; error?: string; error_description?: string };
    if (!response.ok || body.error || body.result === undefined) {
      throw new Error(body.error_description ?? body.error ?? `Bitrix24 HTTP ${response.status}`);
    }
    return body.result;
  }
}

export class MindboxHttpError extends Error {
  constructor(public readonly status: number, public readonly responseBody: unknown) {
    super(`Mindbox HTTP ${status}`);
  }
}

export class MindboxClient {
  constructor(
    private readonly options: {
      apiBaseUrl: string;
      endpointId: string;
      secretKey: string;
      operation: string;
      fetchImpl?: typeof fetch;
    }
  ) {}
  async send(body: unknown): Promise<unknown> {
    const url = new URL(this.options.apiBaseUrl);
    url.searchParams.set("endpointId", this.options.endpointId);
    url.searchParams.set("operation", this.options.operation);
    const response = await (this.options.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: {
        authorization: `Mindbox secretKey=\"${this.options.secretKey}\"`,
        "content-type": "application/json; charset=utf-8",
        accept: "application/json"
      },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* diagnostics keep raw */ }
    if (!response.ok) throw new MindboxHttpError(response.status, parsed);
    return parsed;
  }
}

export function mapContactToMindbox(contact: BitrixContact, deal?: BitrixDeal) {
  const first = (values?: Array<{ VALUE?: string }>) => values?.map((x) => x.VALUE?.trim()).find(Boolean);
  return {
    customer: {
      ids: { bitrix24ContactId: contact.ID },
      firstName: contact.NAME?.trim() || undefined,
      lastName: contact.LAST_NAME?.trim() || undefined,
      middleName: contact.SECOND_NAME?.trim() || undefined,
      email: first(contact.EMAIL),
      mobilePhone: first(contact.PHONE),
      customFields: deal ? {
        bitrix24DealId: deal.ID,
        bitrix24DealTitle: deal.TITLE,
        bitrix24DealStage: deal.STAGE_ID,
        bitrix24DealAmount: deal.OPPORTUNITY ? Number(deal.OPPORTUNITY) : undefined,
        bitrix24DealCurrency: deal.CURRENCY_ID
      } : {}
    },
    pointOfContact: "Bitrix24",
    data: { sourceEvent: deal ? "deal.updated" : "contact.updated" }
  };
}

export function createApp(
  config: AppConfig,
  dependencies: { bitrix?: BitrixClient; mindbox?: MindboxClient } = {}
) {
  const app = express();
  const bitrix = dependencies.bitrix ?? new BitrixClient(config.BITRIX_WEBHOOK_BASE_URL);
  const mindbox = dependencies.mindbox ?? new MindboxClient({
    apiBaseUrl: config.MINDBOX_API_BASE_URL,
    endpointId: config.MINDBOX_ENDPOINT_ID,
    secretKey: config.MINDBOX_SECRET_KEY,
    operation: config.MINDBOX_OPERATION
  });
  const idempotency = new IdempotencyStore();

  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: true, limit: "256kb" }));
  app.get("/health", (_request, response) => response.json({ status: "ok" }));

  app.post("/webhooks/bitrix", async (request: Request, response: Response) => {
    if (request.query.secret !== config.WEBHOOK_SHARED_SECRET) {
      response.status(401).json({ error: "unauthorized" });
      return;
    }
    const payload = normalizeBitrixPayload(request.body);
    const event = String(payload.event ?? "").toUpperCase();
    const rawId = payload.data?.FIELDS?.ID;
    const entityId = rawId === undefined || rawId === null || rawId === "" ? null : String(rawId);
    if (!entityId || !["ONCRMCONTACTUPDATE", "ONCRMDEALUPDATE"].includes(event)) {
      response.status(202).json({ accepted: false, reason: "unsupported_event" });
      return;
    }
    if (!idempotency.claim({ event, entityId, payload })) {
      response.status(202).json({ accepted: true, duplicate: true });
      return;
    }
    response.status(202).json({ accepted: true, duplicate: false });

    void (async () => {
      try {
        let deal: BitrixDeal | undefined;
        let contact: BitrixContact;
        if (event === "ONCRMCONTACTUPDATE") {
          contact = await bitrix.getContact(entityId);
        } else {
          deal = await bitrix.getDeal(entityId);
          if (!deal.CONTACT_ID) throw new Error(`Deal ${entityId} has no CONTACT_ID`);
          contact = await bitrix.getContact(String(deal.CONTACT_ID));
        }
        await withRetry(
          () => mindbox.send(mapContactToMindbox(contact, deal)),
          config.RETRY_ATTEMPTS,
          config.RETRY_BASE_DELAY_MS,
          (error) => !(error instanceof MindboxHttpError) || error.status === 429 || error.status >= 500
        );
        console.info("Mindbox operation sent", { event, entityId, contactId: contact.ID });
      } catch (error) {
        console.error("Webhook processing failed", { event, entityId, error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });
  return app;
}

if (process.env.NODE_ENV !== "test") {
  const config = loadConfig();
  createApp(config).listen(config.PORT, () => console.info(`Bridge listening on ${config.PORT}`));
}
