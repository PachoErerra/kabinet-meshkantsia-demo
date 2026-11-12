// Емулятор АС ВВО МР (серверна сторона Замовника).
// У промисловій версії цей файл замінюється HTTP-клієнтом до справжнього API АС ВВО МР:
// усі методи нижче — це контракт, який очікує веб-клієнт «Кабінет мешканця Дніпра».
// Стан емулятора лежить у localStorage браузера, тому в кожного відвідувача демо він свій.

const DB_KEY = globalThis.__ASVVO_DB_KEY || 'asvvo.emulator.db.v2'; // тести підміняють ключ, щоб не чіпати дані демо
const delay = (ms = 180) => new Promise(r => setTimeout(r, ms + Math.random() * 120));
const uid = (p = '') => p + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const now = () => Date.now();
const DAY = 86400000;

export class ApiError extends Error {
  constructor(code, message, extra) { super(message); this.code = code; Object.assign(this, extra || {}); }
}

export const SECTIONS = {
  home: 'Головна', maps: 'Мапи', account: 'Акаунт', outages: 'Графіки відключень',
  requests: 'Звернення та документи', parking: 'Паркування', payments: 'Оплата послуг', medical: 'Медичний кабінет',
};
const DEFAULT_RULES = { home: 0, maps: 0, account: 0, outages: 1, requests: 1, parking: 1, payments: 1, medical: 2 };

async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function hashNum(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export function normPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10 && d[0] === '0') d = '38' + d;
  if (d.length === 9) d = '380' + d;
  if (!/^380\d{9}$/.test(d)) throw new ApiError('bad_phone', 'Вкажіть номер у форматі +380 XX XXX XX XX');
  return '+' + d;
}
export const maskPhone = p => p ? p.slice(0, 6) + ' ••• •• ' + p.slice(-2) : '';
export const maskEmail = e => e ? e.replace(/^(.).*(@.*)$/, '$1•••$2') : '';

// ---------- сховище ----------
let db = null;
const FAC_IDS = ['f1', 'f2', 'f3', 'f4', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11'];
const facName = id => 'КНП «Дніпровський ЦПМСД №' + id.slice(1) + '»';
// Тестові дані: п'ять користувачів у різних станах, щоб кожен сценарій було видно без підготовки
function seed() {
  const t = now(); const H = 3600e3;
  const mk = (id, phone, last, first, middle, birth, level, extra = {}) => ({ id, phone, email: '', last, first, middle, birth, level, blocked: false, restricted: false, consentAt: level ? t - 60 * DAY : null, twoStep: null, otpChannel: 'sms', channels: { sms: true, email: false, push: false }, createdAt: t - 60 * DAY, verifiedBy: level === 2 ? 'Дія' : null, ...extra });
  const u1 = mk('u_demo1', '+380500000001', 'Шевченко', 'Олена', 'Іванівна', '1990-04-12', 1, { email: 'olena@example.com', channels: { sms: true, email: true, push: false } });
  const u2 = mk('u_demo2', '+380500000002', 'Коваленко', 'Андрій', 'Петрович', '1984-09-30', 2, { email: 'andrii@example.com', createdAt: t - 200 * DAY });
  const u3 = mk('u_demo3', '+380500000003', '', '', '', '', 0, { createdAt: t - 2 * H });
  const u4 = mk('u_demo4', '+380500000004', 'Мороз', 'Віктор', 'Степанович', '1975-01-20', 1, { blocked: true });
  const u5 = mk('u_demo5', '+380500000005', 'Вишневецька-Коваленко', 'Олександра-Марія', 'Володимирівна', '1996-12-05', 2, { email: 'oleksandra.vyshnevetska-kovalenko@example.com', verifiedBy: 'BankID НБУ', twoStep: { salt: 'seedsalt', hash: '7a7240b6cd10b68702164b32a32e6fa5a8e14729531114de7d1f99d8e9d2c4d5' }, channels: { sms: true, email: true, push: true } });
  const users = { [u1.id]: u1, [u2.id]: u2, [u3.id]: u3, [u4.id]: u4, [u5.id]: u5 };
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const workday = (shift, h, m) => { let d = new Date(d0.getTime() + shift * DAY); const step = shift < 0 ? -1 : 1; while (d.getDay() === 0 || d.getDay() === 6) d = new Date(d.getTime() + step * DAY); return d.getTime() + (h * 60 + m) * 60000; };
  const requests = {}, appts = {}, subs = {}, cars = {}, finesPaid = {}, log = [];
  let seq = 100200;
  const req = (u, ago, r) => { const x = { id: uid('r'), no: 'КМД-' + new Date().getFullYear() + '-' + (seq++), createdAt: t - ago, status: 'Виконано', docs: [], ...r }; (requests[u.id] ||= []).push(x); return x; };
  const ev = (u, ago, type, text, sev = 'info') => log.push({ id: uid('l'), ts: t - ago, userId: u?.id || null, phone: u?.phone || null, type, text, sev });
  const appt = (u, patient, facId, di, ts, status, ago) => {
    const d = doctorsOf(facId)[di];
    const a = { id: uid('a'), patientId: 'p_' + u.id + (patient.child ? '_c' : ''), patientName: patient.name, doctorId: d.id, doctorName: d.name, spec: d.spec, room: d.room, facilityName: facName(facId), facilityAddress: null, ts, status, createdAt: t - ago };
    (appts[u.id] ||= []).push(a);
    a.requestId = req(u, ago, { type: 'medical', title: 'Запис до лікаря: ' + d.spec + ', ' + d.name, status: status === 'Заплановано' ? 'Заплановано' : status, refId: a.id, docs: [{ id: uid('d'), kind: 'talon', name: 'Талон на прийом', data: a }] }).id;
  };
  const sub = (u, plate, tariff, price, days, startAgo) => {
    const s = { id: uid('s'), plate, tariff, price, from: t - startAgo, to: t - startAgo + days * DAY, paidAt: t - startAgo - H, payId: 'PAY-' + uid().toUpperCase() };
    (subs[u.id] ||= []).push(s);
    req(u, startAgo + H, { type: 'parking', title: 'Паркувальний абонемент «' + tariff + '» для ' + plate, status: 'Оплачено', docs: [{ id: uid('d'), kind: 'sub', name: 'Абонемент', data: s }, { id: uid('d'), kind: 'receipt', name: 'Квитанція про оплату', data: { payId: s.payId, amount: price, purpose: 'Паркувальний абонемент «' + tariff + '», авто ' + plate, paidAt: s.paidAt } }] });
  };
  const car = (u, plate, kind, title, source = 'Додано в кабінеті') => (cars[u.id] ||= []).push({ id: uid('c'), plate, kind, title, source });

  // Олена, рівень 1: графіки, два авто, абонементи
  car(u1, 'КА7777АА', 'ua', 'Renault Megane'); car(u1, 'OLENA', 'other', 'Іменний номер');
  sub(u1, 'КА7777АА', 'Місячний', 1200, 30, 9 * DAY); sub(u1, 'КА7777АА', 'Тижневий', 400, 7, 40 * DAY);
  ev(u1, 60 * DAY, 'auth', 'Реєстрація нового користувача (рівень 0)'); ev(u1, 60 * DAY - H, 'auth', 'Рівень авторизації підвищено 0 → 1 (профіль заповнено, згоду надано)');
  ev(u1, 9 * DAY + H, 'critical', 'Оплата абонемента «Місячний» для КА7777АА, 1200 грн', 'crit'); ev(u1, 3 * DAY, 'security', 'Спроба доступу до «Медичний кабінет» без потрібного рівня (є 1, треба 2)', 'warn'); ev(u1, 26 * H, 'auth', 'Вхід до кабінету (OTP)');
  // Андрій, рівень 2: записи до лікаря (майбутній, минулий, скасований), авто з ЄПП, сплачений штраф
  car(u2, 'АЕ1234ВС', 'ua', 'Skoda Octavia', 'ЄПП (синхронізовано)'); car(u2, 'АЕ0001ОО', 'ua', 'Toyota Camry');
  const selfName = 'Коваленко Андрій Петрович', child = { name: 'Коваленко Марія Андріївна', child: true };
  appt(u2, { name: selfName }, 'f1', 0, workday(2, 10, 20), 'Заплановано', 5 * H);
  appt(u2, child, 'f1', 1, workday(4, 15, 0), 'Заплановано', 4 * H);
  appt(u2, { name: selfName }, 'f4', 2, workday(-12, 9, 40), 'Відбувся', 15 * DAY);
  appt(u2, { name: selfName }, 'f1', 0, workday(-5, 11, 0), 'Скасовано', 8 * DAY);
  sub(u2, 'АЕ1234ВС', 'Денний', 80, 1, 20 * DAY);
  const fid = 'FАЕ1234ВС0'; finesPaid[fid] = { payId: 'PAY-' + uid().toUpperCase(), paidAt: t - 6 * DAY };
  req(u2, 6 * DAY, { type: 'parking', title: 'Сплата штрафу за паркування, постанова ДП' + (10000000 + hashNum(fid) % 89999999), status: 'Оплачено', docs: [{ id: uid('d'), kind: 'receipt', name: 'Квитанція про оплату', data: { payId: finesPaid[fid].payId, amount: hashNum(fid) % 2 ? 340 : 680, purpose: 'Штраф за паркування, авто АЕ1234ВС', paidAt: finesPaid[fid].paidAt } }] });
  req(u2, 190 * DAY, { type: 'auth', title: 'Підвищення рівня авторизації через Дія' });
  ev(u2, 190 * DAY, 'critical', 'Рівень авторизації підвищено 1 → 2 через Дія', 'crit'); ev(u2, 15 * DAY, 'critical', 'Запис до лікаря для пацієнта ' + selfName); ev(u2, 6 * DAY, 'critical', 'Сплата штрафу за паркування', 'crit'); ev(u2, 5 * DAY, 'security', 'Невірний OTP-код (login), спроба 1', 'warn'); ev(u2, 5 * DAY - 60000, 'auth', 'Вхід до кабінету (OTP)'); ev(u2, 5 * H, 'critical', 'Запис до лікаря для пацієнта ' + selfName);
  // Новий користувач рівня 0, заблокований користувач, користувач із довгим ПІБ і двоетапною перевіркою
  ev(u3, 2 * H, 'auth', 'Реєстрація нового користувача (рівень 0)');
  ev(u4, 30 * DAY, 'admin', 'Акаунт заблоковано адміністратором', 'crit'); ev(u4, 2 * DAY, 'security', 'Спроба входу до заблокованого акаунта', 'crit');
  car(u5, 'ВН5555КК', 'ua', 'Volkswagen Transporter T6.1 Long'); car(u5, 'WE12345', 'other', 'Авто на польській реєстрації');
  sub(u5, 'ВН5555КК', 'Тижневий', 400, 7, 2 * DAY);
  appt(u5, { name: 'Вишневецька-Коваленко Олександра-Марія Володимирівна' }, 'f8', 3, workday(1, 13, 40), 'Заплановано', 20 * H);
  ev(u5, 50 * DAY, 'critical', 'Увімкнено двоетапну перевірку (пароль)', 'crit'); ev(u5, 20 * H, 'auth', 'Вхід до кабінету (OTP + пароль)');
  for (const k of [requests, appts, subs]) for (const id in k) k[id].sort((a, b) => (b.createdAt || b.from) - (a.createdAt || a.from));
  log.sort((a, b) => b.ts - a.ts);
  const o = (name, operator, group, notify = false) => ({ id: uid('o'), name, operator, group, notify });
  const news = [
    ['Транспорт', 2, 'Змінено маршрути громадського транспорту на час ремонту проспекту', 'З понеділка тимчасово змінюється рух тролейбусів №1 та №9. Об’їзд організовано паралельними вулицями, зупинки перенесено. Роботи триватимуть орієнтовно два тижні.'],
    ['ЖКГ', 7, 'Комунальні служби працюють у посиленому режимі', 'Через погіршення погодних умов аварійні бригади переведено на цілодобове чергування. Звернення приймає контакт-центр міської ради.'],
    ['Енергетика', 11, 'Пункти незламності відкриті в усіх районах міста', 'У пунктах є тепло, зв’язок, вода та можливість зарядити телефон. Адреси найближчих пунктів дивіться на мапі.'],
    ['Освіта', 26, 'Запис до гуртків на новий семестр відкрито онлайн', 'Батьки можуть подати заяву через електронні сервіси міста. Зарахування підтверджується повідомленням у кабінеті.'],
    ['Медицина', 50, 'Центри первинної допомоги подовжили години прийому', 'У будні амбулаторії приймають до 20:00. Записатися до лікаря можна в розділі «Медичний кабінет».'],
    ['Паркування', 75, 'Запрацювали нові майданчики для паркування в центрі', 'Оплатити паркування або придбати абонемент можна в сервісі «Паркування».'],
    ['Довкілля', 98, 'У місті встановили нові датчики якості повітря', 'Показники доступні на мапі якості повітря. Дані оновлюються кожні кілька хвилин.'],
    ['Культура', 140, 'Міські бібліотеки запрошують на безкоштовні заходи для дітей і дорослих протягом усього місяця', 'Розклад читань, майстер-класів і зустрічей з авторами опубліковано на сторінках бібліотек.'],
  ].map(([tag, h, title, body], i) => ({ id: 'n' + (i + 1), ts: t - h * H, tag, title, body }));
  return {
    v: 2, users, sessions: {}, challenges: {}, rules: { ...DEFAULT_RULES }, rulesVersion: 1, log,
    outages: { u_demo1: [o('Дім', 'dtek', '1.1'), o('Дача в Підгородному', 'cek', '4.2')], u_demo2: [o('Квартира', 'dtek', '3.2'), o('Офіс', 'cek', '2.1'), o('Батьки', 'dtek', '6.1')], u_demo5: [o('Квартира на проспекті Дмитра Яворницького', 'dtek', '5.2')] },
    cars, subs, finesPaid, appts, requests, alertDemo: null, news,
  };
}
function load() {
  if (db) return db;
  try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch { db = null; }
  if (!db || db.v !== 2) { db = seed(); save(); }
  return db;
}
function save() { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function reload() { db = null; return load(); }
window.addEventListener('storage', e => { if (e.key === DB_KEY) db = null; });

function log(user, type, text, sev = 'info') {
  load().log.unshift({ id: uid('l'), ts: now(), userId: user?.id || null, phone: user?.phone || (typeof user === 'string' ? user : null), type, text, sev });
  if (db.log.length > 600) db.log.length = 600;
}

// ---------- OTP ----------
let otpListener = null;
export function onOtp(fn) { otpListener = fn; }
function sendOtp({ userId = null, phone, purpose, channel = 'sms', target, payload = {} }) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const id = uid('ch');
  load().challenges[id] = { userId, phone, code, purpose, payload, exp: now() + 3 * 60000, attempts: 0 };
  const masked = channel === 'email' ? maskEmail(target) : maskPhone(target || phone);
  setTimeout(() => otpListener && otpListener({ code, channel, masked, purpose }), 500);
  return { challengeId: id, channel, masked, ttl: 180 };
}
function checkOtp(challengeId, code, purpose) {
  const ch = load().challenges[challengeId];
  if (!ch || ch.purpose !== purpose) throw new ApiError('otp_missing', 'Запит на підтвердження не знайдено. Надішліть код ще раз.');
  if (ch.exp < now()) { delete db.challenges[challengeId]; save(); throw new ApiError('otp_expired', 'Термін дії коду минув. Надішліть код ще раз.'); }
  if (String(code).trim() !== ch.code) {
    ch.attempts++;
    log(ch.userId ? db.users[ch.userId] : ch.phone, 'security', 'Невірний OTP-код (' + purpose + '), спроба ' + ch.attempts, 'warn');
    if (ch.attempts >= 5) { delete db.challenges[challengeId]; save(); throw new ApiError('otp_locked', 'Забагато невірних спроб. Надішліть код ще раз.'); }
    save();
    throw new ApiError('otp_wrong', 'Невірний код. Залишилось спроб: ' + (5 - ch.attempts));
  }
  delete db.challenges[challengeId];
  return ch;
}

// ---------- сесія ----------
function auth(token) {
  const s = load().sessions[token];
  const u = s && db.users[s.userId];
  if (!u) throw new ApiError('unauthorized', 'Сесію завершено. Увійдіть знову.');
  if (u.blocked) { delete db.sessions[token]; save(); throw new ApiError('blocked', 'Обліковий запис заблоковано адміністратором АС ВВО МР.'); }
  return u;
}
function need(token, section) {
  const u = auth(token);
  const min = db.rules[section] ?? 0;
  if (u.restricted && section !== 'account' && section !== 'home') {
    log(u, 'security', 'Спроба доступу до «' + SECTIONS[section] + '» з обмеженого акаунта', 'warn'); save();
    throw new ApiError('restricted', 'Використання акаунта обмежено. Зніміть обмеження в розділі «Акаунт».');
  }
  if (u.level < min) {
    log(u, 'security', 'Спроба доступу до «' + SECTIONS[section] + '» без потрібного рівня (є ' + u.level + ', треба ' + min + ')', 'warn'); save();
    throw new ApiError('forbidden', 'Потрібен рівень авторизації ' + min, { need: min });
  }
  return u;
}
const pub = u => ({ id: u.id, phone: u.phone, email: u.email, last: u.last, first: u.first, middle: u.middle, birth: u.birth, level: u.level, restricted: u.restricted, consentAt: u.consentAt, twoStep: !!u.twoStep, otpChannel: u.otpChannel, channels: { ...u.channels }, createdAt: u.createdAt, verifiedBy: u.verifiedBy });
function newSession(u) { const token = uid('t') + uid(); db.sessions[token] = { userId: u.id, createdAt: now() }; return token; }
function addRequest(u, r) {
  const list = (db.requests[u.id] ||= []);
  const req = { id: uid('r'), no: 'КМД-' + new Date().getFullYear() + '-' + String(100000 + (hashNum(uid()) % 899999)), createdAt: now(), status: 'Виконано', docs: [], ...r };
  list.unshift(req); return req;
}

// ============ API ============
export const api = {
  // ----- модуль авторизації -----
  async authStart(rawPhone) {
    await delay(); const phone = normPhone(rawPhone);
    const u = Object.values(load().users).find(x => x.phone === phone);
    if (u?.blocked) { log(u, 'security', 'Спроба входу до заблокованого акаунта', 'crit'); save(); throw new ApiError('blocked', 'Обліковий запис заблоковано адміністратором АС ВВО МР.'); }
    const channel = u?.otpChannel === 'email' && u.email ? 'email' : 'sms';
    const r = sendOtp({ userId: u?.id || null, phone, purpose: 'login', channel, target: channel === 'email' ? u.email : phone });
    save(); return { ...r, isNew: !u };
  },
  async authVerify(challengeId, code) {
    await delay(); const ch = checkOtp(challengeId, code, 'login');
    let u = ch.userId && db.users[ch.userId];
    if (!u) {
      u = { id: uid('u_'), phone: ch.phone, email: '', last: '', first: '', middle: '', birth: '', level: 0, blocked: false, restricted: false, consentAt: null, twoStep: null, otpChannel: 'sms', channels: { sms: true, email: false, push: false }, createdAt: now(), verifiedBy: null };
      db.users[u.id] = u; log(u, 'auth', 'Реєстрація нового користувача (рівень 0)');
    }
    if (u.twoStep) { const id = uid('ts'); db.challenges[id] = { userId: u.id, purpose: 'twostep', exp: now() + 5 * 60000, attempts: 0 }; save(); return { twoStep: true, challengeId: id }; }
    const token = newSession(u); log(u, 'auth', 'Вхід до кабінету (OTP)'); save(); return { token };
  },
  async authTwoStep(challengeId, password) {
    await delay(); const ch = load().challenges[challengeId];
    if (!ch || ch.purpose !== 'twostep' || ch.exp < now()) throw new ApiError('otp_missing', 'Час очікування минув. Почніть вхід спочатку.');
    const u = db.users[ch.userId];
    if (await sha(u.twoStep.salt + password) !== u.twoStep.hash) {
      ch.attempts++; log(u, 'security', 'Невірний пароль двоетапної перевірки', 'warn');
      if (ch.attempts >= 5) delete db.challenges[challengeId];
      save(); throw new ApiError('bad_password', 'Невірний пароль.');
    }
    delete db.challenges[challengeId]; const token = newSession(u); log(u, 'auth', 'Вхід до кабінету (OTP + пароль)'); save(); return { token };
  },
  async passwordResetStart(rawPhone) {
    await delay(); const phone = normPhone(rawPhone);
    const u = Object.values(load().users).find(x => x.phone === phone);
    if (!u) throw new ApiError('not_found', 'Користувача з таким номером не знайдено.');
    const channel = u.email ? 'email' : 'sms';
    const r = sendOtp({ userId: u.id, phone, purpose: 'pwreset', channel, target: channel === 'email' ? u.email : phone }); save(); return r;
  },
  async passwordResetFinish(challengeId, code, newPassword) {
    await delay(); if (newPassword && newPassword.length < 8) throw new ApiError('weak', 'Пароль має містити щонайменше 8 символів.'); // перевіряємо до списання коду
    const ch = checkOtp(challengeId, code, 'pwreset'); const u = db.users[ch.userId];
    if (newPassword) { const salt = uid(); u.twoStep = { salt, hash: await sha(salt + newPassword) }; }
    else u.twoStep = null;
    log(u, 'critical', 'Відновлення пароля двоетапної перевірки', 'crit'); save(); return { ok: true };
  },
  async logout(token) { await delay(60); const s = load().sessions[token]; if (s) { log(db.users[s.userId], 'auth', 'Вихід з кабінету'); delete db.sessions[token]; save(); } return { ok: true }; },
  async me(token) { const u = auth(token); return { user: pub(u), rules: { ...db.rules }, rulesVersion: db.rulesVersion, alertDemo: db.alertDemo }; },
  peek(token) { try { db = null; const u = auth(token); return { user: pub(u), rules: { ...db.rules }, rulesVersion: db.rulesVersion }; } catch { return null; } },
  async checkAccess(token, section) { need(token, section); return { ok: true }; },

  // ----- акаунт -----
  async completeProfile(token, { last, first, middle, birth, email, consent }) {
    await delay(); const u = auth(token);
    last = cleanName(last, 'Прізвище', true); first = cleanName(first, 'Ім’я', true); middle = cleanName(middle, 'По батькові', false); birth = cleanBirth(birth);
    if (!consent && !u.consentAt) throw new ApiError('validation', 'Потрібна згода на обробку персональних даних.');
    if (email && (String(email).length > 120 || !/^[^@\s<>"']+@[^@\s<>"']+\.[^@\s<>"']+$/.test(email))) throw new ApiError('validation', 'Некоректна адреса електронної пошти.');
    Object.assign(u, { last, first, middle, birth, email: String((email ?? u.email) || '').slice(0, 120) });
    if (!u.consentAt) u.consentAt = now();
    if (u.level === 0) { u.level = 1; log(u, 'auth', 'Рівень авторизації підвищено 0 → 1 (профіль заповнено, згоду надано)'); }
    else log(u, 'profile', 'Змінено персональні дані');
    save(); return pub(u);
  },
  async updateProfile(token, patch) {
    await delay(); const u = auth(token);
    if (u.level >= 2 && (patch.last || patch.first || patch.middle || patch.birth)) throw new ApiError('locked', 'ПІБ і дату народження підтверджено через ' + (u.verifiedBy || 'ІСЕІ') + ' — змінити їх можна лише повторною ідентифікацією.');
    const next = { last: 'last' in patch ? cleanName(patch.last, 'Прізвище', true) : u.last, first: 'first' in patch ? cleanName(patch.first, 'Ім’я', true) : u.first, middle: 'middle' in patch ? cleanName(patch.middle, 'По батькові', false) : u.middle, birth: 'birth' in patch ? cleanBirth(patch.birth) : u.birth };
    if (!next.last || !next.first) throw new ApiError('validation', 'Вкажіть прізвище та ім’я.');
    Object.assign(u, next);
    log(u, 'profile', 'Змінено персональні дані'); save(); return pub(u);
  },
  async setChannels(token, channels) { await delay(); const u = auth(token); if (channels.email && !u.email) throw new ApiError('validation', 'Спершу додайте адресу електронної пошти.'); u.channels = { sms: !!channels.sms, email: !!channels.email, push: !!channels.push }; log(u, 'settings', 'Змінено канали комунікації: ' + Object.entries(u.channels).filter(x => x[1]).map(x => x[0]).join(', ')); save(); return pub(u); },
  // зміна контактів та каналу OTP — завжди з підтвердженням кодом
  async contactChangeStart(token, kind, value) {
    await delay(); const u = auth(token);
    if (kind === 'phone') { value = normPhone(value); if (Object.values(db.users).some(x => x.phone === value)) throw new ApiError('exists', 'Цей номер уже використовується.'); }
    else if (kind === 'email') { if (String(value).length > 120 || !/^[^@\s<>"']+@[^@\s<>"']+\.[^@\s<>"']+$/.test(value)) throw new ApiError('validation', 'Некоректна адреса електронної пошти.'); }
    else if (kind === 'otpChannel') { if (value === 'email' && !u.email) throw new ApiError('validation', 'Спершу додайте адресу електронної пошти.'); }
    else throw new ApiError('validation', 'Невідомий тип контакту');
    const viaEmail = kind === 'email' || (kind === 'otpChannel' && value === 'email');
    const r = sendOtp({ userId: u.id, phone: u.phone, purpose: 'contact', channel: viaEmail ? 'email' : 'sms', target: kind === 'email' ? value : viaEmail ? u.email : kind === 'phone' ? value : u.phone, payload: { kind, value } });
    save(); return r;
  },
  async contactChangeFinish(token, challengeId, code) {
    await delay(); const u = auth(token); const ch = checkOtp(challengeId, code, 'contact'); const { kind, value } = ch.payload;
    if (kind === 'phone') { u.phone = value; log(u, 'critical', 'Змінено номер телефону', 'crit'); }
    if (kind === 'email') { u.email = value; log(u, 'critical', 'Змінено адресу електронної пошти', 'crit'); }
    if (kind === 'otpChannel') { u.otpChannel = value; log(u, 'critical', 'Змінено канал надсилання OTP-коду: ' + value, 'crit'); }
    save(); return pub(u);
  },
  async setTwoStep(token, password, current) {
    await delay(); const u = auth(token);
    if (u.twoStep && await sha(u.twoStep.salt + (current || '')) !== u.twoStep.hash) { log(u, 'security', 'Невірний поточний пароль при зміні двоетапної перевірки', 'warn'); save(); throw new ApiError('bad_password', 'Невірний поточний пароль.'); }
    if (password) { if (password.length < 8) throw new ApiError('weak', 'Пароль має містити щонайменше 8 символів.'); const salt = uid(); u.twoStep = { salt, hash: await sha(salt + password) }; log(u, 'critical', 'Увімкнено двоетапну перевірку (пароль)', 'crit'); }
    else { u.twoStep = null; log(u, 'critical', 'Вимкнено двоетапну перевірку', 'crit'); }
    save(); return pub(u);
  },
  async setRestricted(token, on) { await delay(); const u = auth(token); u.restricted = !!on; log(u, 'critical', on ? 'Використання акаунта обмежено користувачем' : 'Обмеження акаунта знято', 'crit'); save(); return pub(u); },
  async deleteStart(token) { await delay(); const u = auth(token); const r = sendOtp({ userId: u.id, phone: u.phone, purpose: 'delete', channel: u.otpChannel === 'email' && u.email ? 'email' : 'sms', target: u.otpChannel === 'email' ? u.email : u.phone }); save(); return r; },
  async deleteFinish(token, challengeId, code) {
    await delay(); const u = auth(token); checkOtp(challengeId, code, 'delete');
    log({ id: null, phone: maskPhone(u.phone) }, 'critical', 'Обліковий запис видалено на вимогу користувача', 'crit');
    for (const k of ['outages', 'cars', 'subs', 'appts', 'requests']) delete db[k][u.id];
    for (const t in db.sessions) if (db.sessions[t].userId === u.id) delete db.sessions[t];
    delete db.users[u.id]; save(); return { ok: true };
  },
  // підвищення рівня через ІСЕІ (Дія / BankID) — тут емуляція редіректу
  async elevate(token, method) {
    await delay(700); const u = auth(token);
    if (!u.consentAt || !u.last) throw new ApiError('validation', 'Спершу заповніть профіль.');
    const from = u.level; u.level = 2; u.verifiedBy = method === 'bankid' ? 'BankID НБУ' : 'Дія';
    log(u, 'critical', 'Рівень авторизації підвищено ' + from + ' → 2 через ' + u.verifiedBy, 'crit');
    addRequest(u, { type: 'auth', title: 'Підвищення рівня авторизації через ' + u.verifiedBy, docs: [] });
    save(); return pub(u);
  },
  async myLog(token) { await delay(); const u = auth(token); return db.log.filter(l => l.userId === u.id).slice(0, 200); },
  async faq() {
    return [
      ['Що таке «Кабінет мешканця Дніпра»?', 'Це вебінтерфейс до міських електронних послуг, які надає АС ВВО МР. Той самий обліковий запис працює в мобільному застосунку «єДніпро».'],
      ['Які бувають рівні авторизації?', 'Рівень 0 — номер підтверджено, профіль не заповнено. Рівень 1 — профіль заповнено, надано згоду на обробку даних. Рівень 2 — особу підтверджено через Дія або BankID. Що вищий рівень, то більше сервісів доступно.'],
      ['Як підвищити рівень?', 'У розділі «Акаунт» натисніть «Підвищити рівень» і пройдіть ідентифікацію через Дію або BankID.'],
      ['Не приходить код підтвердження', 'Перевірте канал надсилання коду в розділі «Акаунт → Безпека». Код дійсний 3 хвилини, після п’яти невірних спроб його треба запросити знову.'],
      ['Як отримувати попередження про відключення світла?', 'Додайте графік на головній сторінці та ввімкніть сповіщення. Попередження надходить за 10 хвилин до відключення.'],
      ['Як видалити обліковий запис?', '«Акаунт → Керування акаунтом → Видалити обліковий запис». Дію потрібно підтвердити кодом. Замість видалення можна тимчасово обмежити використання акаунта.'],
      ['Де зберігаються мої дані?', 'Усі дані зберігаються на серверах Замовника в АС ВВО МР. Вебкабінет власної бази персональних даних не веде.'],
    ];
  },
  async consentText() { return 'Я, користуючись «Кабінетом мешканця Дніпра», надаю згоду на обробку моїх персональних даних (прізвище, ім’я, по батькові, дата народження, номер телефону, адреса електронної пошти, відомості, необхідні для надання обраних муніципальних послуг) відповідно до Закону України «Про захист персональних даних». Мета обробки — надання електронних муніципальних послуг через АС ВВО МР. Володілець даних — Замовник системи. Дані зберігаються на серверах Замовника протягом строку користування обліковим записом. Я маю право на доступ до своїх даних, їх виправлення та видалення, а також на відкликання цієї згоди шляхом видалення облікового запису.'; },

  // ----- Головна -----
  async news() { await delay(); return load().news.slice().sort((a, b) => b.ts - a.ts); },
  async fuel() {
    await delay(); // демо-значення: у промисловій версії надходять з парсера/API цін АЗС через АС ВВО МР
    const d = Math.floor(now() / DAY); const j = k => ((hashNum(k + d) % 40) - 20) / 100;
    return { demo: true, updatedAt: now() - 3600e3, items: [['А-95+', 62.4], ['А-95', 59.9], ['А-92', 57.3], ['ДП', 60.2], ['Газ', 36.8]].map(([name, p]) => ({ name, price: +(p + j(name)).toFixed(2), delta: +j(name + 'x').toFixed(2) })) };
  },
  async outagesList(token) { await delay(60); const u = need(token, 'outages'); return (db.outages[u.id] || []).slice(); },
  async outagesSave(token, item) {
    await delay(); const u = need(token, 'outages'); const list = (db.outages[u.id] ||= []);
    if (!item.name?.trim()) throw new ApiError('validation', 'Вкажіть назву локації.');
    if (!['dtek', 'cek'].includes(item.operator) || !/^[1-6]\.[12]$/.test(item.group)) throw new ApiError('validation', 'Оберіть оператора та групу.');
    const clean = { name: item.name.trim().slice(0, 40), operator: item.operator, group: item.group, notify: !!item.notify };
    if (item.id) { const i = list.findIndex(x => x.id === item.id); if (i < 0) throw new ApiError('not_found', 'Графік не знайдено'); list[i] = { ...list[i], ...clean }; }
    else list.push({ id: uid('o'), ...clean });
    log(u, 'settings', (item.id ? 'Змінено' : 'Додано') + ' графік відключень «' + clean.name + '»'); save(); return list.slice();
  },
  async outagesDelete(token, id) { await delay(); const u = need(token, 'outages'); db.outages[u.id] = (db.outages[u.id] || []).filter(x => x.id !== id); log(u, 'settings', 'Видалено графік відключень'); save(); return db.outages[u.id].slice(); },

  // ----- Медичний кабінет (МІС «Каштан») -----
  async medPatients(token) {
    await delay(); const u = need(token, 'medical');
    const self = { id: 'p_' + u.id, name: [u.last, u.first, u.middle].filter(Boolean).join(' '), birth: u.birth, card: 'К-' + (100000 + hashNum(u.id) % 899999), facilityId: (db.appts[u.id] || []).map(a => a.doctorId.split('_')[0])[0] || FAC_IDS[hashNum(u.id) % FAC_IDS.length], doctorId: null, relation: 'Власник номера' };
    const list = [self];
    if (u.id === 'u_demo2' || (u.id !== 'u_demo5' && hashNum(u.phone) % 2 === 0)) list.push({ id: 'p_' + u.id + '_c', name: u.last + ' Марія ' + (u.id === 'u_demo2' ? 'Андріївна' : 'Олександрівна'), birth: '2016-06-03', card: 'К-' + (100000 + hashNum(u.id + 'c') % 899999), facilityId: self.facilityId, doctorId: null, relation: 'Картка з тим самим номером телефону' });
    for (const p of list) { const docs = doctorsOf(p.facilityId); p.doctorId = docs[p.id.endsWith('_c') ? 1 : 0].id; p.doctor = docs.find(d => d.id === p.doctorId); }
    return list;
  },
  async medDoctors(token, facilityId) { await delay(); need(token, 'medical'); return doctorsOf(facilityId); },
  async medSlots(token, doctorId) { await delay(); need(token, 'medical'); return slotsFor(doctorId); },
  async medBook(token, { patient, doctor, facility, ts }) {
    await delay(400); const u = need(token, 'medical');
    // серверу не можна довіряти даним із клієнта: пацієнта, лікаря і час перевіряємо самі
    const pat = (await api.medPatients(token)).find(p => p.id === patient?.id); if (!pat) throw new ApiError('validation', 'Пацієнта не знайдено серед ваших медичних карток.');
    const doc = doctorsOf(String(doctor?.id || '').split('_')[0]).find(d => d.id === doctor?.id); if (!doc) throw new ApiError('validation', 'Лікаря не знайдено.');
    const slot = slotsFor(doc.id).flatMap(d => d.slots).find(x => x.ts === ts);
    if (!slot || slot.busy) throw new ApiError('busy', 'Цей час недоступний. Оберіть інший.');
    const a = { id: uid('a'), patientId: pat.id, patientName: pat.name, doctorId: doc.id, doctorName: doc.name, spec: doc.spec, room: doc.room, facilityName: facName(doc.facilityId), facilityAddress: facility?.address ? String(facility.address).slice(0, 120) : null, ts, status: 'Заплановано', createdAt: now() };
    (db.appts[u.id] ||= []).unshift(a);
    const req = addRequest(u, { type: 'medical', title: 'Запис до лікаря: ' + doc.spec + ', ' + doc.name, status: 'Заплановано', refId: a.id, docs: [{ id: uid('d'), kind: 'talon', name: 'Талон на прийом', data: a }] });
    a.requestId = req.id; log(u, 'critical', 'Запис до лікаря (' + doc.name + ') для пацієнта ' + pat.name, 'info'); save(); return a;
  },
  async medAppointments(token) { await delay(); const u = need(token, 'medical'); return (db.appts[u.id] || []).slice(); },
  async medCancel(token, id) { await delay(); const u = need(token, 'medical'); const a = (db.appts[u.id] || []).find(x => x.id === id); if (!a) throw new ApiError('not_found', 'Запис не знайдено'); if (a.status !== 'Заплановано') throw new ApiError('validation', 'Цей запис уже неактивний.'); a.status = 'Скасовано'; const r = (db.requests[u.id] || []).find(x => x.refId === id); if (r) r.status = 'Скасовано'; log(u, 'critical', 'Скасовано запис до лікаря ' + a.doctorName); save(); return a; },

  // ----- Паркування (ЄПП) -----
  async carsList(token) { await delay(60); const u = need(token, 'parking'); return (db.cars[u.id] || []).slice(); },
  async carsAdd(token, { plate, kind, title }) {
    await delay(); const u = need(token, 'parking'); const p = normPlate(plate, kind); const list = (db.cars[u.id] ||= []);
    if (list.some(c => c.plate === p)) throw new ApiError('exists', 'Цей автомобіль уже додано.');
    list.push({ id: uid('c'), plate: p, kind, title: (title || '').trim().slice(0, 40), source: 'Додано в кабінеті' }); log(u, 'settings', 'Додано автомобіль ' + p); save(); return list.slice();
  },
  async carsDelete(token, id) { await delay(); const u = need(token, 'parking'); db.cars[u.id] = (db.cars[u.id] || []).filter(c => c.id !== id); log(u, 'settings', 'Видалено автомобіль'); save(); return db.cars[u.id].slice(); },
  async parkingTariffs() { return { demo: true, items: [{ id: 'day', name: 'Денний', days: 1, price: 80, note: 'Усі майданчики, одна доба' }, { id: 'week', name: 'Тижневий', days: 7, price: 400, note: 'Усі майданчики, 7 діб' }, { id: 'month', name: 'Місячний', days: 30, price: 1200, note: 'Усі майданчики, 30 діб' }] }; },
  async subsList(token) { await delay(60); const u = need(token, 'parking'); return (db.subs[u.id] || []).slice(); },
  async subsBuy(token, { plate, tariffId, start }) {
    await delay(600); const u = need(token, 'parking'); need(token, 'payments');
    const t = (await api.parkingTariffs()).items.find(x => x.id === tariffId); if (!t) throw new ApiError('validation', 'Оберіть абонемент.');
    if (!(db.cars[u.id] || []).some(c => c.plate === plate)) throw new ApiError('validation', 'Абонемент можна придбати лише для автомобіля, доданого у вашому кабінеті.');
    const from = start ? new Date(start + 'T00:00:00').getTime() : now(); if (!(from > now() - DAY)) throw new ApiError('validation', 'Дата початку не може бути в минулому.');
    const s = { id: uid('s'), plate, tariff: t.name, price: t.price, from, to: from + t.days * DAY, paidAt: now(), payId: 'PAY-' + uid().toUpperCase() };
    (db.subs[u.id] ||= []).unshift(s);
    addRequest(u, { type: 'parking', title: 'Паркувальний абонемент «' + t.name + '» для ' + plate, status: 'Оплачено', docs: [{ id: uid('d'), kind: 'sub', name: 'Абонемент', data: s }, { id: uid('d'), kind: 'receipt', name: 'Квитанція про оплату', data: { payId: s.payId, amount: t.price, purpose: 'Паркувальний абонемент «' + t.name + '», авто ' + plate, paidAt: s.paidAt } }] });
    log(u, 'critical', 'Оплата абонемента «' + t.name + '» для ' + plate + ', ' + t.price + ' грн', 'crit'); save(); return s;
  },
  async finesSearch(token, plates) {
    await delay(500); const u = need(token, 'parking');
    if (!Array.isArray(plates) || !plates.length || plates.length > 20) throw new ApiError('validation', 'Вкажіть від 1 до 20 номерів.');
    const out = plates.flatMap(p => finesFor(p));
    log(u, 'access', 'Пошук штрафів за паркування: ' + plates.map(p => String(p).slice(0, 12)).join(', ')); save(); return out;
  },
  async finesPay(token, fineRef) {
    await delay(600); const u = need(token, 'parking'); need(token, 'payments');
    const fine = finesFor(fineRef?.plate).find(f => f.id === fineRef?.id); // суму й реквізити беремо зі свого обліку, а не з запиту
    if (!fine) throw new ApiError('not_found', 'Постанову не знайдено.');
    if (fine.paid) throw new ApiError('paid', 'Штраф уже сплачено.');
    const pay = { payId: 'PAY-' + uid().toUpperCase(), paidAt: now() }; db.finesPaid[fine.id] = pay;
    addRequest(u, { type: 'parking', title: 'Сплата штрафу за паркування, постанова ' + fine.no, status: 'Оплачено', docs: [{ id: uid('d'), kind: 'receipt', name: 'Квитанція про оплату', data: { payId: pay.payId, amount: fine.amount, purpose: 'Штраф за паркування, постанова ' + fine.no + ', авто ' + fine.plate, paidAt: pay.paidAt } }] });
    log(u, 'critical', 'Сплата штрафу ' + fine.no + ', ' + fine.amount + ' грн', 'crit'); save(); return pay;
  },

  // ----- Звернення / документи -----
  async requests(token) { await delay(); const u = need(token, 'requests'); return (db.requests[u.id] || []).slice(); },

  // ----- панель адміністратора АС ВВО МР (лише в емуляторі) -----
  admin: {
    state() { reload(); return { users: Object.values(db.users).map(u => ({ ...pub(u), blocked: u.blocked })), rules: { ...db.rules }, rulesVersion: db.rulesVersion, log: db.log.slice(0, 300), alertDemo: db.alertDemo, news: db.news.slice() }; },
    setLevel(id, level) { const u = load().users[id]; if (!u) return; const from = u.level; u.level = level; if (level < 2) u.verifiedBy = null; log(u, 'admin', 'Адміністратор АС ВВО МР змінив рівень авторизації ' + from + ' → ' + level, 'crit'); save(); },
    setBlocked(id, on) { const u = load().users[id]; if (!u) return; u.blocked = on; log(u, 'admin', on ? 'Акаунт заблоковано адміністратором' : 'Акаунт розблоковано адміністратором', 'crit'); save(); },
    setRule(section, level) { load().rules[section] = level; db.rulesVersion++; log(null, 'admin', 'Змінено правило доступу: «' + SECTIONS[section] + '» — від рівня ' + level, 'crit'); save(); },
    setAlert(v) { load().alertDemo = v; save(); },
    addNews(title, body, tag) { load().news.unshift({ id: uid('n'), ts: now(), tag: tag || 'Місто', title, body }); log(null, 'admin', 'Опубліковано новину: ' + title); save(); },
    reset() { localStorage.removeItem(DB_KEY); db = null; load(); },
  },
};

const PLACES = ['просп. Дмитра Яворницького, 64', 'вул. Короленка, 2', 'вул. Січеславська Набережна, 15', 'вул. Володимира Мономаха, 9'];
function finesFor(raw) {
  const plate = String(raw || '').toUpperCase().replace(/[\s-]/g, ''); if (!/^[0-9A-ZА-ЯІЇЄҐ]{2,10}$/.test(plate)) return [];
  const out = [], n = hashNum(plate) % 3;
  for (let i = 0; i < n; i++) { const id = 'F' + plate + i, h = hashNum(id); out.push({ id, plate, no: 'ДП' + (10000000 + h % 89999999), date: now() - (3 + h % 40) * DAY, place: PLACES[h % 4], article: 'ч. 1 ст. 152¹ КУпАП', amount: h % 2 ? 340 : 680, paid: load().finesPaid[id] || null }); }
  return out;
}
function slotsFor(doctorId) {
  const out = []; const taken = new Set(Object.values(load().appts).flat().filter(a => a.status === 'Заплановано').map(a => a.doctorId + '|' + a.ts));
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  for (let i = 0; i < 10 && out.length < 6; i++) {
    const d = new Date(d0.getTime() + i * DAY); if (d.getDay() === 0 || d.getDay() === 6) continue;
    const slots = [];
    for (let m = 9 * 60; m < 17 * 60; m += 20) { const ts = d.getTime() + m * 60000; if (ts < now() + 30 * 60000) continue; slots.push({ ts, busy: hashNum(doctorId + ts) % 3 === 0 || taken.has(doctorId + '|' + ts) }); }
    if (slots.length) out.push({ day: d.getTime(), slots });
  }
  return out;
}
// ПІБ: лише літери, пробіл, дефіс, апостроф; до 60 знаків
function cleanName(v, label, required) {
  const x = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (!x) { if (required) throw new ApiError('validation', 'Вкажіть прізвище та ім’я.'); return ''; }
  if (x.length > 60 || !/^[\p{L}][\p{L} '’ʼ-]*$/u.test(x)) throw new ApiError('validation', label + ': лише літери, дефіс та апостроф, до 60 знаків.');
  return x;
}
function cleanBirth(v) { if (!v) return ''; const t = Date.parse(v + 'T00:00:00'); if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(t) || t > now() || t < Date.parse('1900-01-01')) throw new ApiError('validation', 'Некоректна дата народження.'); return v; }
function normPlate(plate, kind) {
  const p = String(plate || '').toUpperCase().replace(/[\s-]/g, '');
  if (kind === 'ua') { if (!/^[АВЕІКМНОРСТХABEIKMHOPCTX]{2}\d{4}[АВЕІКМНОРСТХABEIKMHOPCTX]{2}$/.test(p)) throw new ApiError('validation', 'Державний номер має формат АА1234ВВ.'); return p; }
  if (!/^[0-9A-ZА-ЯІЇЄҐ]{2,10}$/.test(p)) throw new ApiError('validation', 'Номер має містити від 2 до 10 літер і цифр.');
  return p;
}
const SPECS = ['Сімейний лікар', 'Педіатр', 'Терапевт', 'Сімейний лікар', 'Гінеколог'];
const LN = ['Мельник', 'Бондаренко', 'Ткаченко', 'Кравченко', 'Олійник', 'Шевчук', 'Поліщук', 'Лисенко', 'Гаврилюк', 'Марченко'];
const FN = ['Ірина Василівна', 'Олег Миколайович', 'Наталія Сергіївна', 'Віктор Андрійович', 'Тетяна Олексіївна', 'Сергій Іванович', 'Людмила Петрівна'];
function doctorsOf(facilityId) {
  return SPECS.map((spec, i) => { const h = hashNum(facilityId + '|' + i); return { id: facilityId + '_d' + i, facilityId, spec, name: LN[h % LN.length] + ' ' + FN[(h >>> 4) % FN.length], room: 100 + (h % 40) }; });
}
