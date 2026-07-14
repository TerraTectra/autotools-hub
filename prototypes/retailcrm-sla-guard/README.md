# RetailCRM SLA Guard

RetailCRM SLA Guard detects orders that remain in one status longer than the configured SLA and sends a Telegram alert. The repository supports two modes:

- a single-account pilot for a specific client;
- a multi-tenant backend implementing the RetailCRM Marketplace simple-connection flow.

## Interactive demo

A public demonstration with fictional orders, configurable SLA thresholds and a privacy-safe Telegram alert preview is available at:

**https://terratectra.github.io/autotools-hub/site/**

The demo does not connect to RetailCRM and does not collect credentials or customer data.

## Business value

- reduces forgotten and abandoned orders;
- gives supervisors immediate visibility into SLA breaches;
- works without changing the CRM workflow;
- supports different limits for each RetailCRM status;
- suppresses duplicate notifications until the order status changes again;
- keeps a privacy-safe incident journal with CSV export for operational reviews.

## Marketplace package

- [Bilingual Marketplace card and pricing proposal](MARKETPLACE_SUBMISSION.md)
- [Moderation checklist and reviewer scenario](MODERATION.md)
- [Written support policy](SUPPORT.md)
- [Privacy and security policy](PRIVACY.md)
- [30-day audit log rotation example](deploy/retailcrm-sla-guard.logrotate)

## How it works

1. Reads orders through `GET /api/v5/orders`.
2. Compares `statusUpdatedAt` with the threshold configured for `extendedStatus` (or `status`).
3. Sends a Telegram message for newly detected breaches.
4. Stores sent alert keys so the same status breach is not reported twice.

Marketplace alerts contain only order number, status and SLA duration by default. Customer name and order total require explicit opt-in by the account owner.

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
- `POST /marketplace/register` — validates `register[token]` using HMAC-SHA256, checks the CRM domain against the current RetailCRM domain list, registers the integration module through API v5 and creates or safely reconnects a tenant;
- `POST /marketplace/activity` — processes activation, deactivation, freeze, unfreeze and account URL changes;
- `POST /marketplace/account` — opens the tenant settings page using `clientId` supplied by RetailCRM in the request body;
- `POST /marketplace/account/save` — saves SLA, Telegram and privacy settings;
- `POST /marketplace/incidents` — opens the privacy-safe SLA incident journal;
- `POST /marketplace/incidents.csv` — exports the journal for operational analysis;
- `GET /health` — health check.

Set the partner-cabinet configuration URL to:

```text
https://your-service.example/marketplace/config
```

Marketplace environment variables:

- `PUBLIC_BASE_URL` — public HTTPS origin of the module backend;
- `MARKETPLACE_SECRET` — secret generated in the RetailCRM partner cabinet;
- `MARKETPLACE_MODULE_CODE` — code matching the module code in the partner cabinet;
- `TENANT_ENCRYPTION_KEY` — exactly 32 random bytes encoded as 64 hexadecimal characters or base64;
- `TENANTS_FILE` — atomic JSON tenant storage path;
- `AUDIT_LOG_FILE` — JSONL integration audit log;
- `RETAILCRM_DOMAINS_URL` — official live list of accepted CRM domains;
- `PORT` and `POLL_INTERVAL_SECONDS`.

Generate an encryption key locally and store it only in the deployment secret manager:

```bash
openssl rand -hex 32
```

API keys and Telegram bot tokens are encrypted at rest with AES-256-GCM. The audit log contains endpoint paths, status codes and shortened tenant identifiers, but not credentials or message contents. The encryption key must never be committed to Git and must be backed up separately: losing it makes stored credentials unrecoverable.

The JSON tenant store is sufficient for a controlled pilot on one instance. A production Marketplace deployment should use an encrypted managed database or secrets service, a single active scheduler or distributed lock, monitored backups and HTTPS termination by a trusted reverse proxy.

## Reliability and security

- registration requests are authenticated with the RetailCRM HMAC token;
- CRM URLs are accepted only over HTTPS and only under domains from the current official RetailCRM domain list;
- repeated installation of the same CRM account reuses the tenant and restores the previous working state if registration fails;
- outgoing RetailCRM and Telegram requests use timeouts and retries for network errors, rate limits and server errors;
- API keys and bot tokens are excluded from application logs and encrypted in tenant storage;
- account settings are opened only through a POST carrying the unpredictable `clientId`, avoiding credentials in query strings;
- module polling stops while a tenant is deactivated, frozen or not fully configured;
- customer data is excluded from Marketplace alerts by default;
- the provided deployment example rotates audit logs daily and retains 30 archives.

## Validation

```bash
npm run check
```

The check runs syntax validation and unit tests for SLA detection, privacy-safe alerts, HMAC verification, AES-256-GCM credential encryption, domain validation, registration parameters and atomic tenant persistence. It also starts the Marketplace HTTP server in a process-level smoke test.

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

The repository contains no real credentials or customer data. A client pilot requires a test RetailCRM account/API key and a Telegram bot created by the client. Marketplace moderation additionally requires a partner account, the module code and secret from the partner cabinet, a stable public HTTPS deployment, an SVG logo and the legal onboarding requested by RetailCRM.
