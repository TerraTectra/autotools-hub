import test from "node:test";
import assert from "node:assert/strict";
import {
  alertKey,
  buildAlert,
  buildOrdersUrl,
  collectNewAlerts,
  isStaleOrder,
  parseRules,
} from "../src/core.js";

const now = new Date("2026-07-14T12:00:00Z");
const order = {
  id: 42,
  number: "A-42",
  extendedStatus: "new",
  statusUpdatedAt: "2026-07-14T10:00:00Z",
  firstName: "Иван",
  lastName: "Петров",
  totalSumm: 12500,
  currency: "RUB",
};

test("parses SLA rules", () => {
  assert.deepEqual([...parseRules("new:30, assembling:120")], [["new", 30], ["assembling", 120]]);
  assert.throws(() => parseRules("new:nope"), /Invalid SLA rule/);
});

test("detects an order that exceeded its status SLA", () => {
  assert.equal(isStaleOrder(order, parseRules("new:30"), now), true);
  assert.equal(isStaleOrder(order, parseRules("new:180"), now), false);
});

test("builds the documented API v5 orders URL", () => {
  const url = buildOrdersUrl("https://demo.retailcrm.pro", "secret", 2, 50);
  assert.equal(url.pathname, "/api/v5/orders");
  assert.equal(url.searchParams.get("apiKey"), "secret");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("limit"), "50");
});

test("deduplicates alerts by order status update", () => {
  const key = alertKey(order);
  assert.equal(collectNewAlerts([order], parseRules("new:30"), new Set(), now).length, 1);
  assert.equal(collectNewAlerts([order], parseRules("new:30"), new Set([key]), now).length, 0);
});

test("formats a useful Telegram alert", () => {
  const text = buildAlert(order, now);
  assert.match(text, /A-42/);
  assert.match(text, /120 мин/);
  assert.match(text, /Иван Петров/);
  assert.match(text, /12\s?500 RUB/);
});
