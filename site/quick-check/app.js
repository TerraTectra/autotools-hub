import { analyzeRecords, formatMoney, parseDelimited } from './core.js';

const input = document.querySelector('#file');
const drop = document.querySelector('#drop');
const results = document.querySelector('#results');
const status = document.querySelector('#status');
const staleDays = document.querySelector('#stale-days');
const sampleButton = document.querySelector('#sample');

const sample = `name,email,phone,status,amount,updated_at,next_task_at\nИван,ivan@example.com,89991234567,В работе,120000,2026-06-20,\nИван дубль,IVAN@example.com,+7 999 123-45-67,В работе,120000,2026-06-20,2026-07-01\nООО Тест,bad-email,123,Новый,85000,2026-07-13,\nКлиент,new@example.com,9992223344,Успешно реализовано,50000,2026-07-14,2026-07-15`;

function metric(label, value, problem = false) {
  return `<article class="metric ${problem ? 'problem' : ''}"><span>${label}</span><strong>${value}</strong></article>`;
}

function recommendation(report) {
  const items = [];
  if (report.duplicateEmails || report.duplicatePhones) items.push('Объединить дубли по нормализованным email и телефонам до следующего импорта или рассылки.');
  if (report.invalidEmails || report.invalidPhones) items.push('Отделить невалидные контакты и не передавать их в рассылки и телефонию до исправления.');
  if (report.rowsWithoutContact) items.push('Проверить строки без email и телефона: они не пригодны для коммуникации и часто создают шум в CRM.');
  if (report.staleDeals || report.missingNextTask || report.overdueTasks) items.push('Назначить ответственных и следующие действия для сделок в зоне риска.');
  if (!items.length) items.push('Критичных проблем в выборке не обнаружено. Для полной проверки используйте выгрузку за нужный период.');
  return items;
}

function render(report, fileName) {
  const healthText = report.health === 'good' ? 'Состояние выглядит хорошим' : report.health === 'attention' ? 'Есть точки для проверки' : 'Обнаружен заметный риск';
  results.hidden = false;
  results.innerHTML = `
    <header class="result-head"><div><small>${fileName}</small><h2>${healthText}</h2></div><span class="badge ${report.health}">${report.issueScore} сигналов</span></header>
    <div class="metrics">
      ${metric('Строк', report.rows)}
      ${metric('Дубли email', report.duplicateEmails, report.duplicateEmails > 0)}
      ${metric('Дубли телефонов', report.duplicatePhones, report.duplicatePhones > 0)}
      ${metric('Невалидные email', report.invalidEmails, report.invalidEmails > 0)}
      ${metric('Невалидные телефоны', report.invalidPhones, report.invalidPhones > 0)}
      ${metric('Без контактов', report.rowsWithoutContact, report.rowsWithoutContact > 0)}
      ${metric('Зависшие сделки', report.staleDeals, report.staleDeals > 0)}
      ${metric('Без следующей задачи', report.missingNextTask, report.missingNextTask > 0)}
      ${metric('Просроченные задачи', report.overdueTasks, report.overdueTasks > 0)}
      ${metric('Сумма под риском', formatMoney(report.riskAmount), report.riskAmount > 0)}
    </div>
    <section class="recommendations"><h3>Что делать дальше</h3><ol>${recommendation(report).map((item) => `<li>${item}</li>`).join('')}</ol></section>
    <section class="cta"><div><strong>Нужен полный результат?</strong><p>Очистка базы — от 3 000 ₽. Аудит CRM — 5 000 ₽. Пакет — 7 000 ₽.</p></div><div class="actions"><a href="mailto:nikidom123@gmail.com?subject=CRM%20Quick%20Check%20%E2%80%94%20%D0%BF%D0%BE%D0%BB%D0%BD%D1%8B%D0%B9%20%D0%B0%D1%83%D0%B4%D0%B8%D1%82">Написать по email</a><a href="https://t.me/tahioff" target="_blank" rel="noreferrer">Telegram</a></div></section>`;
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function processText(text, fileName) {
  try {
    const parsed = parseDelimited(text);
    if (!parsed.records.length) throw new Error('В файле не найдено строк данных.');
    const report = analyzeRecords(parsed.records, { staleDays: Number(staleDays.value || 7) });
    status.textContent = `Обработано локально: ${parsed.records.length} строк. Данные не отправлялись в сеть.`;
    render(report, fileName);
  } catch (error) {
    status.textContent = `Ошибка: ${error.message}`;
    results.hidden = true;
  }
}

async function processFile(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    status.textContent = 'Файл слишком большой для бесплатной браузерной проверки. Максимум — 20 МБ.';
    return;
  }
  status.textContent = 'Читаю файл локально…';
  processText(await file.text(), file.name);
}

input.addEventListener('change', () => processFile(input.files?.[0]));
sampleButton.addEventListener('click', () => processText(sample, 'демонстрационная выборка.csv'));
for (const event of ['dragenter', 'dragover']) drop.addEventListener(event, (e) => { e.preventDefault(); drop.classList.add('drag'); });
for (const event of ['dragleave', 'drop']) drop.addEventListener(event, (e) => { e.preventDefault(); drop.classList.remove('drag'); });
drop.addEventListener('drop', (event) => processFile(event.dataTransfer?.files?.[0]));
