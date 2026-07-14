# UMI.CMS Telegram Order Status

Proof of concept партнёрского модуля UMI.CMS: уведомления в Telegram при изменении статуса заказа.

## Возможности

- штатное событие `order-status-changed`;
- фильтр по ID статусов;
- номер, сумма, старый и новый статус;
- ссылка на карточку заказа в административной панели;
- персональные данные клиента отключены по умолчанию;
- HTML-экранирование сообщения;
- короткий timeout и повтор при `429`/`5xx`;
- ошибка Telegram не прерывает изменение заказа;
- cURL с резервным HTTP transport;
- автономные unit-тесты.

## Установка PoC

Скопировать содержимое каталога `module/` в корень UMI.CMS, затем установить:

```text
classes/components/terratectra_order_telegram/install.php
```

Путь вводится в `/admin/config/modules`.

Настройки хранятся в реестре:

```text
//modules/terratectra_order_telegram/telegram/enabled
//modules/terratectra_order_telegram/telegram/bot_token
//modules/terratectra_order_telegram/telegram/chat_id
//modules/terratectra_order_telegram/telegram/status_ids
//modules/terratectra_order_telegram/telegram/include_customer
//modules/terratectra_order_telegram/telegram/timeout
//modules/terratectra_order_telegram/telegram/site_host
```

Версия для UMI.Market после проверки на NFR-контуре должна получить административную форму настроек и tar-пакет через официальный экспортёр.

## Проверка

```bash
find module -name '*.php' -print0 | xargs -0 -n1 php -l
php tests/run.php
sh scripts/preflight.sh
```

Дополнительные материалы:

- [чек-лист NFR-проверки и подачи в UMI.Market](SUBMISSION.md);
- [готовые значения для анкеты партнёра](../../docs/UMI_PARTNER_APPLICATION.md);
- [текст карточки и профиля разработчика](../../docs/UMI_PARTNER_PROFILE.md).

## Коммерческая модель

- лицензия модуля: ориентир **3 900 ₽**;
- установка и настройка: **5 000 ₽**;
- адаптация текста, маршрутизация по чатам и дополнительные события: от **7 000 ₽**;
- white-label версия для интегратора: от **12 000 ₽**.

Production-использование требует письменной лицензии. Токены и данные клиентов в репозиторий не добавляются.
