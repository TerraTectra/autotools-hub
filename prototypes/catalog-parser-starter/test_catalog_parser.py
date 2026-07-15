from catalog_parser import CompanyRecord, normalize_text, normalize_url, record_key, spreadsheet_safe


def test_normalize_text_collapses_spacing() -> None:
    assert normalize_text("  ACME\u00a0  Industrial\nTools  ") == "ACME Industrial Tools"


def test_normalize_url_resolves_relative_and_removes_fragment() -> None:
    assert (
        normalize_url("/supplier/acme?view=full#details", "https://EXAMPLE.com/category")
        == "https://example.com/supplier/acme?view=full"
    )


def test_normalize_url_rejects_non_http_protocols() -> None:
    assert normalize_url("javascript:alert(1)", "https://example.com") == ""


def test_record_key_prefers_profile_url() -> None:
    first = CompanyRecord(
        company_name="ACME",
        address="First address",
        profile_url="https://example.com/acme",
    )
    second = CompanyRecord(
        company_name="ACME renamed",
        address="Second address",
        profile_url="https://example.com/acme",
    )
    assert record_key(first) == record_key(second)


def test_record_key_falls_back_to_normalized_business_identity() -> None:
    first = CompanyRecord(company_name="ACME", address="New York", website="https://acme.test")
    second = CompanyRecord(company_name="acme", address="new york", website="https://acme.test")
    assert record_key(first) == record_key(second)


def test_spreadsheet_safe_blocks_formula_prefixes() -> None:
    assert spreadsheet_safe("=IMPORTXML(\"https://example.com\")") == "'=IMPORTXML(\"https://example.com\")"
    assert spreadsheet_safe("ACME") == "ACME"
