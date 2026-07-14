/**
 * Parse comma-separated SLA rules: status:minutes,status:minutes.
 * Example: new:30,assembling:120
 */
export function parseRules(value) {
  if (!value?.trim()) return new Map();
  const rules = new Map();

  for (const rawRule of value.split(",")) {
    const [status, rawMinutes] = rawRule.split(":").map((part) => part.trim());
    const minutes = Number(rawMinutes);
    if (!status || !Number.isFinite(minutes) || minutes <= 0) {
      throw new Error(`Invalid SLA rule: ${rawRule}`);
    }
    rules.set(status, minutes);
  }

  return rules;
}

export function parseRetailCrmDate(value) {
  if (!value) return null;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function orderStatus(order) {
  return order.extendedStatus || order.status || "unknown";
}

export function staleMinutes(order, now = new Date()) {
  const updatedAt = parseRetailCrmDate(order.statusUpdatedAt);
  if (!updatedAt) return null;
  return Math.floor((now.getTime() - updatedAt.getTime()) / 60_000);
}

export function isStaleOrder(order, rules, now = new Date()) {
  const status = orderStatus(order);
  const threshold = rules.get(status);
  const elapsed = staleMinutes(order, now);
  return threshold != null && elapsed != null && elapsed >= threshold;
}

export function alertKey(order) {
  return `${order.id}:${orderStatus(order)}:${order.statusUpdatedAt || "unknown"}`;
}

export function buildAlert(
  order,
  now = new Date(),
  { includeCustomerData = true } = {},
) {
  const elapsed = staleMinutes(order, now);
  const number = order.number || order.externalId || order.id;
  const lines = [
    "⚠️ RetailCRM: заказ превысил SLA",
    `Заказ: ${number}`,
    `Статус: ${orderStatus(order)}`,
    `Без изменения: ${elapsed ?? "?"} мин.`,
  ];

  if (includeCustomerData) {
    const customer = [order.firstName, order.lastName].filter(Boolean).join(" ") || "не указан";
    const total = Number.isFinite(Number(order.totalSumm))
      ? `${Number(order.totalSumm).toLocaleString("ru-RU")} ${order.currency || "RUB"}`
      : "не указана";
    lines.push(`Клиент: ${customer}`, `Сумма: ${total}`);
  }

  return lines.join("\n");
}

export function buildOrdersUrl(baseUrl, apiKey, page = 1, limit = 100) {
  const url = new URL("/api/v5/orders", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  return url;
}

export function collectNewAlerts(orders, rules, sentKeys, now = new Date()) {
  return orders
    .filter((order) => isStaleOrder(order, rules, now))
    .filter((order) => !sentKeys.has(alertKey(order)));
}
