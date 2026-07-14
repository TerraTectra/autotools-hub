import crypto from "node:crypto";

const MISSED_STATUSES = new Set([
  "missed",
  "no_answer",
  "not_answered",
  "unanswered",
  "busy",
  "failed",
  "cancelled",
]);

function firstValue(object, paths) {
  for (const path of paths) {
    const value = path.split(".").reduce((current, key) => current?.[key], object);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

export function normalizePhone(value) {
  if (value == null) return "";
  const raw = String(value).trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  return raw.startsWith("+") ? `+${digits}` : digits;
}

export function normalizeCallEvent(payload) {
  const root = payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
  const status = String(firstValue(root, [
    "status", "call_status", "result", "disposition", "event.status", "call.status",
  ]) || "unknown").toLowerCase();
  const direction = String(firstValue(root, [
    "direction", "call_direction", "type", "call.direction",
  ]) || "incoming").toLowerCase();
  const duration = Number(firstValue(root, [
    "duration", "talk_duration", "conversation_duration", "call.duration",
  ]) || 0);
  const answeredBy = firstValue(root, [
    "answered_by", "employee_id", "user_id", "operator.id", "call.answered_by",
  ]);
  const id = String(firstValue(root, [
    "call_id", "call_session_id", "session_id", "id", "call.id",
  ]) || "");

  return {
    id,
    status,
    direction,
    duration: Number.isFinite(duration) ? duration : 0,
    answeredBy: answeredBy == null ? "" : String(answeredBy),
    caller: normalizePhone(firstValue(root, [
      "caller", "caller_number", "from", "contact_phone", "call.from", "phone",
    ])),
    destination: normalizePhone(firstValue(root, [
      "called_number", "virtual_number", "to", "call.to", "destination",
    ])),
    startedAt: String(firstValue(root, [
      "started_at", "start_time", "start", "call.started_at", "timestamp",
    ]) || new Date().toISOString()),
    source: String(firstValue(root, ["source", "utm_source", "call.source"]) || "UIS"),
    raw: payload,
  };
}

export function isMissedIncomingCall(call) {
  const incoming = ["incoming", "in", "inbound"].includes(call.direction);
  const explicitMiss = MISSED_STATUSES.has(call.status);
  const noConversation = call.duration <= 0 && !call.answeredBy;
  return incoming && (explicitMiss || noConversation);
}

export function eventKey(call) {
  if (call.id) return `call:${call.id}`;
  return `fallback:${call.caller}:${call.destination}:${call.startedAt}`;
}

export function buildTelegramMessage(call) {
  return [
    "☎️ Пропущенный входящий звонок",
    `Клиент: ${call.caller || "номер не передан"}`,
    `Линия: ${call.destination || "не указана"}`,
    `Статус: ${call.status}`,
    `Время: ${call.startedAt}`,
    "Требуется обратный звонок.",
  ].join("\n");
}

export function buildCrmPayload(call) {
  return {
    event: "missed_call",
    externalId: call.id || undefined,
    phone: call.caller || undefined,
    destination: call.destination || undefined,
    occurredAt: call.startedAt,
    source: call.source,
    title: `Перезвонить: ${call.caller || "неизвестный номер"}`,
    comment: `Пропущенный звонок на ${call.destination || "линию"}; статус ${call.status}`,
  };
}

export function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
