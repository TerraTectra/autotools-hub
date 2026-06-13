// Donation page functionality for Russian payment systems

document.addEventListener('DOMContentLoaded', function() {
    // Generate SBP QR code placeholder
    const sbpQrContainer = document.getElementById('sbp-qr');
    if (sbpQrContainer) {
        // Placeholder for SBP QR code
        // In production, this would generate a real SBP QR code
        sbpQrContainer.innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <p style="margin: 0; font-size: 14px;">QR-код СБП</p>
                <p style="margin: 10px 0 0 0; font-size: 12px; color: #666;">
                    Отсканируйте камерой банка
                </p>
                <div style="margin-top: 15px; font-size: 40px;">📱</div>
            </div>
        `;
    }

    // YooKassa button handler
    const yookassaButton = document.getElementById('yookassa-pay');
    if (yookassaButton) {
        yookassaButton.addEventListener('click', function() {
            alert('ЮKassa интеграция требует настройки.\n\nДля подключения:\n1. Зарегистрируйтесь на kassa.yandex.ru\n2. Получите API ключи\n3. Добавьте интеграцию на сервере\n\nВременно используйте СБП или банковский перевод.');
        });
    }
});
