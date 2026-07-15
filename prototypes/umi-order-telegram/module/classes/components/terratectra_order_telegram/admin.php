<?php

class Terratectra_order_telegramAdmin {
    use baseModuleAdmin;

    public $module;

    public function config() {
        $registry = regedit::getInstance();
        $mode = (string)getRequest('param0');
        $params = [
            'telegram_config' => [
                'boolean:enabled' => null,
                'string:bot_token' => null,
                'string:chat_id' => null,
                'string:status_ids' => null,
                'boolean:include_customer' => null,
                'int:timeout' => null,
                'string:site_host' => null,
            ],
        ];

        if ($mode === 'do') {
            $params = $this->expectParams($params);
            $group = $params['telegram_config'];
            $currentToken = (string)$registry->getVal('//modules/terratectra_order_telegram/telegram/bot_token');
            $newToken = trim((string)$group['string:bot_token']);
            $registry->setVar('//modules/terratectra_order_telegram/telegram/enabled', (int)(bool)$group['boolean:enabled']);
            $registry->setVar('//modules/terratectra_order_telegram/telegram/bot_token', $newToken !== '' ? $newToken : $currentToken);
            $registry->setVar('//modules/terratectra_order_telegram/telegram/chat_id', trim((string)$group['string:chat_id']));
            $registry->setVar('//modules/terratectra_order_telegram/telegram/status_ids', trim((string)$group['string:status_ids']));
            $registry->setVar('//modules/terratectra_order_telegram/telegram/include_customer', (int)(bool)$group['boolean:include_customer']);
            $registry->setVar('//modules/terratectra_order_telegram/telegram/timeout', max(1, min(15, (int)$group['int:timeout'])));
            $registry->setVar('//modules/terratectra_order_telegram/telegram/site_host', trim((string)$group['string:site_host']));
            $this->chooseRedirect();
        }

        $params['telegram_config']['boolean:enabled'] = (bool)$registry->getVal('//modules/terratectra_order_telegram/telegram/enabled');
        $params['telegram_config']['string:bot_token'] = '';
        $params['telegram_config']['string:chat_id'] = (string)$registry->getVal('//modules/terratectra_order_telegram/telegram/chat_id');
        $params['telegram_config']['string:status_ids'] = (string)$registry->getVal('//modules/terratectra_order_telegram/telegram/status_ids');
        $params['telegram_config']['boolean:include_customer'] = (bool)$registry->getVal('//modules/terratectra_order_telegram/telegram/include_customer');
        $params['telegram_config']['int:timeout'] = max(1, (int)$registry->getVal('//modules/terratectra_order_telegram/telegram/timeout'));
        $params['telegram_config']['string:site_host'] = (string)$registry->getVal('//modules/terratectra_order_telegram/telegram/site_host');

        $this->setDataType('settings');
        $this->setActionType('modify');
        $this->setData($this->prepareData($params, 'settings'));
        return $this->doData();
    }
}
