<?php

$INFO = [
    'name' => 'terratectra_order_telegram',
    'config' => '0',
    'default_method' => '',
    'default_method_admin' => '',
    'telegram/enabled' => 0,
    'telegram/bot_token' => '',
    'telegram/chat_id' => '',
    'telegram/status_ids' => '',
    'telegram/include_customer' => 0,
    'telegram/timeout' => 4,
    'telegram/site_host' => '',
];

$COMPONENTS = [
    './classes/components/terratectra_order_telegram/class.php',
    './classes/components/terratectra_order_telegram/events.php',
    './classes/components/terratectra_order_telegram/install.php',
    './classes/components/terratectra_order_telegram/permissions.php',
    './classes/components/terratectra_order_telegram/lang.php',
    './classes/components/terratectra_order_telegram/i18n.php',
    './classes/components/terratectra_order_telegram/src/TelegramNotifier.php',
    './classes/components/terratectra_order_telegram/src/OrderAdapter.php',
];
