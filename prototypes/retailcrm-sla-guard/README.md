# RetailCRM SLA Guard

Proof of concept for a paid RetailCRM module/service: it detects orders that remain in one status longer than the configured SLA and sends a Telegram alert.

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
4. Stores sent alert keys in a local JSON state file.

## Run

```bash
cp .env.example .env
set -a && source .env && set +a
npm start
```

Validation:

```bash
npm run check
```

## Docker

```bash
docker build -t retailcrm-sla-guard .
docker run --env-file .env -v ./data:/app/data retailcrm-sla-guard
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

The PoC intentionally contains no credentials or personal customer data. A production pilot requires a test RetailCRM account/API key and a Telegram bot created by the client.
