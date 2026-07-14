<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/PayloadMapper.php';
require_once __DIR__ . '/../src/IdempotencyStore.php';
require_once __DIR__ . '/../src/CdekSdkTransport.php';

use TerraTectra\UmiCdek\CdekSdkTransport;
use TerraTectra\UmiCdek\IdempotencyStore;
use TerraTectra\UmiCdek\PayloadMapper;

$tests = [];
$test = static function (string $name, callable $fn) use (&$tests): void { $tests[] = [$name, $fn]; };
$assert = static function (bool $condition, string $message = 'assertion failed'): void {
    if (!$condition) { throw new RuntimeException($message); }
};

$base = [
    'number' => 'UMI-1001',
    'revision' => '3',
    'tariff_code' => 136,
    'sender' => ['name' => 'Магазин', 'phones' => ['+7 999 111-22-33']],
    'recipient' => ['name' => 'Иван Иванов', 'email' => 'IVAN@example.com', 'phones' => ['8 (999) 222-33-44']],
    'from_location' => ['code' => 44, 'city' => 'Москва', 'address' => 'ул. Тестовая, 1', 'country_code' => 'RU'],
    'to_location' => ['code' => 270, 'city' => 'Новосибирск', 'address' => 'ул. Примерная, 2', 'country_code' => 'RU'],
    'packages' => [[
        'number' => '1', 'weight' => 900, 'length' => 20, 'width' => 15, 'height' => 10,
        'items' => [[
            'name' => 'Книга', 'ware_key' => 'BOOK-1', 'cost' => 1200, 'weight' => 900,
            'amount' => 1, 'payment_value' => 1200, 'vat_rate' => 0,
        ]],
    ]],
];

$test('normalizes Russian phones', static function () use ($assert): void {
    $assert(PayloadMapper::normalizePhone('8 (999) 123-45-67') === '+79991234567');
    $assert(PayloadMapper::normalizePhone('9991234567') === '+79991234567');
});

$test('builds tariff payload', static function () use ($assert, $base): void {
    $payload = PayloadMapper::tariff($base, 136);
    $assert($payload['tariff_code'] === 136);
    $assert($payload['packages'][0]['weight'] === 900);
});

$test('filters delivery point parameters', static function () use ($assert): void {
    $filter = PayloadMapper::deliveryPointFilter(['city_code' => 44, 'type' => 'PVZ', 'unknown' => 'x']);
    $assert($filter === ['city_code' => 44, 'type' => 'PVZ']);
});

$test('builds order payload and normalizes email', static function () use ($assert, $base): void {
    $payload = PayloadMapper::order($base);
    $assert($payload['recipient']['email'] === 'ivan@example.com');
    $assert($payload['recipient']['phones'][0]['number'] === '+79992223344');
    $assert($payload['packages'][0]['items'][0]['ware_key'] === 'BOOK-1');
});

$test('creates stable idempotency key', static function () use ($assert, $base): void {
    $assert(PayloadMapper::idempotencyKey($base) === PayloadMapper::idempotencyKey($base));
    $changed = $base; $changed['revision'] = '4';
    $assert(PayloadMapper::idempotencyKey($base) !== PayloadMapper::idempotencyKey($changed));
});

$test('stores idempotency result atomically', static function () use ($assert): void {
    $path = sys_get_temp_dir() . '/umi-cdek-' . bin2hex(random_bytes(4)) . '/state.json';
    $store = new IdempotencyStore($path);
    $assert(!$store->has('abc'));
    $store->remember('abc', ['uuid' => 'demo']);
    $assert($store->has('abc'));
    @unlink($path); @rmdir(dirname($path));
});

$test('lists official SDK operations', static function () use ($assert): void {
    $ops = CdekSdkTransport::supportedOperations();
    $assert(isset($ops['tariff'], $ops['delivery_points'], $ops['create_order']));
});

$failed = 0;
foreach ($tests as [$name, $fn]) {
    try { $fn(); echo "PASS {$name}\n"; }
    catch (Throwable $e) { $failed++; echo "FAIL {$name}: {$e->getMessage()}\n"; }
}

echo sprintf("%d tests, %d failed\n", count($tests), $failed);
exit($failed === 0 ? 0 : 1);
