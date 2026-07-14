<?php

require_once __DIR__ . '/src/TelegramNotifier.php';
require_once __DIR__ . '/src/OrderAdapter.php';

class terratectra_order_telegram extends def_module {
    public function __construct() {
        parent::__construct();
    }

    public function onOrderStatusChanged(iUmiEventPoint $eventPoint): void {
        if ($eventPoint->getMode() !== 'after') return;

        try {
            $registry = regedit::getInstance();
            $enabled = (bool)$registry->getVal('//modules/terratectra_order_telegram/telegram/enabled');
            if (!$enabled) return;

            $newStatusId = (int)$eventPoint->getParam('new-status-id');
            $oldStatusId = (int)$eventPoint->getParam('old-status-id');
            $allowed = (string)$registry->getVal('//modules/terratectra_order_telegram/telegram/status_ids');
            if (!TerraTectraUmiOrderAdapter::statusAllowed($newStatusId, $allowed)) return;

            $order = $eventPoint->getRef('order');
            if (!is_object($order)) return;

            $botToken = (string)$registry->getVal('//modules/terratectra_order_telegram/telegram/bot_token');
            $chatId = (string)$registry->getVal('//modules/terratectra_order_telegram/telegram/chat_id');
            $timeout = max(1, (int)$registry->getVal('//modules/terratectra_order_telegram/telegram/timeout'));
            $includeCustomer = (bool)$registry->getVal('//modules/terratectra_order_telegram/telegram/include_customer');
            $host = (string)$registry->getVal('//modules/terratectra_order_telegram/telegram/site_host');

            $payload = TerraTectraUmiOrderAdapter::adapt($order, $oldStatusId, $newStatusId, [
                'include_customer' => $includeCustomer,
                'host' => $host,
                'https' => true,
                'currency' => 'RUB',
            ]);

            $notifier = new TerraTectraTelegramNotifier($botToken, $chatId, $timeout, 2);
            $result = $notifier->sendOrderStatusChanged($payload);
            if (!$result->success) {
                error_log('[terratectra_order_telegram] Telegram delivery failed: ' . ($result->error ?? ('HTTP ' . $result->statusCode)));
            }
        } catch (Throwable $error) {
            // Уведомление не должно прерывать изменение статуса заказа.
            error_log('[terratectra_order_telegram] ' . $error->getMessage());
        }
    }
}
