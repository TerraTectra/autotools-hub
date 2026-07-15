<?php

declare(strict_types=1);

require_once __DIR__ . '/../module/classes/components/terratectra_order_telegram/src/TelegramNotifier.php';
require_once __DIR__ . '/../module/classes/components/terratectra_order_telegram/src/OrderAdapter.php';

$tests = [];
function test(string $name, callable $callback): void { global $tests; $tests[] = [$name, $callback]; }
function same(mixed $expected, mixed $actual, string $message = ''): void {
    if ($expected !== $actual) throw new RuntimeException($message ?: 'Expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
}
function truthy(bool $value, string $message = ''): void { if (!$value) throw new RuntimeException($message ?: 'Expected true'); }

final class FakeOrder {
    public function getId(): int { return 42; }
    public function getNumber(): string { return 'A-42'; }
    public function getActualPrice(): float { return 12500.0; }
    public function getValue(string $field): mixed { return $field === 'customer_id' ? 0 : null; }
}

test('formats HTML and escapes unsafe values', function (): void {
    $text = TerraTectraTelegramNotifier::formatMessage([
        'number' => '<42>', 'old_status' => 'Новый', 'status' => 'Оплачен & готов',
        'price' => 12500, 'currency' => 'RUB', 'admin_url' => 'https://example.test/?a=1&b=2',
    ]);
    truthy(str_contains($text, '&lt;42&gt;'));
    truthy(str_contains($text, 'Оплачен &amp; готов'));
    truthy(str_contains($text, '12 500 ₽'));
    truthy(str_contains($text, 'a=1&amp;b=2'));
});

test('does not include customer unless explicitly passed', function (): void {
    $text = TerraTectraTelegramNotifier::formatMessage(['number' => '1', 'status' => 'Новый', 'old_status' => 'Корзина']);
    truthy(!str_contains($text, 'Клиент:'));
});

test('filters status ids', function (): void {
    truthy(TerraTectraUmiOrderAdapter::statusAllowed(10, '10,20'));
    truthy(!TerraTectraUmiOrderAdapter::statusAllowed(30, '10,20'));
    truthy(TerraTectraUmiOrderAdapter::statusAllowed(30, ''));
});

test('adapts order with safe fallbacks', function (): void {
    $data = TerraTectraUmiOrderAdapter::adapt(new FakeOrder(), 1, 2, ['host' => 'shop.test', 'https' => true]);
    same(42, $data['id']);
    same('A-42', $data['number']);
    same(12500.0, $data['price']);
    same('#1', $data['old_status']);
    same('#2', $data['status']);
    same('https://shop.test/admin/emarket/order_edit/42/', $data['admin_url']);
});

test('returns configuration error without secrets', function (): void {
    $notifier = new TerraTectraTelegramNotifier('', '');
    $result = $notifier->sendOrderStatusChanged(['number' => '1']);
    truthy(!$result->success);
    same(0, $result->statusCode);
});

test('retries temporary Telegram error', function (): void {
    $calls = 0;
    $transport = function (string $url, array $payload, int $timeout) use (&$calls): TerraTectraTelegramResult {
        $calls++;
        truthy(str_contains($url, '/sendMessage'));
        same('HTML', $payload['parse_mode']);
        return $calls === 1
            ? new TerraTectraTelegramResult(false, 500, 'temporary')
            : new TerraTectraTelegramResult(true, 200, '{"ok":true}');
    };
    $notifier = new TerraTectraTelegramNotifier('token', '-1001', 1, 2, 'https://api.telegram.org', $transport);
    $result = $notifier->sendOrderStatusChanged(['number' => '1', 'status' => 'Готов', 'old_status' => 'Новый']);
    truthy($result->success);
    same(2, $calls);
});

test('installer enables the administration page', function (): void {
    $install = (string)file_get_contents(__DIR__ . '/../module/classes/components/terratectra_order_telegram/install.php');
    truthy(str_contains($install, "'config' => '1'"));
    truthy(str_contains($install, "'default_method_admin' => 'config'"));
    truthy(str_contains($install, 'terratectra_order_telegram/admin.php'));
});

test('administration page does not reveal the stored bot token', function (): void {
    $admin = (string)file_get_contents(__DIR__ . '/../module/classes/components/terratectra_order_telegram/admin.php');
    truthy(str_contains($admin, "['string:bot_token'] = '';"));
    truthy(str_contains($admin, '$newToken !=='));
    truthy(str_contains($admin, ': $currentToken'));
    truthy(!str_contains($admin, "['string:bot_token'] = $currentToken"));
});

$failed = 0;
foreach ($tests as [$name, $callback]) {
    try { $callback(); echo "PASS {$name}\n"; }
    catch (Throwable $error) { $failed++; fwrite(STDERR, "FAIL {$name}: {$error->getMessage()}\n"); }
}
echo sprintf("%d tests, %d failed\n", count($tests), $failed);
exit($failed === 0 ? 0 : 1);
