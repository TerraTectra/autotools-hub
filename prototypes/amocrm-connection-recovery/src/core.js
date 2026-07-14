export function normalizeBaseUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('AMOCRM_BASE_URL is required');
  const prepared = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(prepared);
  if (url.protocol !== 'https:') throw new Error('amoCRM URL must use HTTPS');
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function maskSecret(value) {
  const text = String(value ?? '');
  if (!text) return '(empty)';
  if (text.length <= 8) return '*'.repeat(text.length);
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

export function classifyCheck(status, body = {}) {
  if (status === 200) {
    return {
      code: 'connected',
      severity: 'ok',
      message: `Доступ работает${body?.name ? `: ${body.name}` : ''}`,
      next: 'Проверить endpoint, который создаёт сделки, и повторить тестовую заявку.'
    };
  }
  if (status === 401) {
    return {
      code: 'unauthorized',
      severity: 'error',
      message: 'amoCRM отклонила токен: доступ истёк, отозван или интеграция отключена.',
      next: 'Попробовать refresh token. Если он утрачен, уже использован или старше 3 месяцев — заново авторизовать интеграцию.'
    };
  }
  if (status === 403) {
    return {
      code: 'forbidden',
      severity: 'error',
      message: 'Токен принят, но у пользователя или интеграции недостаточно прав.',
      next: 'Проверить пользователя, разрешения интеграции и права на нужные сущности.'
    };
  }
  if (status === 404) {
    return {
      code: 'wrong-domain-or-path',
      severity: 'error',
      message: 'Не найден аккаунт или API-адрес.',
      next: 'Проверить поддомен amoCRM и отсутствие лишнего пути в AMOCRM_BASE_URL.'
    };
  }
  if (status === 429) {
    return {
      code: 'rate-limited',
      severity: 'warning',
      message: 'Превышен лимит запросов amoCRM.',
      next: 'Добавить backoff и повторить проверку позднее.'
    };
  }
  if (status >= 500) {
    return {
      code: 'remote-error',
      severity: 'warning',
      message: `Временная ошибка amoCRM (${status}).`,
      next: 'Повторить запрос с задержкой; не менять токены до повторной проверки.'
    };
  }
  return {
    code: 'unexpected-response',
    severity: 'error',
    message: `Неожиданный ответ amoCRM (${status}).`,
    next: 'Сохранить безопасный фрагмент ответа и проверить конфигурацию интеграции.'
  };
}

export function validateRefreshConfig(config) {
  const required = ['clientId', 'clientSecret', 'refreshToken', 'redirectUri'];
  const missing = required.filter((key) => !String(config[key] ?? '').trim());
  if (missing.length) throw new Error(`Missing refresh fields: ${missing.join(', ')}`);
  const redirect = new URL(config.redirectUri);
  if (redirect.protocol !== 'https:') throw new Error('redirectUri must use HTTPS');
  return true;
}

export function buildRefreshPayload(config) {
  validateRefreshConfig(config);
  return {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: config.refreshToken,
    redirect_uri: config.redirectUri
  };
}

export function classifyRefresh(status, body = {}) {
  if (status === 200 && body.access_token && body.refresh_token) {
    return {
      code: 'refreshed',
      severity: 'ok',
      message: 'Получена новая пара access/refresh token.',
      next: 'Атомарно сохранить оба новых токена и немедленно проверить GET /api/v4/account.'
    };
  }
  if (status === 400) {
    return {
      code: 'refresh-rejected',
      severity: 'error',
      message: 'Refresh token или параметры интеграции отклонены.',
      next: 'Не повторять старый refresh token циклически. Проверить client_id, secret, redirect URI; при утрате актуального refresh token пройти авторизацию заново.'
    };
  }
  return classifyCheck(status, body);
}

export function safeBody(body) {
  if (!body || typeof body !== 'object') return body;
  const hidden = new Set(['access_token', 'refresh_token', 'client_secret', 'token']);
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, hidden.has(key) ? '[REDACTED]' : value]));
}
