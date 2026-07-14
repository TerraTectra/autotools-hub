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

export function summarizeIncidents(incidents, now = new Date()) {
  const source = Array.isArray(incidents) ? incidents : [];
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const statuses = new Map();
  let last24Hours = 0;
  let last7Days = 0;
  let validDelayCount = 0;
  let delayTotal = 0;
  let maxDelay = 0;

  for (const incident of source) {
    const detectedAt = new Date(incident?.detectedAt).getTime();
    if (Number.isFinite(detectedAt)) {
      if (detectedAt >= dayAgo) last24Hours += 1;
      if (detectedAt >= weekAgo) last7Days += 1;
    }

    const delay = Number(incident?.staleMinutes);
    if (Number.isFinite(delay) && delay >= 0) {
      validDelayCount += 1;
      delayTotal += delay;
      maxDelay = Math.max(maxDelay, delay);
    }

    const status = String(incident?.status || "unknown");
    const current = statuses.get(status) || {
      status,
      count: 0,
      delayTotal: 0,
      delayCount: 0,
      maxDelayMinutes: 0,
    };
    current.count += 1;
    if (Number.isFinite(delay) && delay >= 0) {
      current.delayTotal += delay;
      current.delayCount += 1;
      current.maxDelayMinutes = Math.max(current.maxDelayMinutes, delay);
    }
    statuses.set(status, current);
  }

  const byStatus = [...statuses.values()]
    .map(({ delayTotal: statusDelayTotal, delayCount, ...row }) => ({
      ...row,
      averageDelayMinutes: delayCount ? Math.round(statusDelayTotal / delayCount) : null,
    }))
    .sort((left, right) => right.count - left.count || left.status.localeCompare(right.status));

  return {
    total: source.length,
    last24Hours,
    last7Days,
    averageDelayMinutes: validDelayCount ? Math.round(delayTotal / validDelayCount) : null,
    maxDelayMinutes: validDelayCount ? maxDelay : null,
    topStatus: byStatus[0]?.status || null,
    byStatus,
  };
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
