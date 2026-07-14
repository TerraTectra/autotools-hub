# RetailCRM Marketplace submission package

Документ содержит готовые значения для карточки модуля в партнёрском кабинете. Значения цены, стран и раздела являются рекомендуемыми и окончательно подтверждаются после доступа в партнёрский кабинет.

## Системные данные

- **Символьный код:** `retailcrm-sla-guard`
- **Минимальная версия API:** `v5`
- **Простое подключение:** включено
- **Config URL:** `https://<production-domain>/marketplace/config`
- **Разрешения:** `order_read`, `integration_write`
- **Предпочтительный раздел:** управление заказами / автоматизация. Если подходящего раздела нет, согласовать раздел с модератором.
- **Страны запуска:** Россия, Казахстан, Беларусь. Расширять список после проверки доступности Telegram Bot API и поддержки в соответствующей стране.
- **Логотип:** требуется отдельный SVG без использования фирменного стиля RetailCRM.

## Цена

Рекомендуемый запуск:

- **Цена в месяц:** `1 990 ₽`
- **Цена со скидкой:** `1 490 ₽`
- **Пробный период:** `14 дней`

Логика цены: модуль решает одну конкретную операционную проблему, поэтому должен быть доступен небольшим интернет-магазинам, но при этом покрывать поддержку, инфраструктуру и сопровождение интеграции. Скидочную цену можно использовать на старте, стандартную — после получения первых подтверждённых кейсов.

---

# Материалы карточки — русский

## Название

**SLA Guard — контроль зависших заказов**

## Краткое описание

Автоматически отслеживает заказы, которые слишком долго остаются в одном статусе, и уведомляет ответственных в Telegram.

## Описание возможностей

SLA Guard помогает руководителям и отделам продаж быстрее находить забытые и задержанные заказы.

Возможности модуля:

- отдельный допустимый срок для каждого статуса заказа;
- регулярная проверка заказов через RetailCRM API v5;
- Telegram-уведомление при превышении установленного SLA;
- защита от повторных уведомлений до следующего изменения статуса;
- автоматическая остановка работы при выключении или заморозке модуля;
- поддержка переименования адреса CRM-аккаунта;
- безопасное простое подключение без ручной передачи API-ключа разработчику;
- шифрование API-ключей и Telegram-токенов при хранении;
- уведомления без имени клиента и суммы заказа по умолчанию;
- диагностические журналы без секретов и содержимого заказов.

Модуль не изменяет заказы и статусы в RetailCRM. Он только читает доступные данные и отправляет уведомления по правилам клиента.

## Описание установки

1. Нажмите **«Подключить»** в карточке модуля.
2. RetailCRM автоматически создаст API-ключ с разрешениями, необходимыми модулю.
3. На странице настроек укажите:
   - статусы и допустимое время в каждом статусе;
   - Telegram chat ID;
   - токен Telegram-бота.
4. При необходимости отдельно включите передачу имени клиента и суммы заказа в Telegram. По умолчанию эти данные не отправляются.
5. Сохраните настройки. Модуль начнёт проверять заказы автоматически.

Не требуется передавать разработчику логин или пароль от RetailCRM.

## Ограничения

- Для уведомлений требуется Telegram-бот и доступ к Telegram Bot API.
- Модуль видит только заказы, доступные API-ключу, созданному RetailCRM.
- Проверка выполняется периодически; уведомление может прийти с задержкой до установленного интервала опроса.
- При деактивации или заморозке модуль прекращает обработку аккаунта.
- Если Telegram или RetailCRM временно недоступны, модуль повторяет запросы; длительные внешние сбои могут задержать уведомления.
- Модуль не изменяет статусы и не назначает ответственных сотрудников.
- Имя клиента и сумма заказа передаются в Telegram только после явного включения этой настройки владельцем аккаунта.

---

# Marketplace materials — English

## Name

**SLA Guard — Stuck Order Monitoring**

## Short description

Monitors orders that remain in a status longer than allowed and notifies the responsible team in Telegram.

## Feature description

SLA Guard helps sales teams and supervisors detect forgotten or delayed orders before they become lost revenue.

The module provides:

- an individual time limit for each order status;
- periodic order checks through RetailCRM API v5;
- Telegram alerts when the configured SLA is exceeded;
- duplicate suppression until the order status changes again;
- automatic suspension when the module is disabled or frozen;
- CRM account URL update handling;
- secure one-click connection without manually sharing an API key with the developer;
- encryption at rest for API keys and Telegram bot tokens;
- privacy-safe alerts without customer name or order total by default;
- diagnostic logs that do not contain credentials or order contents.

The module does not change orders or statuses in RetailCRM. It reads the permitted data and sends alerts according to the customer's configuration.

## Installation description

1. Click **Connect** in the module card.
2. RetailCRM automatically creates an API key with the permissions required by the module.
3. On the settings page, provide:
   - status codes and the allowed time for each status;
   - Telegram chat ID;
   - Telegram bot token.
4. Customer name and order total can be enabled separately. They are excluded from alerts by default.
5. Save the settings. The module starts monitoring orders automatically.

The customer never needs to share a RetailCRM login or password with the developer.

## Limitations

- A Telegram bot and access to Telegram Bot API are required.
- The module can only read orders available to the API key created by RetailCRM.
- Checks are periodic, so an alert can be delayed by up to the configured polling interval.
- Processing stops when the module is disabled or frozen.
- Temporary RetailCRM or Telegram outages are retried, but extended third-party outages can delay alerts.
- The module does not change statuses or assign employees.
- Customer name and order total are sent to Telegram only after the account owner explicitly enables this option.

---

## URLs for the module card

Before moderation, replace placeholders with stable public HTTPS pages:

- **Support page:** `https://<production-domain>/support`
- **Documentation:** `https://<production-domain>/docs`
- **Configuration:** `https://<production-domain>/marketplace/config`

Until a public deployment exists, the repository documents can be used for internal review:

- `README.md`
- `SUPPORT.md`
- `PRIVACY.md`
- `MODERATION.md`
