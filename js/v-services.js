// Перелік сервісів, сервіс «Мапи» (п. 2.1.3.9) та історія звернень із документами (п. 2.1.2).
import { api } from './asvvo.js';
import * as ext from './ext.js';
import { $, esc, fmt, icon, session, toast, acts, pageHead, empty, makeMap, viewDoc, download, docHtml } from './core.js';

export async function servicesView(root) {
  const items = [
    ['medical', 'med', 'Медичний кабінет', 'Картки пацієнтів і запис до лікаря', '#/medical'],
    ['maps', 'map', 'Мапи', 'Укриття та громадські вбиральні', '#/maps/shelters'],
    ['parking', 'car', 'Паркування', 'Абонементи, автомобілі та штрафи', '#/parking'],
    ['outages', 'bolt', 'Графіки відключень', 'Світло за вашою адресою', '#/home'],
    ['requests', 'doc', 'Звернення та документи', 'Історія заяв і сформовані документи', '#/requests'],
  ];
  root.innerHTML = pageHead('Сервіси') + `<div class="grid svc-grid">${items.map(([sec, ic, t, d, href]) => {
    const ok = session.can(sec);
    return `<a class="card svc ${ok ? '' : 'is-locked'}" href="${href}"><span class="svc-ic">${icon(ic)}</span><div><b>${t}</b><span>${d}</span></div>${ok ? icon('right') : `<span class="tag lock">${icon('lock')} з рівня ${session.needLevel(sec)}</span>`}</a>`;
  }).join('')}</div><p class="muted sm">Набір сервісів і потрібний рівень авторизації визначає АС ВВО МР. Зміни застосовуються в кабінеті автоматично.</p>`;
}

const dist = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) * r / 2), y = (c - a) * r; return Math.sqrt(x * x + y * y) * R; };
export async function mapsView(root, ctx) {
  const kind = ctx.params[0] === 'toilets' ? 'toilets' : 'shelters';
  const { items } = await ext.staticData(kind); let me = null;
  const label = kind === 'shelters' ? 'Укриття' : 'Вбиральні';
  const meta = p => kind === 'shelters' ? esc(p.type) + (p.capacity ? ' · місткість ' + esc(p.capacity) : '') : [p.fee === 'yes' ? 'платна' : p.fee === 'no' ? 'безкоштовна' : null, p.wheelchair === 'yes' ? 'доступна для крісел колісних' : null, p.hours ? 'графік: ' + esc(p.hours) : null].filter(Boolean).join(' · ') || 'Громадська вбиральня';
  root.innerHTML = pageHead('Мапи', '#/services') + `<div class="row between wrap gap"><div class="seg"><a class="${kind === 'shelters' ? 'on' : ''}" href="#/maps/shelters">Мапа укриттів</a><a class="${kind === 'toilets' ? 'on' : ''}" href="#/maps/toilets">Мапа вбиралень</a></div><button class="btn sm ghost" data-act="near">${icon('map')} Найближчі до мене</button></div>
    ${kind === 'shelters' ? `<div class="note warn">${icon('info')}<span><b>Демо-набір.</b> Показано станції метро та об’єкти з OpenStreetMap (${items.length}). Повний офіційний перелік укриттів надходить із набору даних АС ВВО МР. Не використовуйте демо для вибору реального укриття.</span></div>` : `<div class="note">${icon('info')}<span>Набір даних: OpenStreetMap, об’єктів: ${items.length}. У робочій версії — набір даних АС ВВО МР.</span></div>`}
    <div class="map-layout"><div class="card map-card"><div id="citymap" class="map tall" role="application" aria-label="${label} на мапі"></div></div><aside class="card side"><h3>${label}</h3><div class="st-list" id="pl-list"></div></aside></div>`;
  const marks = {}; let M = null;
  const list = () => {
    const arr = items.map(p => ({ ...p, d: me ? dist(me[0], me[1], p.lat, p.lon) : null })); if (me) arr.sort((a, b) => a.d - b.d);
    $('#pl-list', root).innerHTML = arr.map(p => `<button class="st" data-act="go" data-id="${p.id}"><span class="pin-ic">${icon(kind === 'shelters' ? 'shield' : 'map')}</span><span>${esc(p.name)}<small>${meta(p)}${p.d != null ? ' · ' + (p.d < 1 ? Math.round(p.d * 1000) + ' м' : fmt.num(p.d, 1) + ' км') : ''}</small></span></button>`).join('') || empty('Об’єктів не знайдено.');
  };
  list();
  acts(root, {
    go: el => { const p = items.find(x => x.id === el.dataset.id); if (M && p) { M.map.setView([p.lat, p.lon], 16); marks[p.id]?.openPopup(); $('#citymap', root).scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } },
    near: () => { if (!navigator.geolocation) return toast('Геолокація недоступна в цьому браузері.', 'warn'); navigator.geolocation.getCurrentPosition(pos => { me = [pos.coords.latitude, pos.coords.longitude]; list(); if (M) { M.L.circleMarker(me, { radius: 8, color: '#1463ff', fillOpacity: .9 }).addTo(M.map).bindTooltip('Ви тут'); M.map.setView(me, 14); } toast('Список відсортовано за відстанню. Координати не передаються на сервер.'); }, () => toast('Не вдалося визначити місцезнаходження.', 'warn'), { timeout: 8000 }); },
  });
  try {
    M = await makeMap($('#citymap', root)); ctx.onLeave(() => M.map.remove());
    const color = kind === 'shelters' ? '#1f7a4d' : '#1463ff';
    for (const p of items) marks[p.id] = M.L.circleMarker([p.lat, p.lon], { radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(M.map).bindPopup(`<b>${esc(p.name)}</b><br>${meta(p)}<br><a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}" target="_blank" rel="noopener">Прокласти маршрут</a>`);
  } catch (e) { $('#citymap', root).innerHTML = empty('Мапу не вдалося завантажити.', esc(e.message)); }
}

const ST = { 'Виконано': 'ok', 'Оплачено': 'ok', 'Заплановано': 'info', 'Скасовано': 'mute' };
export async function requestsView(root) {
  const list = await api.requests(session.token); const types = { medical: 'med', parking: 'car', auth: 'shield' };
  root.innerHTML = pageHead('Звернення та документи') + (list.length ? `<div class="stack">${list.map(r => `<article class="card req"><div class="row gap top"><span class="svc-ic sm">${icon(types[r.type] || 'doc')}</span><div class="grow"><b>${esc(r.title)}</b><small class="muted">№ ${esc(r.no)} · ${fmt.dt(r.createdAt)}</small></div><span class="tag st-${ST[r.status] || 'info'}">${esc(r.status)}</span></div>
      ${r.docs.length ? `<div class="docs">${r.docs.map(d => `<div class="docrow">${icon('doc')}<span class="grow">${esc(d.name)}</span><button class="btn sm ghost" data-act="view" data-r="${r.id}" data-d="${d.id}">Переглянути</button><button class="icon-btn" data-act="save" data-r="${r.id}" data-d="${d.id}" aria-label="Зберегти документ">${icon('down')}</button></div>`).join('')}</div>` : ''}</article>`).join('')}</div>`
    : empty('Звернень поки немає.', 'Тут з’являться записи до лікаря, оплати та інші заяви разом зі сформованими документами.'));
  const find = el => { const r = list.find(x => x.id === el.dataset.r); return [r.docs.find(x => x.id === el.dataset.d), r]; };
  acts(root, { view: el => { const [d, r] = find(el); viewDoc(d, r, session.user); }, save: el => { const [d, r] = find(el); download(`${d.name} ${r.no}.html`, docHtml(d, r, session.user)); toast('Документ збережено'); } });
}
