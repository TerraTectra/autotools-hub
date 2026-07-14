# RetailCRM Marketplace submission package

Документ содержит готовые значения для карточки модуля в партнёрском кабинете. Значения цены, стран и раздела являются рекомендуемыми и окончательно подтверждаются после доступа в партнёрский кабинет.

## Системные данные

- **Символьный код:** `retailcrm-sla-guard`
- **Минимальная версия API:** `v5`
- **Простое подключение:** включено
- **Config URL:** `https://<production-domain>/marketplace/config`
- **Разрешения:** `order_read`, `integration_write`
- **Предпочтительный раздел:** аналитика / управление заказами / автоматизация.
- **Страны запуска:** Россия, Казахстан, Беларусь. Расширять список после проверки доступности Telegram Bot API и поддержки в соответствующей стране.
- **Логотип:** `assets/logo.svg` — самостоятельный SVG без элементов фирменного стиля RetailCRM.

## Цена

Рекомендуемый запуск:

- **Цена в месяц:** `1 990 ₽`
- **Цена со скидкой:** `1 490 ₽`
- **Пробный период:** `14 дней`

Логика цены: продукт решает не только задачу уведомления, но и создаёт управленческую историю нарушений SLA. Цена должна оставаться доступной небольшим интернет-магазинам и покрывать поддержку, инфраструктуру и сопровождение интеграции.

---

# Материалы карточки — русский

## Название

**SLA Journal — журнал и аналитика задержек**

## Краткое описание

Фиксирует нарушения SLA по статусам заказов, показывает повторяющиеся узкие места и отправляет Telegram-эскалации руководителю.

## Описание возможностей

SLA Journal помогает руководителю видеть не только отдельный просроченный заказ, но и общую картину задержек в процессе обработки.

Возможности модуля:

- отдельный допустимый срок для каждого статуса заказа;
- регулярная проверка времени нахождения заказа в статусе через RetailCRM API v5;
- Telegram-эскалация при новом нарушении SLA;
- защита от повторных уведомлений до следующего изменения состояния заказа;
- обезличенный журнал до 1 000 последних инцидентов;
- показатели за 24 часа и 7 дней;
- средняя и максимальная длительность задержки;
- определение главного проблемного статуса;
- аналитика по статусам: частота, средняя и максимальная задержка;
- безопасный CSV-экспорт для операционных разборов;
- автоматическая остановка работы при выключении или заморозке модуля;
- поддержка переименования адреса CRM-аккаунта;
- безопасное простое подключение без ручной передачи API-ключа разработчику;
- шифрование API-ключей и Telegram-токенов при хранении;
- уведомления без имени клиента и суммы заказа по умолчанию;
- диагностические журналы без секретов и содержимого заказов.

Модуль не изменяет заказы и статусы в RetailCRM. Он читает разрешённые данные, фиксирует технические нарушения SLA и отправляет эскалации по правилам клиента.

## Чем отличается от обычного уведомления

Обычный триггер или Telegram-модуль сообщает об одном событии. SLA Journal дополнительно сохраняет историю, агрегирует задержки по статусам и даёт руководителю данные для поиска повторяющихся узких мест.

## Описание установки

1. Нажмите **«Подключить»** в карточке модуля.
2. RetailCRM автоматически создаст API-ключ с необходимыми разрешениями.
3. На странице настроек укажите:
   - статусы и допустимое время в каждом статусе;
   - Telegram chat ID;
   - токен Telegram-бота.
4. При необходимости отдельно включите передачу имени клиента и суммы заказа в Telegram. По умолчанию эти данные не отправляются и не попадают в журнал.
5. Сохраните настройки. Модуль начнёт проверять заказы автоматически.
6. На странице журнала доступны аналитика и CSV-экспорт.

Не требуется передавать разработчику логин или пароль от RetailCRM.

## Ограничения

- Для Telegram-эскалаций требуется Telegram-бот и доступ к Telegram Bot API.
- Модуль видит только заказы, доступные API-ключу, созданному RetailCRM.
- Проверка выполняется периодически; уведомление может прийти с задержкой до установленного интервала опроса.
- При деактивации или заморозке модуль прекращает обработку аккаунта.
- Если Telegram или RetailCRM временно недоступны, модуль повторяет запросы; длительные внешние сбои могут задержать уведомления.
- Модуль не изменяет статусы и не назначает ответственных сотрудников.
- Имя клиента и сумма заказа передаются в Telegram только после явного включения владельцем аккаунта и никогда не сохраняются в журнале инцидентов.
- Встроенная аналитика предназначена для операционного контроля и не заменяет полноценную BI-систему.

---

# Marketplace materials — English

## Name

**SLA Journal — Delay History and Analytics**

## Short description

Records order-status SLA breaches, highlights recurring bottlenecks and escalates new incidents to management in Telegram.

## Feature description

SLA Journal helps supervisors see not only one overdue order, but the recurring operational pattern behind delays.

The module provides:

- an individual time limit for each order status;
- periodic status-duration checks through RetailCRM API v5;
- Telegram escalation for newly detected SLA breaches;
- duplicate suppression until the order state changes again;
- a privacy-safe journal of up to 1,000 recent incidents;
- incident counts for the last 24 hours and 7 days;
- average and maximum delay duration;
- identification of the most problematic status;
- per-status frequency and delay analytics;
- spreadsheet-safe CSV export for operational reviews;
- automatic suspension when the module is disabled or frozen;
- CRM account URL update handling;
- secure one-click connection without manually sharing an API key with the developer;
- encryption at rest for API keys and Telegram bot tokens;
- privacy-safe alerts without customer name or order total by default;
- diagnostic logs that do not contain credentials or order contents.

The module does not change orders or statuses in RetailCRM. It reads permitted data, records technical SLA incidents and sends escalations according to the customer's configuration.

## Difference from a regular notification module

A trigger or notification module reports an individual event. SLA Journal additionally keeps a history, aggregates delays by status and gives supervisors data for identifying recurring operational bottlenecks.

## Installation description

1. Click **Connect** in the module card.
2. RetailCRM automatically creates an API key with the permissions required by the module.
3. On the settings page, provide:
   - status codes and the allowed time for each status;
   - Telegram chat ID;
   - Telegram bot token.
4. Customer name and order total can be enabled separately. They are excluded by default and are never stored in the incident journal.
5. Save the settings. The module starts monitoring orders automatically.
6. Open the journal page to review analytics or export CSV.

The customer never needs to share a RetailCRM login or password with the developer.

## Limitations

- A Telegram bot and access to Telegram Bot API are required for Telegram escalation.
- The module can only read orders available to the API key created by RetailCRM.
- Checks are periodic, so an alert can be delayed by up to the configured polling interval.
- Processing stops when the module is disabled or frozen.
- Temporary RetailCRM or Telegram outages are retried, but extended third-party outages can delay alerts.
- The module does not change statuses or assign employees.
- Customer name and order total are sent only after explicit opt-in and are never stored in the incident journal.
- Built-in analytics are intended for operational control and do not replace a full BI platform.

---

## URLs for the module card

Before moderation, replace placeholders with stable public HTTPS pages:

- **Support page:** `https://<production-domain>/support`
- **Documentation:** `https://<production-domain>/docs`
- **Configuration:** `https://<production-domain>/marketplace/config`

Public product demonstrations:

- **SLA check:** `https://terratectra.github.io/autotools-hub/site/`
- **Incident journal and analytics:** `https://terratectra.github.io/autotools-hub/site/incidents.html`

Until a public backend deployment exists, the repository documents can be used for internal review:

- `README.md`
- `SUPPORT.md`
- `PRIVACY.md`
- `MODERATION.md`
