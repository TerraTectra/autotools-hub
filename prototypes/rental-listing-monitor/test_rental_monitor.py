from pathlib import Path

from rental_monitor import (
    Listing,
    ListingFilters,
    ListingStore,
    listing_key,
    matches_filters,
    normalize_text,
    normalize_url,
    telegram_message,
)


def sample_listing(**overrides):
    values = {
        "source": "OLX",
        "source_id": "abc-123",
        "title": "Двухкомнатная квартира возле метро",
        "url": "https://example.com/item/abc-123#details",
        "price": 18000,
        "currency": "UAH",
        "city": "Харьков",
        "district": "Шевченковский",
        "rooms": 2,
        "address": "ул. Тестовая, 10",
        "description": "Собственник, без комиссии",
    }
    values.update(overrides)
    return Listing(**values)


def test_normalization() -> None:
    assert normalize_text("  Новая\u00a0  квартира\n") == "Новая квартира"
    assert normalize_url("https://EXAMPLE.com/item/1#photo") == "https://example.com/item/1"
    assert normalize_url("javascript:alert(1)") == ""


def test_key_prefers_source_id() -> None:
    first = sample_listing(title="Первый заголовок")
    second = sample_listing(title="Изменённый заголовок", url="https://example.com/other")
    assert listing_key(first) == listing_key(second)


def test_filters_accept_matching_listing() -> None:
    filters = ListingFilters(
        city="харьков",
        districts=("Шевченковский",),
        min_price=15000,
        max_price=20000,
        rooms=(2,),
        include_keywords=("метро",),
        exclude_keywords=("агентство",),
    )
    assert matches_filters(sample_listing(), filters)


def test_filters_reject_price_and_keywords() -> None:
    assert not matches_filters(sample_listing(price=25000), ListingFilters(max_price=20000))
    assert not matches_filters(
        sample_listing(description="Объявление агентства"),
        ListingFilters(exclude_keywords=("агентство",)),
    )


def test_store_deduplicates(tmp_path: Path) -> None:
    store = ListingStore(tmp_path / "seen.sqlite3")
    listing = sample_listing()
    try:
        assert not store.is_seen(listing)
        store.remember(listing)
        assert store.is_seen(listing)
        store.remember(listing)
        count = store.connection.execute("SELECT COUNT(*) FROM seen_listings").fetchone()[0]
        assert count == 1
    finally:
        store.close()


def test_telegram_message_contains_key_fields() -> None:
    message = telegram_message(sample_listing())
    assert "Двухкомнатная квартира" in message
    assert "18 000 UAH" in message
    assert "Шевченковский" in message
    assert "https://example.com/item/abc-123" in message
