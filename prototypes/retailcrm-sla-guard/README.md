# RetailCRM SLA Guard

RetailCRM SLA Guard detects orders that remain in one status longer than the configured SLA and sends a Telegram alert. The repository supports two modes:

- a single-account pilot for a specific client;
- a multi-tenant backend implementing the RetailCRM Marketplace simple-connection flow.

## Business value

- reduces forgotten and abandoned orders;
- gives supervisors immediate visibility into SLA breaches;
- works without changing the CRM workflow;
- supports different limits for each RetailCRM status;
- suppresses duplicate notifications until the order status changes again.

## How it works

1. Reads orders through `GET /api/v5/orders`.
2. Compares `statusUpdatedAt` with the threshold configured for `extendedStatus` (or `status`).
3. Sends a Telegram message for newly detected breaches.
4. Stores sent alert keys so the same status breach is not reported twice.

## Single-account pilot

```bash
cp .env.example .env
set -a && source .env && set +a
npm start
```

Required variables: `RETAILCRM_URL`, `RETAILCRM_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and `SLA_RULES`.

## Marketplace backend

```bash
cp .env.example .env
set -a && source .env && set +a
npm run start:marketplace
```

The Marketplace backend provides:

- `GET /marketplace/config` — returns the required `order_read` and `integration_write` scopes and the registration URL;
- `POST /marketplace/register` — validates `register[token]` using HMAC-SHA256, checks the CRM domain against the current RetailCRM domain list, registers the integration module through API v5 and creates a tenant;
- `POST /marketplace/activity` — processes activation, deactivation, freeze, unfreeze and account URL changes;
- `POST /marketplace/account` — opens the tenant settings page using `clientId` supplied by RetailCRM;
- `POST /marketplace/account/save` — saves SLA and Telegram settings;
- `GET /health` — health check.

Set the partner-cabinet configuration URL to:

```text
https://your-service.example/marketplace/config
```

Marketplace environment variables:

- `PUBLIC_BASE_URL` — public HTTPS origin of the module backend;
- `MARKETPLACE_SECRET` — secret generated in the RetailCRM partner cabinet;
- `MARKETPLACE_MODULE_CODE` — code matching the module code in the partner cabinet;
- `TENANTS_FILE` — atomic JSON tenant storage path;
- `AUDIT_LOG_FILE` — JSONL integration audit log;
- `RETAILCRM_DOMAINS_URL` — official live list of accepted CRM domains;
- `PORT` and `POLL_INTERVAL_SECONDS`.

The backend never writes API keys or Telegram tokens to logs. Tenant storage contains credentials required for operation and therefore must be placed on an encrypted, access-controlled persistent volume. For production Marketplace publication, replace the JSON store with a managed encrypted database or secrets service.

## Validation

```bash
npm run check
```

The check runs syntax validation and unit tests for SLA detection, HMAC verification, domain validation, registration parameters and atomic tenant persistence.

## Docker

Single-account mode uses the default image command:

```bash
docker build -t retailcrm-sla-guard .
docker run --env-file .env -v ./data:/app/data retailcrm-sla-guard
```

Marketplace mode overrides the command and publishes the HTTP port:

```bash
docker run --env-file .env -p 8080:8080 -v ./data:/app/data \
  retailcrm-sla-guard npm run start:marketplace
```

## Commercial pilot proposal

A first client pilot can include:

- mapping of real RetailCRM statuses;
- rules for different teams and shops;
- Telegram group routing;
- links back to the order card;
- quiet hours and escalation levels;
- persistent storage and deployment;
- installation guide and support.

The repository contains no real credentials or customer data. A client pilot requires a test RetailCRM account/API key and a Telegram bot created by the client. Marketplace moderation additionally requires a partner account, the module code and secret from the partner cabinet, and a public HTTPS deployment.
