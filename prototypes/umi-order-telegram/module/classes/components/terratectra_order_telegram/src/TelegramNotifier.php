<?php

declare(strict_types=1);

final class TerraTectraTelegramResult {
    public function __construct(
        public readonly bool $success,
        public readonly int $statusCode,
        public readonly string $body = '',
        public readonly ?string $error = null,
    ) {}
}

final class TerraTectraTelegramNotifier {
    /** @var callable(string,array<string,mixed>,int):TerraTectraTelegramResult */
    private $transport;

    /**
     * @param callable(string,array<string,mixed>,int):TerraTectraTelegramResult|null $transport
     */
    public function __construct(
        private readonly string $botToken,
        private readonly string $chatId,
        private readonly int $timeoutSeconds = 4,
        private readonly int $maxAttempts = 2,
        private readonly string $apiBase = 'https://api.telegram.org',
        ?callable $transport = null,
    ) {
        $this->transport = $transport ?? [$this, 'defaultTransport'];
    }

    public function isConfigured(): bool {
        return trim($this->botToken) !== '' && trim($this->chatId) !== '';
    }

    /** @param array<string,mixed> $order */
    public function sendOrderStatusChanged(array $order): TerraTectraTelegramResult {
        if (!$this->isConfigured()) {
            return new TerraTectraTelegramResult(false, 0, '', 'Telegram bot token or chat id is not configured');
        }

        $url = rtrim($this->apiBase, '/') . '/bot' . rawurlencode($this->botToken) . '/sendMessage';
        $payload = [
            'chat_id' => $this->chatId,
            'text' => self::formatMessage($order),
            'parse_mode' => 'HTML',
            'disable_web_page_preview' => true,
        ];

        $last = new TerraTectraTelegramResult(false, 0, '', 'No request attempted');
        $attempts = max(1, $this->maxAttempts);

        for ($attempt = 1; $attempt <= $attempts; $attempt++) {
            $last = ($this->transport)($url, $payload, $this->timeoutSeconds);
            if ($last->success) {
                return $last;
            }
            if ($last->statusCode > 0 && $last->statusCode !== 429 && $last->statusCode < 500) {
                return $last;
            }
            if ($attempt < $attempts) {
                usleep(150000 * $attempt);
            }
        }

        return $last;
    }

    /** @param array<string,mixed> $order */
    public static function formatMessage(array $order): string {
        $number = self::escape((string)($order['number'] ?? $order['id'] ?? '—'));
        $status = self::escape((string)($order['status'] ?? 'Неизвестен'));
        $oldStatus = self::escape((string)($order['old_status'] ?? 'Неизвестен'));
        $price = self::formatPrice($order['price'] ?? null, (string)($order['currency'] ?? 'RUB'));
        $adminUrl = trim((string)($order['admin_url'] ?? ''));

        $lines = [
            '<b>UMI.CMS: статус заказа изменён</b>',
            'Заказ: <b>#' . $number . '</b>',
            'Статус: ' . $oldStatus . ' → <b>' . $status . '</b>',
        ];

        if ($price !== '') {
            $lines[] = 'Сумма: <b>' . self::escape($price) . '</b>';
        }
        if ($adminUrl !== '') {
            $lines[] = '<a href="' . self::escapeAttribute($adminUrl) . '">Открыть заказ в UMI.CMS</a>';
        }
        if (!empty($order['customer']) && is_array($order['customer'])) {
            $customer = $order['customer'];
            $name = trim((string)($customer['name'] ?? ''));
            $phone = trim((string)($customer['phone'] ?? ''));
            $email = trim((string)($customer['email'] ?? ''));
            if ($name !== '') $lines[] = 'Клиент: ' . self::escape($name);
            if ($phone !== '') $lines[] = 'Телефон: <code>' . self::escape($phone) . '</code>';
            if ($email !== '') $lines[] = 'Email: <code>' . self::escape($email) . '</code>';
        }

        return implode("\n", $lines);
    }

    /** @param mixed $value */
    private static function formatPrice(mixed $value, string $currency): string {
        if ($value === null || $value === '' || !is_numeric($value)) return '';
        $formatted = number_format((float)$value, 2, '.', ' ');
        $formatted = preg_replace('/\.00$/', '', $formatted) ?? $formatted;
        $currency = strtoupper(trim($currency));
        return trim($formatted . ' ' . ($currency === 'RUB' ? '₽' : $currency));
    }

    private static function escape(string $value): string {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private static function escapeAttribute(string $value): string {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    /** @param array<string,mixed> $payload */
    private function defaultTransport(string $url, array $payload, int $timeoutSeconds): TerraTectraTelegramResult {
        $encoded = http_build_query($payload, '', '&', PHP_QUERY_RFC3986);

        if (function_exists('curl_init')) {
            $curl = curl_init($url);
            if ($curl === false) {
                return new TerraTectraTelegramResult(false, 0, '', 'Unable to initialize cURL');
            }
            curl_setopt_array($curl, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $encoded,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => max(1, $timeoutSeconds),
                CURLOPT_TIMEOUT => max(1, $timeoutSeconds),
                CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            ]);
            $body = curl_exec($curl);
            $error = curl_error($curl);
            $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
            curl_close($curl);
            if ($body === false) {
                return new TerraTectraTelegramResult(false, $status, '', $error ?: 'cURL request failed');
            }
            return new TerraTectraTelegramResult($status >= 200 && $status < 300, $status, (string)$body, $error ?: null);
        }

        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
                'content' => $encoded,
                'timeout' => max(1, $timeoutSeconds),
                'ignore_errors' => true,
            ],
        ]);
        $body = @file_get_contents($url, false, $context);
        $status = 0;
        foreach ($http_response_header ?? [] as $header) {
            if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $matches)) {
                $status = (int)$matches[1];
                break;
            }
        }
        if ($body === false) {
            return new TerraTectraTelegramResult(false, $status, '', 'HTTP request failed');
        }
        return new TerraTectraTelegramResult($status >= 200 && $status < 300, $status, (string)$body);
    }
}
