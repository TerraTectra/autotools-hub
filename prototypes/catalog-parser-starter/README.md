# Authenticated Catalog Parser Starter

A reusable Python/Playwright starter for directory-parsing projects that require a normal user login, pagination, deduplication and delivery to CSV or Google Sheets.

It was prepared as a technical proof for a current brief involving roughly 120 directory pages and 2,500–2,600 company records. It is intentionally **not tied to undocumented Thomasnet selectors** and has not been presented as a finished Thomasnet scraper. Site-specific selectors must be configured only after the customer supplies the exact category URL and confirms that automation is permitted by the site's terms.

## What it demonstrates

- normal browser login or reuse of an existing Playwright storage state;
- immediate stop when a CAPTCHA or verification challenge is detected;
- configurable company-row and field selectors;
- pagination with a maximum-page safety limit;
- pacing between pages;
- normalization and deterministic deduplication;
- CSV export;
- optional Google Sheets export through a service account supplied by the customer;
- no credential, cookie or customer-data logging.

## Expected fields

The starter supports these output columns:

- `company_name`
- `revenue`
- `address`
- `website`
- `profile_url`
- `founded_year`
- `company_type`

When a company website is unavailable, the delivery layer can retain the directory profile URL instead.

## Installation

```bash
cd prototypes/catalog-parser-starter
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
```

Copy the selector template and adjust it after inspecting the authorized account:

```bash
copy selectors.example.json selectors.json
```

## Credentials

Credentials are accepted only through environment variables and are never written to output:

```powershell
$env:DIRECTORY_EMAIL = "user@example.com"
$env:DIRECTORY_PASSWORD = "..."
```

A customer may instead sign in manually once and supply a local Playwright storage-state file. Do not commit that file.

## Run

```bash
python catalog_parser.py `
  --category-url "https://example.com/category" `
  --selectors selectors.json `
  --output companies.csv `
  --max-pages 3 `
  --headed
```

The first commercial step should be a 2–3 page validation run. Price and final deadline should be fixed only after confirming that all required fields are available after login and that pagination is stable.

## Google Sheets

Set `GOOGLE_APPLICATION_CREDENTIALS` to a customer-owned service-account JSON file and share the target spreadsheet with that service account. Then run:

```bash
python catalog_parser.py `
  --category-url "https://example.com/category" `
  --selectors selectors.json `
  --output companies.csv `
  --spreadsheet-id "SPREADSHEET_ID" `
  --worksheet "Companies"
```

The service-account file and spreadsheet contents must never be committed.

## Safety boundaries

- No CAPTCHA solving or anti-bot bypass.
- No scraping without customer confirmation that the source and intended use are permitted.
- No collection beyond the agreed public/business fields.
- No secrets in Git, logs or screenshots.
- Stop and report when the site changes, blocks automation or requires additional verification.

## Validation

```bash
pytest -q
```

The tests cover text normalization, URL cleanup and deterministic deduplication. A real-site acceptance test requires the customer's authorized account, exact category and written field criteria.
