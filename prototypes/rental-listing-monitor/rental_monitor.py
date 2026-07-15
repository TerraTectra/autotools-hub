from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Protocol


@dataclass(frozen=True, slots=True)
class Listing:
    source: str
    source_id: str
    title: str
    url: str
    price: int | None = None
    currency: str = ""
    city: str = ""
    district: str = ""
    rooms: int | None = None
    address: str = ""
    description: str = ""
    image_url: str = ""
    published_at: str = ""


@dataclass(frozen=True, slots=True)
class ListingFilters:
    city: str = ""
    districts: tuple[str, ...] = ()
    min_price: int | None = None
    max_price: int | None = None
    rooms: tuple[int, ...] = ()
    include_keywords: tuple[str, ...] = ()
    exclude_keywords: tuple[str, ...] = ()


class ListingSource(Protocol):
    name: str

    def fetch(self) -> Iterable[Listing]: ...


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    value = value.replace("\u00a0", " ").replace("\u200b", "")
    return re.sub(r"\s+", " ", value).strip()


def normalize_url(value: str | None) -> str:
    value = normalize_text(value)
    if not value:
        return ""
    parts = urllib.parse.urlsplit(value)
    if parts.scheme not in {"http", "https"}:
        return ""
    return urllib.parse.urlunsplit(
        (parts.scheme.lower(), parts.netloc.lower(), parts.path, parts.query, "")
    )


def listing_key(listing: Listing) -> str:
    if listing.source_id:
        raw = f"{listing.source.casefold()}:{listing.source_id.casefold()}"
    else:
        raw = "|".join(
            (
                listing.source.casefold(),
                normalize_url(listing.url),
                normalize_text(listing.title).casefold(),
                normalize_text(listing.address).casefold(),
            )
        )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def matches_filters(listing: Listing, filters: ListingFilters) -> bool:
    city = normalize_text(listing.city).casefold()
    district = normalize_text(listing.district).casefold()
    haystack = normalize_text(
        " ".join((listing.title, listing.description, listing.address))
    ).casefold()

    if filters.city and normalize_text(filters.city).casefold() != city:
        return False
    if filters.districts and district not in {
        normalize_text(item).casefold() for item in filters.districts
    }:
        return False
    if filters.min_price is not None and (
        listing.price is None or listing.price < filters.min_price
    ):
        return False
    if filters.max_price is not None and (
        listing.price is None or listing.price > filters.max_price
    ):
        return False
    if filters.rooms and listing.rooms not in filters.rooms:
        return False
    if filters.include_keywords and not any(
        normalize_text(word).casefold() in haystack
        for word in filters.include_keywords
    ):
        return False
    if any(
        normalize_text(word).casefold() in haystack
        for word in filters.exclude_keywords
    ):
        return False
    return True


class ListingStore:
    def __init__(self, path: Path) -> None:
        self.connection = sqlite3.connect(path)
        self.connection.execute(
            """
            CREATE TABLE IF NOT EXISTS seen_listings (
                listing_key TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                source_id TEXT NOT NULL,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                first_seen_at TEXT NOT NULL,
                payload_json TEXT NOT NULL
            )
            """
        )
        self.connection.commit()

    def close(self) -> None:
        self.connection.close()

    def is_seen(self, listing: Listing) -> bool:
        row = self.connection.execute(
            "SELECT 1 FROM seen_listings WHERE listing_key = ?",
            (listing_key(listing),),
        ).fetchone()
        return row is not None

    def remember(self, listing: Listing) -> None:
        self.connection.execute(
            """
            INSERT OR IGNORE INTO seen_listings (
                listing_key, source, source_id, url, title, first_seen_at, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                listing_key(listing),
                listing.source,
                listing.source_id,
                normalize_url(listing.url),
                normalize_text(listing.title),
                datetime.now(timezone.utc).isoformat(),
                json.dumps(asdict(listing), ensure_ascii=False, sort_keys=True),
            ),
        )
        self.connection.commit()


def telegram_message(listing: Listing) -> str:
    price = "Цена не указана"
    if listing.price is not None:
        price = f"{listing.price:,}".replace(",", " ")
        if listing.currency:
            price += f" {listing.currency}"

    location = ", ".join(
        part for part in (listing.city, listing.district, listing.address) if part
    )
    details = [f"🏠 {normalize_text(listing.title)}", f"💰 {price}"]
    if location:
        details.append(f"📍 {normalize_text(location)}")
    if listing.rooms is not None:
        details.append(f"🚪 Комнат: {listing.rooms}")
    if listing.published_at:
        details.append(f"🕒 {normalize_text(listing.published_at)}")
    details.extend((f"Источник: {listing.source}", normalize_url(listing.url)))
    return "\n".join(details)


def send_telegram(message: str, image_url: str = "") -> None:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        raise RuntimeError("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required")

    method = "sendPhoto" if normalize_url(image_url) else "sendMessage"
    payload: dict[str, str] = {"chat_id": chat_id}
    if method == "sendPhoto":
        payload.update({"photo": normalize_url(image_url), "caption": message})
    else:
        payload["text"] = message

    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=urllib.parse.urlencode(payload).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        body = json.loads(response.read().decode("utf-8"))
    if not body.get("ok"):
        raise RuntimeError(f"Telegram API rejected message: {body}")


class DemoSource:
    name = "demo"

    def fetch(self) -> Iterable[Listing]:
        return (
            Listing(
                source="OLX demo",
                source_id="olx-101",
                title="Двухкомнатная квартира возле метро",
                url="https://example.com/listings/olx-101",
                price=18000,
                currency="UAH",
                city="Харьков",
                district="Шевченковский",
                rooms=2,
                address="ул. Демонстрационная, 10",
                image_url="https://example.com/images/olx-101.jpg",
                published_at="сегодня, 17:40",
            ),
            Listing(
                source="LUN demo",
                source_id="lun-202",
                title="Однокомнатная квартира, собственник",
                url="https://example.com/listings/lun-202",
                price=13000,
                currency="UAH",
                city="Харьков",
                district="Киевский",
                rooms=1,
                address="район метро Университет",
                published_at="сегодня, 17:45",
            ),
        )


def process_sources(
    sources: Iterable[ListingSource],
    store: ListingStore,
    filters: ListingFilters,
    dry_run: bool,
) -> tuple[int, int]:
    checked = 0
    sent = 0
    for source in sources:
        try:
            listings = source.fetch()
            for listing in listings:
                checked += 1
                if not normalize_url(listing.url):
                    print(f"skip invalid URL from {source.name}", file=sys.stderr)
                    continue
                if not matches_filters(listing, filters) or store.is_seen(listing):
                    continue
                message = telegram_message(listing)
                if dry_run:
                    print(message)
                    print("-" * 40)
                else:
                    send_telegram(message, listing.image_url)
                store.remember(listing)
                sent += 1
        except Exception as exc:  # adapter isolation: one source must not stop others
            print(f"source={source.name} error={exc}", file=sys.stderr)
    return checked, sent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rental listing monitor starter")
    parser.add_argument("--database", type=Path, default=Path("rental_monitor.sqlite3"))
    parser.add_argument("--demo", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--city", default="")
    parser.add_argument("--district", action="append", default=[])
    parser.add_argument("--min-price", type=int)
    parser.add_argument("--max-price", type=int)
    parser.add_argument("--rooms", type=int, action="append", default=[])
    parser.add_argument("--include", action="append", default=[])
    parser.add_argument("--exclude", action="append", default=[])
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.demo:
        print(
            "No real adapters are enabled. Add site adapters only after source rules and access are confirmed.",
            file=sys.stderr,
        )
        return 2

    filters = ListingFilters(
        city=args.city,
        districts=tuple(args.district),
        min_price=args.min_price,
        max_price=args.max_price,
        rooms=tuple(args.rooms),
        include_keywords=tuple(args.include),
        exclude_keywords=tuple(args.exclude),
    )
    store = ListingStore(args.database)
    try:
        checked, sent = process_sources((DemoSource(),), store, filters, args.dry_run)
    finally:
        store.close()
    print(f"checked={checked} new_sent={sent}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
