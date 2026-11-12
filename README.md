# Кабінет мешканця Дніпра — демонстраційний прототип

Вебклієнт (PWA) за технічними вимогами до ЄМІКС «Кабінет мешканця Дніпра».
**Це не офіційний сервіс міської ради.** Серверна система Замовника (АС ВВО МР) емулюється в браузері.

## Запуск

Збірка не потрібна — це статичні файли.

```bash
python3 -m http.server 8791
```

Відкрити http://localhost:8791. Демо-акаунти є на екрані входу; код із «SMS» показується на екрані.

## Структура

| Шлях | Що це |
| --- | --- |
| `index.html`, `css/app.css` | Каркас і стилі |
| `js/main.js` | Маршрутизація, контроль доступу за рівнем, сповіщення |
| `js/asvvo.js` | **Контракт API АС ВВО МР + емулятор.** Для промислової версії замінюється HTTP-клієнтом |
| `js/ext.js` | Зовнішні дані: НБУ, Open-Meteo, SaveEcoBot, графіки відключень |
| `js/v-*.js` | Екрани: вхід, головна, сервіси, медкабінет, паркування, акаунт, емулятор |
| `data/*.json` | Набори даних для мап (OpenStreetMap, ODbL) |
| `sw.js`, `manifest.webmanifest` | PWA |
| `docs/` | Відповідність ТЗ, керівництво користувача |

## Контракт API (`js/asvvo.js`)

- Авторизація: `authStart`, `authVerify`, `authTwoStep`, `passwordResetStart/Finish`, `logout`, `me`, `checkAccess`
- Акаунт: `completeProfile`, `updateProfile`, `setChannels`, `contactChangeStart/Finish`, `setTwoStep`, `setRestricted`, `deleteStart/Finish`, `elevate`, `myLog`, `faq`, `consentText`
- Головна: `news`, `fuel`, `outagesList/Save/Delete`
- Медичний кабінет: `medPatients`, `medDoctors`, `medSlots`, `medBook`, `medAppointments`, `medCancel`
- Паркування: `carsList/Add/Delete`, `parkingTariffs`, `subsList`, `subsBuy`, `finesSearch`, `finesPay`
- Звернення: `requests`

Кожен метод приймає токен сесії; відмови повертаються як `ApiError` з кодом (`unauthorized`, `forbidden`, `otp_wrong` тощо).

## Що справжнє, а що емулюється

Справжні дані: курси НБУ, погода, датчики якості повітря, графіки відключень ДТЕК/ЦЕК, мапа вбиралень.
Емулюються: авторизація та OTP, профіль, новини, ціни пального, медичний кабінет, паркування, оплата, ідентифікація через Дію/BankID.
Докладно — `docs/vidpovidnist-tz.html`.

Дані мап: © учасники OpenStreetMap.
