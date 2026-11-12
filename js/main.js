// Точка входу: маршрутизація, каркас, контроль доступу за рівнем авторизації, сповіщення.
import { api, SECTIONS } from './asvvo.js';
import { $, esc, icon, session, toast, fail, levelChip, skeleton } from './core.js';
import * as ext from './ext.js';
import { loginView, welcomeView } from './v-auth.js';
import { homeView, weatherView, airView, financeView } from './v-home.js';
import { servicesView, mapsView, requestsView } from './v-services.js';
import { medicalView } from './v-medical.js';
import { parkingView } from './v-parking.js';
import { accountView, faqView, consentView, logView } from './v-account.js';
import { emulatorView } from './v-emulator.js';

const ROUTES = {
  login: { view: loginView, bare: true, open: true, title: 'Вхід' },
  welcome: { view: welcomeView, bare: true, title: 'Завершення реєстрації' },
  emulator: { view: emulatorView, bare: true, open: true, title: 'Емулятор АС ВВО МР' },
  home: { view: homeView, section: 'home', tab: 'home', title: 'Головна' },
  weather: { view: weatherView, section: 'home', tab: 'home', title: 'Погода' },
  air: { view: airView, section: 'home', tab: 'home', title: 'Якість повітря' },
  finance: { view: financeView, section: 'home', tab: 'home', title: 'Фінанси' },
  services: { view: servicesView, section: 'home', tab: 'services', title: 'Сервіси' },
  medical: { view: medicalView, section: 'medical', tab: 'services', title: 'Медичний кабінет' },
  maps: { view: mapsView, section: 'maps', tab: 'services', title: 'Мапи' },
  parking: { view: parkingView, section: 'parking', tab: 'services', title: 'Паркування' },
  requests: { view: requestsView, section: 'requests', tab: 'requests', title: 'Звернення' },
  account: { view: accountView, section: 'account', tab: 'account', title: 'Акаунт' },
  faq: { view: faqView, section: 'account', tab: 'account', title: 'Часті питання' },
  consent: { view: consentView, section: 'account', tab: 'account', title: 'Згода на обробку даних' },
  log: { view: logView, section: 'account', tab: 'account', title: 'Історія дій' },
};
const TABS = [['home', 'Головна', 'home'], ['services', 'Сервіси', 'grid'], ['requests', 'Звернення', 'doc'], ['account', 'Акаунт', 'user']];

function shell(tab) {
  const u = session.user; const name = [u.first, u.last].filter(Boolean).join(' ') || 'Новий користувач';
  const links = TABS.map(([id, label, ic]) => `<a href="#/${id}" class="${tab === id ? 'on' : ''}" ${tab === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`).join('');
  $('#nav').innerHTML = `<a class="brand" href="#/home"><img src="icons/icon.svg" alt="" width="36" height="36"><div><b>Кабінет мешканця</b><small>Дніпро</small></div></a><nav aria-label="Основна навігація">${links}</nav><a class="who" href="#/account"><div class="ava">${esc((u.first || '?')[0])}</div><div><b>${esc(name)}</b>${levelChip(u.level)}</div></a>`;
  $('#tabbar').innerHTML = links;
}
function lockedView(root, route) {
  const need = session.needLevel(route.section); const u = session.user;
  root.innerHTML = `<div class="card lock-card">${icon('lock', 'big')}<h2>${esc(route.title)}</h2>
    ${u.restricted ? '<p>Використання акаунта обмежено. Зніміть обмеження в розділі «Акаунт», щоб користуватися сервісами.</p><a class="btn" href="#/account">Перейти до акаунта</a>'
      : `<p>Сервіс доступний з рівня авторизації <b>${need}</b>. Ваш рівень — <b>${u.level}</b>.</p><p class="muted">${need >= 2 ? 'Підтвердьте особу через Дію або BankID — це займе хвилину.' : 'Заповніть профіль і надайте згоду на обробку даних.'}</p><a class="btn" href="${u.level === 0 ? '#/welcome' : '#/account?elevate=1'}">Підвищити рівень</a>`}</div>`;
  api.checkAccess(session.token, route.section).catch(() => {}); // фіксуємо спробу в журналі АС ВВО МР
}

let renderSeq = 0, cleanup = null;
async function render() {
  const seq = ++renderSeq; const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [name = '', ...rest] = path.split('/'); const route = ROUTES[name];
  if (!route) { location.hash = session.token ? '#/home' : '#/login'; return; }
  await session.refresh(); if (seq !== renderSeq) return;
  if (!route.open && !session.user) { location.hash = '#/login'; return; }
  if (name === 'login' && session.user) { location.hash = '#/home'; return; }
  if (session.user && session.user.level === 0 && !route.open && name !== 'welcome' && !['home', 'account', 'faq', 'consent', 'services', 'maps', 'weather', 'air', 'finance', 'log'].includes(name)) { /* рівень 0 бачить заблокований екран нижче */ }
  cleanup?.(); cleanup = null;
  document.title = route.title + ' · Кабінет мешканця Дніпра';
  document.body.classList.toggle('bare', !!route.bare);
  if (!route.bare) shell(route.tab);
  const root = document.createElement('div'); root.className = 'view view-' + name;
  const main = $('#view'); main.replaceChildren(root); main.scrollTop = 0; window.scrollTo(0, 0);
  const ctx = { params: rest, query: new URLSearchParams(query), rerender: render, onLeave: fn => { cleanup = fn; } };
  if (route.section && !session.can(route.section)) return lockedView(root, route);
  root.innerHTML = skeleton(4);
  try { await route.view(root, ctx); } catch (e) { if (seq === renderSeq) { fail(e); root.innerHTML = `<div class="empty err"><p>Не вдалося відкрити розділ.</p><button class="btn ghost sm" onclick="location.reload()">Оновити сторінку</button></div>`; } }
  main.focus({ preventScroll: true });
}
window.addEventListener('hashchange', render);

// Зміни рівня чи правил доступу на боці АС ВВО МР застосовуються без повторного входу
session.listeners.add((before, after) => {
  const [l0] = before.split('|'), [l1] = after.split('|');
  toast(l0 !== l1 ? `Ваш рівень авторизації змінено: ${l0} → ${l1}. Доступні сервіси оновлено.` : 'Правила доступу оновлено адміністратором АС ВВО МР.', 'ok', 6000);
  render();
});
setInterval(() => { if (session.token && !document.hidden) session.refresh(); }, 5000);
window.addEventListener('storage', e => { if (e.key && e.key.startsWith('asvvo.')) session.refresh(); if (e.key === 'kmd.token') { session.init(); render(); } });

// ---------- попередження за 10 хвилин до відключення ----------
const notified = new Set(JSON.parse(sessionStorage.getItem('kmd.notified') || '[]'));
async function outageWatch() {
  if (!session.user || !session.can('outages')) return;
  try {
    const list = (await api.outagesList(session.token)).filter(x => x.notify); if (!list.length) return;
    for (const it of list) {
      const s = await ext.outageSchedule(it.operator, it.group); if (!s.today.halves) continue;
      const nowMin = (Date.now() - s.todayTs) / 60000;
      for (const [a, b] of ext.intervals(s.today.halves, 'off')) {
        const left = a * 30 - nowMin; const key = it.id + '|' + s.todayTs + '|' + a;
        if (left > 0 && left <= 10 && !notified.has(key)) {
          notified.add(key); sessionStorage.setItem('kmd.notified', JSON.stringify([...notified]));
          const text = `«${it.name}»: відключення о ${ext.hm(a)} (до ${ext.hm(b)}), за ${Math.ceil(left)} хв`;
          toast(icon('bolt') + ' ' + esc(text), 'warn', 20000);
          if ('Notification' in window && Notification.permission === 'granted') { const reg = await navigator.serviceWorker?.getRegistration(); const opt = { body: text, icon: 'icons/icon-192.png', tag: key }; reg ? reg.showNotification('Скоро відключення світла', opt) : new Notification('Скоро відключення світла', opt); }
        }
      }
    }
  } catch { /* наступна спроба за хвилину */ }
}
setInterval(outageWatch, 60000); setTimeout(outageWatch, 4000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.addEventListener('offline', () => toast('Немає з’єднання з мережею. Показуємо збережені дані.', 'warn'));

session.init();
if (!location.hash) location.hash = session.token ? '#/home' : '#/login';
render();
export { SECTIONS };
