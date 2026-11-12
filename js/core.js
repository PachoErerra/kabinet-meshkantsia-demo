// Спільні інструменти інтерфейсу: екранування, тости, модальні вікна, форматування, сесія.
import { api, ApiError, onOtp } from './asvvo.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DTF = (o) => new Intl.DateTimeFormat('uk-UA', o);
export const fmt = {
  date: t => DTF({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(t)),
  dateLong: t => DTF({ day: 'numeric', month: 'long', weekday: 'long' }).format(new Date(t)),
  dayShort: t => DTF({ weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(t)),
  time: t => DTF({ hour: '2-digit', minute: '2-digit' }).format(new Date(t)),
  dt: t => DTF({ day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(t)),
  money: n => new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' грн',
  num: (n, d = 0) => n == null ? '—' : new Intl.NumberFormat('uk-UA', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n),
  ago(t) { const m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'щойно'; if (m < 60) return m + ' хв тому'; const h = Math.round(m / 60); if (h < 24) return h + ' год тому'; return fmt.date(t); },
  phone: p => p ? p.replace(/^(\+380)(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5') : '',
  temp: v => v == null ? '—' : (v > 0 ? '+' : '') + Math.round(v) + '°',
};

// ---------- іконки (власний мінімальний набір) ----------
const P = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  doc: '<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4"/><path d="M9.5 12h6M9.5 15.5h6"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c1-4 4-5.8 7.5-5.8s6.5 1.8 7.5 5.8"/>',
  med: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>',
  map: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  car: '<path d="M5 16.5v-4l1.8-5h10.4l1.8 5v4"/><path d="M4 16.5h16v2.5h-3v-1.5H7V19H4z"/><path d="M5.5 12.5h13"/>',
  bolt: '<path d="M13 3 5.5 13.5H11l-1 7.5 7.5-10.5H12z"/>',
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="m9.3 12 2 2 3.6-3.8"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>', edit: '<path d="M5 19l1-4L16.5 4.5l3 3L9 18z"/><path d="M14.5 6.5l3 3"/>',
  trash: '<path d="M5 7h14M9.5 7V4.5h5V7M7 7l.8 12.5h8.4L17 7"/>', back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>', right: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  out: '<path d="M10 4.5H5.5v15H10"/><path d="M14 8l4 4-4 4M18 12H9"/>', down: '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.7v.3"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.3c-.5-1-1.5-1.5-2.8-1.5-1.7 0-2.8.8-2.8 2.1 0 3 5.8 1.3 5.8 4.3 0 1.300-1.2 2.100-3 2.100-1.400 0-2.500-.600-3-1.700M12 6v12"/>',
  news: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M7.500 9h5M7.500 12.500h9M7.500 15.500h9"/>', check: '<path d="m5.500 12.500 4.200 4.200L18.500 7.500"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.500"/><path d="M11 18h2"/>', key: '<circle cx="8.500" cy="14.500" r="3.500"/><path d="m11 12 8-8M16 7l2.500 2.500"/>',
  list: '<path d="M8.500 7h11M8.500 12h11M8.500 17h11M4.500 7h.01M4.500 12h.01M4.500 17h.01"/>', help: '<circle cx="12" cy="12" r="8.500"/><path d="M9.700 9.500a2.400 2.400 0 1 1 3.500 2.200c-.800.500-1.200 1-1.200 2M12 16.700v.300"/>',
};
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

// ---------- тости ----------
export function toast(text, kind = 'ok', ms = 3800) {
  const box = $('#toasts'); const el = document.createElement('div');
  el.className = 'toast ' + kind; el.setAttribute('role', kind === 'err' ? 'alert' : 'status'); el.innerHTML = text;
  box.append(el); const kill = () => { el.classList.add('hide'); setTimeout(() => el.remove(), 250); };
  el.addEventListener('click', kill); if (ms) setTimeout(kill, ms); return kill;
}
export const fail = e => { if (e?.code === 'unauthorized' || e?.code === 'blocked') { session.clear(); location.hash = '#/login'; } toast(esc(e instanceof ApiError ? e.message : 'Не вдалося виконати дію. ' + (e?.message || '')), 'err', 5000); };
// «SMS» від емулятора: показуємо код на екрані, бо справжнього шлюзу в демо немає
export const clearOtp = () => document.querySelectorAll('.toast.sms').forEach(t => t.remove());
onOtp(({ code, channel, masked }) => { clearOtp(); toast(`<b>Демо-${channel === 'email' ? 'лист' : 'SMS'} на ${esc(masked)}</b><br>Код підтвердження: <b class="otp-demo">${code}</b><br><small>У робочій версії код надсилає центральний сервер АС ВВО МР</small>`, 'sms', 25000); });

// ---------- модальні вікна ----------
export function modal({ title, body, wide = false, onMount }) {
  const wrap = document.createElement('div'); wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Закрити">✕</button></div><div class="modal-body">${body}</div></div>`;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey); document.body.append(wrap);
  const el = $('.modal-body', wrap); onMount?.(el, close);
  setTimeout(() => (el.querySelector('[autofocus]') || el.querySelector('input,select,textarea,button'))?.focus(), 30);
  return { el, close };
}
export function confirmDlg(title, text, ok = 'Підтвердити', danger = false) {
  return new Promise(res => {
    let done = false;
    const m = modal({ title, body: `<p>${text}</p><div class="row end gap"><button class="btn ghost" data-close>Скасувати</button><button class="btn ${danger ? 'danger' : ''}" data-ok>${esc(ok)}</button></div>`, onMount(el, close) { el.querySelector('[data-ok]').onclick = () => { done = true; close(); res(true); }; } });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) res(false); } }); obs.observe(document.body, { childList: true });
  });
}
// Запит OTP-коду. start() надсилає код, finish(challengeId, code) перевіряє.
export function otpDlg({ title = 'Підтвердження кодом', start, finish }) {
  return new Promise(async (res) => {
    let ch; try { ch = await start(); } catch (e) { fail(e); return res(null); }
    let done = false;
    const m = modal({
      title, body: `<p>Ми надіслали код на <b>${esc(ch.masked)}</b>${ch.channel === 'email' ? ' (ел. пошта)' : ' (SMS)'}. Введіть його нижче.</p>
        <form class="stack"><input class="input otp" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" required autofocus>
        <div class="row between"><button type="button" class="link" data-again>Надіслати ще раз</button><button class="btn">Підтвердити</button></div></form>`,
      onMount(el, close) {
        el.querySelector('[data-again]').onclick = async () => { try { ch = await start(); toast('Код надіслано повторно'); } catch (e) { fail(e); } };
        el.querySelector('form').onsubmit = async e => { e.preventDefault(); const b = el.querySelector('.btn'); b.disabled = true; try { const r = await finish(ch.challengeId, el.querySelector('[name=code]').value); clearOtp(); done = true; close(); res(r ?? true); } catch (er) { fail(er); b.disabled = false; } };
      },
    });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) res(null); } }); obs.observe(document.body, { childList: true });
  });
}
// Емуляція платіжного сервісу: даних картки не збираємо взагалі
export function payDlg({ amount, purpose }) {
  return confirmDlg('Оплата', `<span class="pay-sum">${fmt.money(amount)}</span><br>${esc(purpose)}<br><br><small class="muted">Демо: платіжний сервіс АС ВВО МР емулюється, реальні кошти не списуються, дані картки не запитуються.</small>`, 'Сплатити ' + fmt.money(amount));
}

// ---------- сесія ----------
const TOKEN_KEY = 'kmd.token';
export const session = {
  token: null, user: null, rules: {}, rulesVersion: 0, alertDemo: null, listeners: new Set(),
  init() { this.token = localStorage.getItem(TOKEN_KEY); },
  set(token) { this.token = token; localStorage.setItem(TOKEN_KEY, token); },
  clear() { this.token = null; this.user = null; localStorage.removeItem(TOKEN_KEY); },
  async refresh() {
    if (!this.token) { this.user = null; return null; }
    try {
      const r = await api.me(this.token); const before = this.user ? this.user.level + '|' + this.rulesVersion + '|' + this.user.restricted : null;
      Object.assign(this, { user: r.user, rules: r.rules, rulesVersion: r.rulesVersion, alertDemo: r.alertDemo });
      const after = r.user.level + '|' + r.rulesVersion + '|' + r.user.restricted;
      if (before && before !== after) this.listeners.forEach(f => f(before, after));
      return r.user;
    } catch (e) { const was = !!this.user; this.clear(); if (was) { toast(esc(e.message), 'err'); location.hash = '#/login'; } return null; }
  },
  can(section) { return !!this.user && this.user.level >= (this.rules[section] ?? 0) && !(this.user.restricted && !['home', 'account'].includes(section)); },
  needLevel(section) { return this.rules[section] ?? 0; },
};

export const skeleton = (n = 3) => `<div class="skel-wrap">${'<div class="skel"></div>'.repeat(n)}</div>`;
export const empty = (text, hint = '') => `<div class="empty"><p>${text}</p>${hint ? `<small>${hint}</small>` : ''}</div>`;
export const errBox = (text = 'Не вдалося завантажити дані.') => `<div class="empty err"><p>${text}</p><button class="btn ghost sm" data-act="retry">Спробувати ще раз</button></div>`;
export const demoTag = (t = 'демо-дані') => `<span class="tag demo" title="У демо ці дані згенеровано емулятором. У робочій версії їх віддає АС ВВО МР.">${t}</span>`;

// Документ, сформований у межах послуги: перегляд, друк і збереження
export function docHtml(doc, req, user) {
  const d = doc.data || {}; const who = [user.last, user.first, user.middle].filter(Boolean).join(' ');
  const rows = {
    talon: [['Пацієнт', d.patientName], ['Лікар', `${d.doctorName} (${d.spec})`], ['Заклад', d.facilityName], ['Адреса', d.facilityAddress || '—'], ['Кабінет', d.room], ['Дата і час', d.ts ? fmt.dt(d.ts) : '']],
    receipt: [['Платник', who], ['Призначення', d.purpose], ['Сума', d.amount != null ? fmt.money(d.amount) : ''], ['Ідентифікатор платежу', d.payId], ['Дата і час', d.paidAt ? fmt.dt(d.paidAt) : '']],
    sub: [['Автомобіль', d.plate], ['Абонемент', d.tariff], ['Діє з', d.from ? fmt.date(d.from) : ''], ['Діє до', d.to ? fmt.date(d.to) : ''], ['Вартість', d.price != null ? fmt.money(d.price) : '']],
  }[doc.kind] || [];
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>${esc(doc.name)} ${esc(req.no)}</title><style>body{font:15px/1.5 system-ui,Arial,sans-serif;max-width:640px;margin:32px auto;padding:0 20px;color:#111}h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:18px 0}td{padding:8px 6px;border-bottom:1px solid #ddd;vertical-align:top}td:first-child{color:#555;width:40%}.m{color:#666;font-size:13px}.demo{border:1px dashed #b00;color:#b00;padding:6px 10px;display:inline-block;margin-top:14px;font-size:13px}</style></head><body><div class="m">Кабінет мешканця Дніпра · звернення ${esc(req.no)}</div><h1>${esc(doc.name)}</h1><div class="m">Сформовано ${fmt.dt(req.createdAt)}</div><table>${rows.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table><div class="demo">ДЕМОНСТРАЦІЙНИЙ ДОКУМЕНТ — не має юридичної сили</div></body></html>`;
}
export function download(name, html) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
export function viewDoc(doc, req, user) {
  const html = docHtml(doc, req, user);
  modal({ title: doc.name, wide: true, body: `<iframe class="doc-frame" title="${esc(doc.name)}"></iframe><div class="row end gap"><button class="btn ghost" data-print>Друк / PDF</button><button class="btn" data-save>${icon('down')} Зберегти</button></div>`,
    onMount(el) { const f = el.querySelector('iframe'); f.srcdoc = html; el.querySelector('[data-print]').onclick = () => f.contentWindow.print(); el.querySelector('[data-save]').onclick = () => download(`${doc.name} ${req.no}.html`, html); } });
}

let leafletP = null;
export function leaflet() {
  return leafletP ||= new Promise((res, rej) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.append(l);
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = () => res(window.L); s.onerror = () => { leafletP = null; rej(new Error('Мапа недоступна без мережі')); }; document.head.append(s);
  });
}
export async function makeMap(el, center = [48.4647, 35.0462], zoom = 12) {
  const L = await leaflet(); const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(center, zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(map);
  setTimeout(() => map.invalidateSize(), 60); return { L, map };
}

// Делегування кліків: <button data-act="name"> → map.name(el, event)
export function acts(root, map) {
  root.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (t && root.contains(t) && map[t.dataset.act]) { e.preventDefault(); map[t.dataset.act](t, e); } });
}
export const levelChip = l => `<span class="lvl lvl${l}">Рівень ${l}</span>`;
export const pageHead = (title, back, extra = '') => `<header class="page-head">${back ? `<a class="icon-btn" href="${back}" aria-label="Назад">${icon('back')}</a>` : ''}<h1>${esc(title)}</h1><div class="grow"></div>${extra}</header>`;
