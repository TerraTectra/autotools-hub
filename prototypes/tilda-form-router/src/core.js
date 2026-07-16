import crypto from "node:crypto";

const RESERVED_FIELDS = new Set([
  "tranid",
  "formid",
  "formname",
  "tildaspec-formname",
  "tildaspec-referer",
  "tildaspec-cookie",
  "cookies",
]);

function firstValue(object, names) {
  for (const name of names) {
    const value = object?.[name];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function cleanString(value, maxLength = 2_000) {
  if (value == null) return "";
  return String(value).replace(/\0/g, "").trim().slice(0, maxLength);
}

export function normalizePhone(value) {
  const raw = cleanString(value, 100);
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  return raw.startsWith("+") ? `+${digits}` : digits;
}

export function normalizeEmail(value) {
  return cleanString(value, 320).toLowerCase();
}

export function parseUrlEncoded(raw) {
  const payload = {};
  const params = new URLSearchParams(raw);
  for (const [key, value] of params.entries()) {
    if (Object.hasOwn(payload, key)) {
      payload[key] = Array.isArray(payload[key]) ? [...payload[key], value] : [payload[key], value];
    } else {
      payload[key] = value;
    }
  }
  return payload;
}

export function normalizeTildaSubmission(payload, headers = {}) {
  const sourceUrl = cleanString(
    firstValue(payload, ["tildaspec-referer", "referer", "url", "Url"]) || headers.referer,
    2_000,
  );

  const fields = {};
  for (const [key, value] of Object.entries(payload || {})) {
    const normalizedKey = cleanString(key, 200);
    if (!normalizedKey || RESERVED_FIELDS.has(normalizedKey.toLowerCase())) continue;
    if (Array.isArray(value)) {
      fields[normalizedKey] = value.map((item) => cleanString(item)).filter(Boolean);
    } else {
      const cleaned = cleanString(value);
      if (cleaned) fields[normalizedKey] = cleaned;
    }
  }

  return {
    leadId: cleanString(firstValue(payload, ["tranid", "TranId", "lead_id"]), 200),
    formId: cleanString(firstValue(payload, ["formid", "FormId", "form_id"]), 200),
    formName: cleanString(firstValue(payload, ["formname", "tildaspec-formname", "FormName"]), 300),
    sourceUrl,
    name: cleanString(firstValue(payload, ["Name", "name", "Имя", "FullName"]), 300),
    phone: normalizePhone(firstValue(payload, ["Phone", "phone", "Телефон", "tel"])),
    email: normalizeEmail(firstValue(payload, ["Email", "email", "E-mail", "Почта"])),
    comment: cleanString(firstValue(payload, ["Comments", "Comment", "comment", "Message", "message"]), 4_000),
    fields,
    receivedAt: new Date().toISOString(),
  };
}

export function submissionKey(submission) {
  if (submission.leadId) return `tilda:${submission.leadId}`;
  const material = [
    submission.formId,
    submission.email,
    submission.phone,
    submission.name,
    submission.comment,
  ].join("|");
  return `hash:${crypto.createHash("sha256").update(material).digest("hex")}`;
}

export function buildTelegramMessage(submission) {
  const lines = ["🧾 Новая заявка с Tilda"];
  if (submission.formName || submission.formId) {
    lines.push(`Форма: ${submission.formName || submission.formId}`);
  }
  if (submission.name) lines.push(`Имя: ${submission.name}`);
  if (submission.phone) lines.push(`Телефон: ${submission.phone}`);
  if (submission.email) lines.push(`Email: ${submission.email}`);
  if (submission.comment) lines.push(`Комментарий: ${submission.comment}`);
  if (submission.sourceUrl) lines.push(`Страница: ${submission.sourceUrl}`);
  if (submission.leadId) lines.push(`Lead ID: ${submission.leadId}`);
  return lines.join("\n");
}

export function buildCrmPayload(submission) {
  return {
    event: "tilda_form_submission",
    externalId: submission.leadId || undefined,
    formId: submission.formId || undefined,
    formName: submission.formName || undefined,
    sourceUrl: submission.sourceUrl || undefined,
    receivedAt: submission.receivedAt,
    contact: {
      name: submission.name || undefined,
      phone: submission.phone || undefined,
      email: submission.email || undefined,
    },
    comment: submission.comment || undefined,
    fields: submission.fields,
  };
}

export function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
