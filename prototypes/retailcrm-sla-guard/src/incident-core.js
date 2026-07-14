import { alertKey, orderStatus, staleMinutes } from "./core.js";

export const MAX_INCIDENTS = 1000;

export function buildIncident(order, detectedAt = new Date()) {
  return {
    key: alertKey(order),
    orderId: String(order.id ?? ""),
    orderNumber: String(order.number || order.externalId || order.id || "unknown"),
    status: orderStatus(order),
    statusUpdatedAt: order.statusUpdatedAt || null,
    staleMinutes: staleMinutes(order, detectedAt),
    detectedAt: detectedAt.toISOString(),
  };
}

export function appendIncidents(existing, orders, detectedAt = new Date(), limit = MAX_INCIDENTS) {
  const current = Array.isArray(existing) ? existing : [];
  const knownKeys = new Set(current.map((incident) => incident.key));
  const created = [];
  for (const order of orders || []) {
    const incident = buildIncident(order, detectedAt);
    if (knownKeys.has(incident.key)) continue;
    knownKeys.add(incident.key);
    created.push(incident);
  }
  return [...created.reverse(), ...current].slice(0, Math.max(1, limit));
}

function csvCell(value) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function incidentsToCsv(incidents) {
  const rows = [
    ["detectedAt", "orderNumber", "status", "staleMinutes", "statusUpdatedAt"],
    ...(Array.isArray(incidents) ? incidents : []).map((incident) => [
      incident.detectedAt,
      incident.orderNumber,
      incident.status,
      incident.staleMinutes,
      incident.statusUpdatedAt,
    ]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}
