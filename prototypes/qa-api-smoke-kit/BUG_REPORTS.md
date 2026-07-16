# Bug Report Examples

Ниже приведены **моделируемые учебные дефекты** для демонстрации формата. Они не описывают текущую реализацию `mock_api.py` и не относятся к реальному заказчику.

## BUG-001 — отрицательная сумма заказа принимается API

**Severity:** Critical  
**Priority:** High  
**Environment:** local, Python 3.11, Orders API v1

### Preconditions

API запущен на `http://127.0.0.1:8080`.

### Steps

1. Отправить `POST /api/v1/orders`.
2. Указать `Content-Type: application/json`.
3. Передать:

```json
{"customer_email":"qa@example.com","amount":-100}
```

### Actual result

API отвечает `201 Created` и сохраняет заказ с отрицательной суммой.

### Expected result

API отвечает `422 Unprocessable Entity`; в `details` указано поле `amount` и требование положительного значения.

### Impact

Некорректные финансовые данные попадают в последующие процессы и отчёты.

### Evidence

Сохранить request/response, `X-Request-Id`, время проверки и номер сборки.

---

## BUG-002 — ошибочные ответы не содержат X-Request-Id

**Severity:** Medium  
**Priority:** Medium  
**Environment:** local, Python 3.11, Orders API v1

### Steps

1. Отправить `GET /api/v1/orders/999`.
2. Проверить заголовки ответа.

### Actual result

API возвращает `404`, но заголовок `X-Request-Id` отсутствует.

### Expected result

Каждый ответ, включая 4xx/5xx, содержит непустой `X-Request-Id` для поиска запроса в логах.

### Impact

Поддержка и разработчики не могут быстро сопоставить пользовательскую ошибку с серверным событием.

### Regression check

Повторить для 400, 404, 415 и 422; убедиться, что идентификаторы непустые и различаются между запросами.
