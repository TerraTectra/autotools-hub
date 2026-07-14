<?php

declare(strict_types=1);

namespace TerraTectra\UmiCdek;

use InvalidArgumentException;

final class PayloadMapper
{
    /** @return array<string,mixed> */
    public static function tariff(array $input, ?int $tariffCode = null): array
    {
        $payload = [
            'date' => (string)($input['date'] ?? date(DATE_ISO8601)),
            'type' => (int)($input['type'] ?? 1),
            'currency' => (int)($input['currency'] ?? 1),
            'lang' => (string)($input['lang'] ?? 'rus'),
            'from_location' => self::location((array)($input['from_location'] ?? [])),
            'to_location' => self::location((array)($input['to_location'] ?? [])),
            'packages' => array_map(
                static fn(array $package): array => self::packageForCalculation($package),
                self::requiredList($input, 'packages')
            ),
        ];

        if ($tariffCode !== null) {
            if ($tariffCode <= 0) {
                throw new InvalidArgumentException('tariff_code must be positive');
            }
            $payload['tariff_code'] = $tariffCode;
        }

        return $payload;
    }

    /** @return array<string,mixed> */
    public static function deliveryPointFilter(array $input): array
    {
        $allowed = [
            'postal_code', 'city_code', 'type', 'country_code', 'region_code',
            'have_cashless', 'have_cash', 'allowed_cod', 'is_dressing_room',
            'weight_max', 'weight_min', 'lang', 'take_only', 'is_handout',
            'is_reception', 'fias_guid', 'code', 'is_ltl', 'fulfillment',
            'size', 'page',
        ];

        $result = [];
        foreach ($allowed as $key) {
            if (array_key_exists($key, $input) && $input[$key] !== '' && $input[$key] !== null) {
                $result[$key] = $input[$key];
            }
        }

        if ($result === []) {
            throw new InvalidArgumentException('At least one delivery point filter is required');
        }

        return $result;
    }

    /** @return array<string,mixed> */
    public static function order(array $input): array
    {
        $number = trim((string)($input['number'] ?? ''));
        $tariffCode = (int)($input['tariff_code'] ?? 0);
        if ($number === '' || $tariffCode <= 0) {
            throw new InvalidArgumentException('number and positive tariff_code are required');
        }

        $payload = [
            'type' => (int)($input['type'] ?? 1),
            'number' => $number,
            'tariff_code' => $tariffCode,
            'comment' => trim((string)($input['comment'] ?? '')),
            'sender' => self::contact((array)($input['sender'] ?? [])),
            'recipient' => self::contact((array)($input['recipient'] ?? [])),
            'from_location' => self::location((array)($input['from_location'] ?? [])),
            'to_location' => self::location((array)($input['to_location'] ?? [])),
            'packages' => array_map(
                static fn(array $package): array => self::packageForOrder($package),
                self::requiredList($input, 'packages')
            ),
        ];

        foreach (['shipment_point', 'delivery_point', 'items_cost_currency', 'recipient_currency'] as $optional) {
            if (!empty($input[$optional])) {
                $payload[$optional] = $input[$optional];
            }
        }

        return $payload;
    }

    public static function idempotencyKey(array $input): string
    {
        $number = trim((string)($input['number'] ?? ''));
        if ($number === '') {
            throw new InvalidArgumentException('number is required for idempotency key');
        }

        $revision = trim((string)($input['revision'] ?? '1'));
        return hash('sha256', $number . ':' . $revision);
    }

    public static function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if (strlen($digits) === 11 && $digits[0] === '8') {
            $digits = '7' . substr($digits, 1);
        } elseif (strlen($digits) === 10) {
            $digits = '7' . $digits;
        }

        if (strlen($digits) < 10 || strlen($digits) > 15) {
            throw new InvalidArgumentException('Invalid phone number');
        }

        return '+' . $digits;
    }

    /** @return array<string,mixed> */
    private static function contact(array $input): array
    {
        $name = trim((string)($input['name'] ?? ''));
        $phones = $input['phones'] ?? [];
        if ($name === '' || !is_array($phones) || $phones === []) {
            throw new InvalidArgumentException('Contact name and at least one phone are required');
        }

        $result = [
            'name' => $name,
            'phones' => array_map(
                static fn(mixed $phone): array => ['number' => self::normalizePhone((string)(is_array($phone) ? ($phone['number'] ?? '') : $phone))],
                $phones
            ),
        ];

        $email = trim((string)($input['email'] ?? ''));
        if ($email !== '') {
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                throw new InvalidArgumentException('Invalid contact email');
            }
            $result['email'] = strtolower($email);
        }
        if (!empty($input['company'])) {
            $result['company'] = trim((string)$input['company']);
        }

        return $result;
    }

    /** @return array<string,mixed> */
    private static function location(array $input): array
    {
        $address = trim((string)($input['address'] ?? ''));
        if ($address === '') {
            throw new InvalidArgumentException('Location address is required');
        }

        $result = ['address' => $address];
        foreach (['code', 'fias_guid', 'postal_code', 'country_code', 'region', 'region_code', 'city'] as $key) {
            if (isset($input[$key]) && $input[$key] !== '') {
                $result[$key] = $input[$key];
            }
        }
        return $result;
    }

    /** @return array<string,int> */
    private static function packageForCalculation(array $input): array
    {
        $result = [];
        foreach (['weight', 'length', 'width', 'height'] as $key) {
            $value = (int)($input[$key] ?? 0);
            if ($value <= 0) {
                throw new InvalidArgumentException("Package {$key} must be positive");
            }
            $result[$key] = $value;
        }
        return $result;
    }

    /** @return array<string,mixed> */
    private static function packageForOrder(array $input): array
    {
        $number = trim((string)($input['number'] ?? ''));
        if ($number === '') {
            throw new InvalidArgumentException('Package number is required');
        }

        $result = ['number' => $number] + self::packageForCalculation($input);
        $result['items'] = array_map(
            static fn(array $item): array => self::item($item),
            self::requiredList($input, 'items')
        );
        return $result;
    }

    /** @return array<string,mixed> */
    private static function item(array $input): array
    {
        $name = trim((string)($input['name'] ?? ''));
        $wareKey = trim((string)($input['ware_key'] ?? ''));
        $cost = (float)($input['cost'] ?? -1);
        $weight = (int)($input['weight'] ?? 0);
        $amount = (int)($input['amount'] ?? 0);
        if ($name === '' || $wareKey === '' || $cost < 0 || $weight <= 0 || $amount <= 0) {
            throw new InvalidArgumentException('Item name, ware_key, non-negative cost, weight and amount are required');
        }

        return [
            'name' => $name,
            'ware_key' => $wareKey,
            'cost' => $cost,
            'weight' => $weight,
            'amount' => $amount,
            'payment' => [
                'value' => (float)($input['payment_value'] ?? 0),
                'vat_sum' => isset($input['vat_sum']) ? (float)$input['vat_sum'] : 0.0,
                'vat_rate' => isset($input['vat_rate']) ? (int)$input['vat_rate'] : null,
            ],
        ];
    }

    /** @return list<array<string,mixed>> */
    private static function requiredList(array $input, string $key): array
    {
        $value = $input[$key] ?? null;
        if (!is_array($value) || $value === []) {
            throw new InvalidArgumentException("{$key} must contain at least one item");
        }
        foreach ($value as $item) {
            if (!is_array($item)) {
                throw new InvalidArgumentException("{$key} entries must be arrays");
            }
        }
        return array_values($value);
    }
}
