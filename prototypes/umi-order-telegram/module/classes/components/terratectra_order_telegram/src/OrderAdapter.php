<?php

declare(strict_types=1);

final class TerraTectraUmiOrderAdapter {
    /** @return array<string,mixed> */
    public static function adapt(object $order, int $oldStatusId, int $newStatusId, array $options = []): array {
        $id = self::readMethodOrValue($order, ['getId'], ['id'], 0);
        $number = self::readMethodOrValue($order, ['getNumber'], ['number'], $id);
        $price = self::readMethodOrValue($order, ['getActualPrice', 'getTotalPrice'], ['total_price', 'total_original_price'], null);
        $currency = (string)($options['currency'] ?? 'RUB');
        $host = trim((string)($options['host'] ?? ($_SERVER['HTTP_HOST'] ?? '')));
        $scheme = !empty($options['https']) || (($_SERVER['HTTPS'] ?? '') === 'on') ? 'https' : 'http';

        $result = [
            'id' => $id,
            'number' => $number,
            'price' => $price,
            'currency' => $currency,
            'old_status' => self::statusName($oldStatusId),
            'status' => self::statusName($newStatusId),
            'admin_url' => $host !== '' ? sprintf('%s://%s/admin/emarket/order_edit/%s/', $scheme, $host, rawurlencode((string)$id)) : '',
        ];

        if (!empty($options['include_customer'])) {
            $customer = self::extractCustomer($order);
            if ($customer !== []) $result['customer'] = $customer;
        }

        return $result;
    }

    public static function statusAllowed(int $statusId, string|array|null $allowed): bool {
        if ($allowed === null || $allowed === '' || $allowed === []) return true;
        $values = is_array($allowed) ? $allowed : preg_split('/[\s,;]+/', $allowed, -1, PREG_SPLIT_NO_EMPTY);
        $ids = array_map('intval', $values ?: []);
        return in_array($statusId, $ids, true);
    }

    /** @param list<string> $methods @param list<string> $fields */
    private static function readMethodOrValue(object $object, array $methods, array $fields, mixed $fallback): mixed {
        foreach ($methods as $method) {
            if (method_exists($object, $method)) {
                try {
                    $value = $object->{$method}();
                    if ($value !== null && $value !== '') return $value;
                } catch (Throwable) {}
            }
        }
        if (method_exists($object, 'getValue')) {
            foreach ($fields as $field) {
                try {
                    $value = $object->getValue($field);
                    if ($value !== null && $value !== '') return $value;
                } catch (Throwable) {}
            }
        }
        return $fallback;
    }

    private static function statusName(int $statusId): string {
        if ($statusId <= 0) return 'Неизвестен';
        if (class_exists('umiObjectsCollection')) {
            try {
                $status = umiObjectsCollection::getInstance()->getObject($statusId);
                if (is_object($status) && method_exists($status, 'getName')) {
                    $name = trim((string)$status->getName());
                    if ($name !== '') return $name;
                }
            } catch (Throwable) {}
        }
        return '#' . $statusId;
    }

    /** @return array<string,string> */
    private static function extractCustomer(object $order): array {
        $customerId = self::readMethodOrValue($order, ['getCustomerId'], ['customer_id'], 0);
        if (!$customerId || !class_exists('umiObjectsCollection')) return [];
        try {
            $customer = umiObjectsCollection::getInstance()->getObject((int)$customerId);
            if (!is_object($customer)) return [];
            $get = static function (string $field) use ($customer): string {
                if (!method_exists($customer, 'getValue')) return '';
                try { return trim((string)$customer->getValue($field)); } catch (Throwable) { return ''; }
            };
            $name = trim($get('fname') . ' ' . $get('lname'));
            return array_filter([
                'name' => $name,
                'phone' => $get('phone'),
                'email' => $get('e-mail') ?: $get('email'),
            ], static fn(string $value): bool => $value !== '');
        } catch (Throwable) {
            return [];
        }
    }
}
