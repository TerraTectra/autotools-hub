export function detectDelimiter(text) {
  const line = String(text).split(/\r?\n/, 1)[0] || '';
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = -1;
  for (const delimiter of candidates) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] === '"') {
        if (quoted && line[i + 1] === '"') i += 1;
        else quoted = !quoted;
      } else if (!quoted && line[i] === delimiter) count += 1;
    }
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

export function parseDelimited(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = String(text).replace(/^\uFEFF/, '');

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((value) => String(value).trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((value) => String(value).trim() !== '')) rows.push(row);
  }

  if (rows.length < 2) return { delimiter, headers: [], records: [] };
  const headers = rows[0].map(normalizeHeader);
  const records = rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? '').trim()])));
  return { delimiter, headers, records };
}

export function normalizeHeader(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[ё]/g, 'е')
    .replace(/[\s./\\-]+/g, '_')
    .replace(/[^a-zа-я0-9_]/giu, '');
}

export function normalizeEmail(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return { value: '', valid: false, empty: true };
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(raw);
  return { value: valid ? raw : '', valid, empty: false };
}

export function normalizePhone(value, defaultCountryCode = '7') {
  const raw = String(value ?? '').trim();
  if (!raw) return { value: '', valid: false, empty: true };
  let digits = raw.replace(/\D/g, '');
  if (defaultCountryCode === '7') {
    if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
    else if (digits.length === 10) digits = `7${digits}`;
  }
  const valid = digits.length >= 10 && digits.length <= 15;
  return { value: valid ? `+${digits}` : '', valid, empty: false };
}

function firstValue(record, aliases) {
  for (const alias of aliases) {
    const value = record[alias];
    if (value !== undefined && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

export function parseDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{10}$/.test(raw)) return new Date(Number(raw) * 1000);
  if (/^\d{13}$/.test(raw)) return new Date(Number(raw));
  const normalized = raw.match(/^\d{2}\.\d{2}\.\d{4}/)
    ? raw.replace(/^(\d{2})\.(\d{2})\.(\d{4})/, '$3-$2-$1')
    : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseMoney(value) {
  const normalized = String(value ?? '').replace(/[^0-9,.-]/g, '').replace(',', '.');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

const aliases = {
  email: ['email', 'e_mail', 'mail', 'contact_email', 'электронная_почта', 'почта'],
  phone: ['phone', 'telephone', 'mobile', 'contact_phone', 'телефон', 'мобильный'],
  updated: ['updated_at', 'updated', 'date_update', 'last_activity', 'last_modified', 'дата_изменения', 'изменен'],
  nextTask: ['next_task_at', 'closest_task_at', 'task_date', 'next_activity', 'дата_задачи', 'следующая_задача'],
  amount: ['amount', 'price', 'budget', 'opportunity', 'total', 'сумма', 'бюджет'],
  status: ['status', 'stage', 'status_name', 'stage_name', 'статус', 'этап'],
};

function isClosedStatus(value) {
  const status = String(value ?? '').trim().toLowerCase();
  return /успеш|закрыт|заверш|реализ|won|closed|paid|доставлен/.test(status);
}

export function analyzeRecords(records, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const staleDays = Number(options.staleDays ?? 7);
  const staleMs = Math.max(1, staleDays) * 86400000;
  const seenEmails = new Map();
  const seenPhones = new Map();
  let duplicateEmails = 0;
  let duplicatePhones = 0;
  let invalidEmails = 0;
  let invalidPhones = 0;
  let rowsWithoutContact = 0;
  let staleDeals = 0;
  let missingNextTask = 0;
  let overdueTasks = 0;
  let riskAmount = 0;
  let detectedDeals = 0;

  for (const record of records) {
    const emailRaw = firstValue(record, aliases.email);
    const phoneRaw = firstValue(record, aliases.phone);
    const email = normalizeEmail(emailRaw);
    const phone = normalizePhone(phoneRaw);

    if (!email.empty && !email.valid) invalidEmails += 1;
    if (!phone.empty && !phone.valid) invalidPhones += 1;
    if (!email.value && !phone.value) rowsWithoutContact += 1;

    if (email.value) {
      if (seenEmails.has(email.value)) duplicateEmails += 1;
      seenEmails.set(email.value, (seenEmails.get(email.value) ?? 0) + 1);
    }
    if (phone.value) {
      if (seenPhones.has(phone.value)) duplicatePhones += 1;
      seenPhones.set(phone.value, (seenPhones.get(phone.value) ?? 0) + 1);
    }

    const updatedRaw = firstValue(record, aliases.updated);
    const taskRaw = firstValue(record, aliases.nextTask);
    const amountRaw = firstValue(record, aliases.amount);
    const statusRaw = firstValue(record, aliases.status);
    const hasDealFields = Boolean(updatedRaw || taskRaw || amountRaw || statusRaw);
    if (!hasDealFields || isClosedStatus(statusRaw)) continue;
    detectedDeals += 1;

    const updated = parseDate(updatedRaw);
    const nextTask = parseDate(taskRaw);
    const stale = updated ? now.getTime() - updated.getTime() > staleMs : false;
    const missingTask = !taskRaw;
    const overdue = nextTask ? nextTask.getTime() < now.getTime() : false;
    if (stale) staleDeals += 1;
    if (missingTask) missingNextTask += 1;
    if (overdue) overdueTasks += 1;
    if (stale || missingTask || overdue) riskAmount += parseMoney(amountRaw);
  }

  const issueScore = duplicateEmails + duplicatePhones + invalidEmails + invalidPhones + rowsWithoutContact + staleDeals + missingNextTask + overdueTasks;
  return {
    rows: records.length,
    uniqueEmails: seenEmails.size,
    uniquePhones: seenPhones.size,
    duplicateEmails,
    duplicatePhones,
    invalidEmails,
    invalidPhones,
    rowsWithoutContact,
    detectedDeals,
    staleDeals,
    missingNextTask,
    overdueTasks,
    riskAmount,
    issueScore,
    health: issueScore === 0 ? 'good' : issueScore <= Math.max(3, records.length * 0.05) ? 'attention' : 'risk',
  };
}

export function formatMoney(value) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Number(value) || 0) + ' ₽';
}
