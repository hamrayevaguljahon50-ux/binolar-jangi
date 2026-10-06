# Qal'alar jangi

## Ishga tushirish

Node.js 18 yoki undan yangiroq versiyasi kerak. Loyiha papkasida terminal ochib serverni ishga tushiring:

```powershell
node server.mjs
```

Brauzerda shu kompyuterda `http://localhost:3000` manzilini oching. `file://` bilan ochilgan HTML sahifada onlayn rejim ishlamaydi.

Bir Wi-Fi tarmog‘idagi telefondan ulanish uchun o‘yin serveri ishlayotgan kompyuterning IPv4 manzilini toping (`ipconfig` buyrug‘idagi IPv4 Address) va telefonda `http://KOMPYUTER-IP:3000` manzilini oching. Ikkala qurilma ham bir xil tarmoqda bo‘lishi kerak; Windows Firewall so‘rasa, Node.js uchun shu tarmoqda ruxsat bering.

### Internet orqali ulashish

`localhost` faqat shu kompyuterda ochiladi; telefonda `localhost` deb yozmang. Boshqa internet tarmog‘idagi qurilmadan ulanish uchun `server.mjs` faylini Node.js server qo‘llaydigan hostingga joylashtiring va umumiy HTTPS manzilini ikkala qurilmada ham oching. Xonalar server xotirasida saqlanadi; server qayta ishga tushsa, ochiq xonalar yopiladi.

## O‘yin

- Yakka o‘yin: kompyuterga qarshi.
- Bitta qurilmadagi jang: birinchi o‘yinchi `1–4`, ikkinchisi `7–0` tugmalaridan foydalanadi.
- Onlayn jang: xona yaratayotganda o‘zingiz 6 xonali kod tanlaysiz; ikkinchi qurilma shu kod bilan qo‘shiladi. Server kodni o‘zi yaratmaydi.
- Xona ochilgach, jangdan oldin ham va jang paytida ham umumiy chat ishlaydi.
- Onlayn xona ochish yoki unga kirishda o‘yinchi ismini kiriting; ism chat xabarlari yonida ko‘rinadi. Ism bo‘sh qoldirilsa, “O‘yinchi 1/2” nomi ishlatiladi.
- Telefon va planshetda askar/minora tugmalarini bosib boshqarish mumkin.
- Himoya minorasi 50 tanga turadi, ko‘pi bilan 3 ta quriladi va yaqinlashgan dushman askarlarga avtomatik o‘q uzadi.
- Tanga avtomatik berilmaydi. G‘olibga 10 tanga, 10 zanjir va 10 olmos beriladi.
