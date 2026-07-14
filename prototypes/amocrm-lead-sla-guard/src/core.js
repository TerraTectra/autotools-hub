export function parseRules(raw, fallbackSeconds = 1800) {
  if (!raw || !raw.trim()) return { default: fallbackSeconds };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`SLA_RULES must be valid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("SLA_RULES must be a JSON object");
  }
  const result = {};
  for (const [key, value] of Object.entries(parsed)) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error(`Invalid SLA seconds for rule ${key}`);
    }
    result[String(key)] = seconds;
  }
  if (result.default === undefined) result.default = fallbackSeconds;
  return result;
}

export function thresholdForLead(lead, rules) {
  const exact = `${lead.pipeline_id}:${lead.status_id}`;
  if (rules[exact] !== undefined) return rules[exact];
  const status = String(lead.status_id);
  if (rules[status] !== undefined) return rules[status];
  return rules.default ?? 1800;
}

export function isLeadBreached(lead, options) {
  const now = options.nowSeconds;
  const closed = options.closedStatusIds ?? new Set();
  if (!lead || closed.has(Number(lead.status_id))) return false;
  if (!Number.isFinite(Number(lead.updated_at))) return false;

  const threshold = thresholdForLead(lead, options.rules);
  const staleFor = now - Number(lead.updated_at);
  if (staleFor < threshold) return false;

  const closestTaskAt = lead.closest_task_at;
  if (closestTaskAt !== null && closestTaskAt !== undefined && Number(closestTaskAt) >= now) {
    return false;
  }
  return true;
}

export function alertKey(lead) {
  return `${lead.id}:${lead.updated_at}`;
}

export function buildLeadUrl(baseUrl, leadId) {
  return `${baseUrl.replace(/\/$/, "")}/leads/detail/${leadId}`;
}

export function formatAlert(lead, baseUrl, nowSeconds) {
  const staleMinutes = Math.max(0, Math.floor((nowSeconds - Number(lead.updated_at)) / 60));
  const taskState = lead.closest_task_at ? "ближайшая задача просрочена" : "задача не назначена";
  return [
    "Нарушение SLA в amoCRM",
    `Сделка: ${lead.name || `#${lead.id}`}`,
    `ID: ${lead.id}`,
    `Без изменения: ${staleMinutes} мин.`,
    `Причина: ${taskState}`,
    `Ответственный: ${lead.responsible_user_id ?? "не указан"}`,
    buildLeadUrl(baseUrl, lead.id),
  ].join("\n");
}

export function buildTask(lead, nowSeconds, deadlineMinutes = 15) {
  return {
    task_type_id: 1,
    text: `Обработать просроченную сделку #${lead.id}: ${lead.name || "без названия"}`,
    complete_till: nowSeconds + Math.max(1, Number(deadlineMinutes)) * 60,
    entity_id: Number(lead.id),
    entity_type: "leads",
    responsible_user_id: Number(lead.responsible_user_id),
    request_id: `sla-${lead.id}-${lead.updated_at}`,
  };
}

export function normalizeLeads(payload) {
  const leads = payload?._embedded?.leads;
  return Array.isArray(leads) ? leads : [];
}
