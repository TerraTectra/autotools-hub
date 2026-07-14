const DAY_MS = 86_400_000;

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field.trim());
      field = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field.trim());
    if (row.some((value) => value !== '')) rows.push(row);
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

export function normalizeHeader(value) {
  return value.toLowerCase().trim().replace(/[\s./-]+/g, '_');
}

export function parseDate(value) {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && String(value).trim() !== '') {
    const millis = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseMoney(value) {
  if (!value) return 0;
  const normalized = String(value).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

export function normalizeRecord(raw, mapping = {}) {
  const read = (...keys) => {
    for (const key of keys) {
      const mapped = mapping[key];
      if (mapped && raw[mapped] !== undefined) return raw[mapped];
      if (raw[key] !== undefined) return raw[key];
    }
    return '';
  };

  return {
    id: read('id', 'lead_id', 'deal_id') || 'unknown',
    name: read('name', 'title', 'lead_name', 'deal_name') || 'Без названия',
    status: read('status', 'stage', 'stage_name', 'status_name') || 'Не указан',
    owner: read('owner', 'responsible', 'responsible_name', 'manager') || 'Не назначен',
    amount: parseMoney(read('amount', 'price', 'budget', 'revenue')),
    createdAt: parseDate(read('created_at', 'created', 'date_created')),
    updatedAt: parseDate(read('updated_at', 'updated', 'date_modified', 'modified_at')),
    nextTaskAt: parseDate(read('next_task_at', 'closest_task_at', 'task_due_at', 'next_action_at')),
    closed: /closed|won|lost|успеш|реализ|закрыт|проигран/i.test(read('closed', 'status', 'stage', 'stage_name')),
  };
}

export function analyze(records, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const staleDays = Number(options.staleDays ?? 7);
  const noTaskDays = Number(options.noTaskDays ?? 2);
  const active = records.filter((record) => !record.closed);

  const enriched = active.map((record) => {
    const updated = record.updatedAt ?? record.createdAt;
    const ageDays = updated ? Math.max(0, Math.floor((now - updated) / DAY_MS)) : null;
    const createdAgeDays = record.createdAt ? Math.max(0, Math.floor((now - record.createdAt) / DAY_MS)) : null;
    const taskMissing = !record.nextTaskAt && (createdAgeDays === null || createdAgeDays >= noTaskDays);
    const taskOverdue = record.nextTaskAt ? record.nextTaskAt < now : false;
    const stale = ageDays === null || ageDays >= staleDays;
    const riskScore = (stale ? 3 : 0) + (taskMissing ? 3 : 0) + (taskOverdue ? 2 : 0) + (record.amount > 0 ? 1 : 0);
    return { ...record, ageDays, taskMissing, taskOverdue, stale, riskScore };
  });

  const risky = enriched.filter((record) => record.riskScore >= 3).sort((a, b) => b.riskScore - a.riskScore || b.amount - a.amount);
  const ownerStats = new Map();
  for (const record of enriched) {
    const current = ownerStats.get(record.owner) ?? { owner: record.owner, active: 0, stale: 0, withoutTask: 0, overdueTask: 0, amountAtRisk: 0 };
    current.active += 1;
    if (record.stale) current.stale += 1;
    if (record.taskMissing) current.withoutTask += 1;
    if (record.taskOverdue) current.overdueTask += 1;
    if (record.riskScore >= 3) current.amountAtRisk += record.amount;
    ownerStats.set(record.owner, current);
  }

  return {
    generatedAt: now.toISOString(),
    totals: {
      rows: records.length,
      active: enriched.length,
      risky: risky.length,
      stale: enriched.filter((record) => record.stale).length,
      withoutTask: enriched.filter((record) => record.taskMissing).length,
      overdueTask: enriched.filter((record) => record.taskOverdue).length,
      amountAtRisk: risky.reduce((sum, record) => sum + record.amount, 0),
    },
    risky,
    ownerStats: [...ownerStats.values()].sort((a, b) => b.amountAtRisk - a.amountAtRisk || b.stale - a.stale),
  };
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

export function money(value) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value) + ' ₽';
}

export function renderHtml(report) {
  const metric = (label, value) => `<div class="metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
  const riskyRows = report.risky.slice(0, 200).map((r) => `<tr><td>${escapeHtml(r.id)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.owner)}</td><td>${r.ageDays ?? '—'}</td><td>${r.taskMissing ? 'Нет' : r.taskOverdue ? 'Просрочена' : 'Есть'}</td><td>${money(r.amount)}</td><td>${r.riskScore}</td></tr>`).join('');
  const ownerRows = report.ownerStats.map((r) => `<tr><td>${escapeHtml(r.owner)}</td><td>${r.active}</td><td>${r.stale}</td><td>${r.withoutTask}</td><td>${r.overdueTask}</td><td>${money(r.amountAtRisk)}</td></tr>`).join('');

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CRM Pipeline Audit</title><style>body{font-family:Arial,sans-serif;margin:0;background:#f5f7fa;color:#17202a}.wrap{max-width:1180px;margin:auto;padding:32px}.hero{background:#fff;padding:28px;border-radius:16px;box-shadow:0 4px 18px #0001}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:20px 0}.metric{background:#eef2f7;padding:16px;border-radius:12px}.metric strong{display:block;font-size:24px}.metric span{font-size:13px;color:#52606d}.card{background:#fff;padding:22px;border-radius:16px;margin-top:18px;overflow:auto;box-shadow:0 4px 18px #0001}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;border-bottom:1px solid #e6e9ed;padding:10px}th{position:sticky;top:0;background:#fff}.note{color:#52606d;font-size:13px}</style></head><body><div class="wrap"><section class="hero"><h1>Аудит CRM-воронки</h1><p>Отчёт сформирован ${escapeHtml(report.generatedAt)}. Анализ выполняется локально по CSV и не требует доступа к CRM.</p><div class="metrics">${metric('строк в выгрузке', report.totals.rows)}${metric('активных сделок', report.totals.active)}${metric('сделок в зоне риска', report.totals.risky)}${metric('зависших сделок', report.totals.stale)}${metric('без следующей задачи', report.totals.withoutTask)}${metric('сумма под риском', money(report.totals.amountAtRisk))}</div><p class="note">Сделка считается рискованной при длительном отсутствии изменений, отсутствии следующей задачи или просроченной задаче. Порог настраивается.</p></section><section class="card"><h2>Менеджеры</h2><table><thead><tr><th>Ответственный</th><th>Активные</th><th>Зависшие</th><th>Без задачи</th><th>Просроченные задачи</th><th>Сумма под риском</th></tr></thead><tbody>${ownerRows}</tbody></table></section><section class="card"><h2>Сделки, требующие внимания</h2><table><thead><tr><th>ID</th><th>Название</th><th>Этап</th><th>Ответственный</th><th>Дней без изменений</th><th>Задача</th><th>Сумма</th><th>Риск</th></tr></thead><tbody>${riskyRows}</tbody></table></section></div></body></html>`;
}
