<?php

declare(strict_types=1);

namespace TerraTectra\UmiCdek;

use RuntimeException;

final class CdekSdkTransport
{
    public static function assertAvailable(): void
    {
        if (!class_exists('CdekSDK2\\Client')) {
            throw new RuntimeException('Install official package cdek-it/cdek-sdk2.0 before live API use');
        }
    }

    /** @return array<string,string> */
    public static function supportedOperations(): array
    {
        return [
            'tariff' => 'calculator()->add(Tariff::create(...))',
            'tarifflist' => 'calculator()->add(Tarifflist::create(...))',
            'delivery_points' => 'offices()->getFiltered(...)',
            'create_order' => 'orders()->add(Order::create(...))',
            'get_order' => 'orders()->get(uuid)',
            'delete_order' => 'orders()->delete(uuid)',
            'webhooks' => 'webhooks()',
        ];
    }
}
