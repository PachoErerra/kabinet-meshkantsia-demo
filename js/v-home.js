// Розділ «Головна» (п. 2.1.3.3): новини, екологія, фінанси, тривога, графіки відключень.
import { api } from './asvvo.js';
import * as ext from './ext.js';
import { $, esc, fmt, icon, session, toast, fail, modal, confirmDlg, acts, pageHead, skeleton, empty, demoTag, makeMap, levelChip } from './core.js';

const cell = (label, value, sub = '') => `<div class="stat"><small>${label}</small><b>${value}</b>${sub ? `<span>${sub}</span>` : ''}</div>`;

export async function homeView(root, ctx) {
  const u = session.user;
  root.innerHTML = `<div id="alert-slot"></div>
    <header class="hello"><div><h1>${u.first ? 'Вітаємо, ' + esc(u.first) + '!' : 'Вітаємо!'}</h1><p class="muted">${fmt.dateLong(Date.now())}</p></div>${levelChip(u.level)}</header>
    ${u.level === 0 ? `<a class="banner" href="#/welcome">${icon('info')}<div><b>Завершіть реєстрацію</b><span>Заповніть профіль, щоб відкрити графіки відключень, паркування та звернення.</span></div>${icon('right')}</a>` : ''}
    <div class="grid home-grid">
      <section class="card" id="w-eco"><h2>${icon('sun')} Екологія</h2>${skeleton(2)}</section>
      <section class="card" id="w-fin"><h2>${icon('coin')} Фінанси</h2>${skeleton(2)}</section>
      <section class="card span2" id="w-out"><h2>${icon('bolt')} Графіки відключень</h2>${skeleton(2)}</section>
      <section class="card span2" id="w-news"><h2>${icon('news')} Новини міста</h2>${skeleton(3)}</section>
    </div>`;
  let alive = true; ctx.onLeave(() => { alive = false; clearInterval(timer); });

  const drawAlert = async () => {
    const a = await ext.alertStatus(session.alertDemo); if (!alive) return;
    $('#alert-slot', root).innerHTML = a.state === 'on' ? `<div class="alert on" role="alert"><span class="dot"></span><div><b>Повітряна тривога</b><span>Дніпропетровська область. Пройдіть до найближчого укриття.</span></div><a class="btn sm light" href="#/maps/shelters">Мапа укриттів</a>${a.demo ? demoTag('демо') : ''}</div>`
      : a.state === 'off' ? `<div class="alert off" role="status"><span class="dot"></span><div><b>Тривоги немає</b><span>Дніпропетровська область</span></div>${a.demo ? demoTag('демо') : ''}</div>`
        : `<div class="alert na" role="status"><span class="dot"></span><div><b>Індикатор повітряної тривоги не підключено</b><span>У демо немає джерела сигналів. У робочій версії статус надходить каналом АС ВВО МР. Орієнтуйтеся на офіційні сповіщення.</span></div></div>`;
  };
  drawAlert(); const timer = setInterval(drawAlert, 30000);

  // --- екологія ---
  Promise.allSettled([ext.weather(), ext.air()]).then(([w, a]) => {
    if (!alive) return; const box = $('#w-eco', root);
    const W = w.value, A = a.value; const lv = ext.aqiLevel(A?.avg);
    box.innerHTML = `<h2>${icon('sun')} Екологія</h2>
      ${W ? `<a class="eco-now" href="#/weather"><span class="wx">${W.now.cond.icon}</span><div><b class="t">${fmt.temp(W.now.temp)}</b><span>${esc(W.now.cond.text)}, відчувається як ${fmt.temp(W.now.feels)}</span></div>${icon('right')}</a>
        <div class="stats">${cell('Вологість', fmt.num(W.now.humidity) + '%')}${cell('Тиск', ext.hPaToMm(W.now.pressure) + ' мм')}${cell('Вітер', fmt.num(W.now.wind, 1) + ' м/с')}${cell('Схід / захід', W.days[0].sunrise + ' / ' + W.days[0].sunset)}</div>` : '<p class="muted">Погода тимчасово недоступна.</p>'}
      ${A ? `<a class="aqi-row" href="#/air"><span class="aqi-badge" style="${ext.aqiStyle(A.avg)}">${A.avg}</span><div><b>Якість повітря: ${lv.text.toLowerCase()}</b><span>Середній індекс AQI по місту${A.stations.length ? ', датчиків: ' + A.stations.length : ''}</span></div>${icon('right')}</a>` : '<p class="muted">Дані про якість повітря тимчасово недоступні.</p>'}`;
  });

  // --- фінанси ---
  Promise.allSettled([ext.rates(), api.fuel()]).then(([r, f]) => {
    if (!alive) return; const R = r.value, F = f.value; const top = R ? ['USD', 'EUR', 'PLN'].map(c => R.items.find(x => x.cc === c)).filter(Boolean) : [];
    $('#w-fin', root).innerHTML = `<h2>${icon('coin')} Фінанси</h2>
      ${R ? `<div class="stats three">${top.map(x => cell(x.cc, fmt.num(x.rate, 2), 'НБУ')).join('')}</div>` : '<p class="muted">Курси НБУ тимчасово недоступні.</p>'}
      ${F ? `<div class="fuel-row">${F.items.slice(0, 4).map(x => `<div><small>${esc(x.name)}</small><b>${fmt.num(x.price, 2)}</b></div>`).join('')}</div><p class="muted sm">Середня ціна пального на АЗС міста, грн/л ${demoTag()}</p>` : ''}
      <a class="more" href="#/finance">Усі курси та ціни ${icon('right')}</a>`;
  });

  // --- новини ---
  api.news().then(list => {
    if (!alive) return;
    $('#w-news', root).innerHTML = `<h2>${icon('news')} Новини міста ${demoTag()}</h2><div class="news">${list.map(n => `<button class="news-item" data-act="news" data-id="${n.id}"><span class="tag">${esc(n.tag)}</span><b>${esc(n.title)}</b><small>${fmt.ago(n.ts)}</small></button>`).join('')}</div>`;
    root._news = list;
  }).catch(() => { $('#w-news', root).innerHTML += empty('Новини тимчасово недоступні.'); });

  outagesWidget($('#w-out', root), () => alive);
  acts(root, { news: el => { const n = root._news.find(x => x.id === el.dataset.id); modal({ title: n.tag, wide: true, body: `<h2 class="news-title">${esc(n.title)}</h2><p class="muted">${fmt.dt(n.ts)} · єдиний канал публікації АС ВВО МР</p><p>${esc(n.body)}</p>` }); } });
}

// ---------- віджет графіків відключень ----------
function bar(h) { return `<div class="obar" aria-hidden="true">${h.map((s, i) => `<i class="${s}" title="${ext.hm(i)}–${ext.hm(i + 1)}"></i>`).join('')}</div><div class="oaxis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>`; }
function describe(d) {
  if (!d.halves) return '<p class="muted sm">Графік на цей день ще не опубліковано.</p>';
  const off = ext.intervals(d.halves, 'off'), may = ext.intervals(d.halves, 'maybe'); const j = l => l.map(([a, b]) => `${ext.hm(a)}–${ext.hm(b)}`).join(', ');
  return bar(d.halves) + `<p class="osum">${off.length ? `<span class="k off"></span>Без світла: <b>${j(off)}</b>` : d.kind === 'fact' ? '<span class="k on"></span>Відключень не заплановано' : ''}${may.length ? ` <span class="k maybe"></span>Можливі: ${j(may)}` : ''}</p>${d.kind === 'preset' ? '<p class="muted sm">Показано прогнозний тижневий графік — оператор ще не опублікував погодинний.</p>' : ''}`;
}
async function outagesWidget(box, alive) {
  let day = 'today', list = [];
  if (!session.can('outages')) { box.innerHTML = `<h2>${icon('bolt')} Графіки відключень</h2><div class="locked-inline">${icon('lock')}<span>Доступно з рівня ${session.needLevel('outages')}.</span><a class="btn sm" href="${session.user.level === 0 ? '#/welcome' : '#/account?elevate=1'}">Підвищити рівень</a></div>`; return; }
  const draw = async () => {
    box.innerHTML = `<h2>${icon('bolt')} Графіки відключень</h2><div class="row between wrap gap"><div class="seg" role="tablist"><button class="${day === 'today' ? 'on' : ''}" data-act="day" data-d="today">Сьогодні</button><button class="${day === 'tomorrow' ? 'on' : ''}" data-act="day" data-d="tomorrow">Завтра</button></div><button class="btn sm" data-act="add">${icon('plus')} Додати графік</button></div><div class="olist">${list.length ? skeleton(list.length) : empty('Ви ще не додали жодного графіка.', 'Додайте адресу, щоб бачити відключення та отримувати попередження.')}</div><p class="muted sm" id="o-upd"></p>`;
    if (!list.length) return;
    const res = await Promise.allSettled(list.map(x => ext.outageSchedule(x.operator, x.group))); if (!alive()) return;
    $('.olist', box).innerHTML = list.map((x, i) => {
      const s = res[i].value;
      return `<article class="oitem"><div class="row between gap"><div><b>${esc(x.name)}</b><small>${esc(x.operator === 'cek' ? 'ЦЕК' : 'ДТЕК')} · група ${x.group}</small></div><div class="row"><button class="icon-btn ${x.notify ? 'on' : ''}" data-act="bell" data-id="${x.id}" aria-pressed="${x.notify}" title="Попередження за 10 хвилин до відключення" aria-label="Сповіщення">${icon('bell')}</button><button class="icon-btn" data-act="edit" data-id="${x.id}" aria-label="Редагувати">${icon('edit')}</button><button class="icon-btn" data-act="del" data-id="${x.id}" aria-label="Видалити">${icon('trash')}</button></div></div>${s ? describe(s[day]) : '<p class="muted sm">Не вдалося отримати графік оператора. Спробуйте пізніше.</p>'}</article>`;
    }).join('');
    const upd = res.find(r => r.value)?.value.updated; if (upd) $('#o-upd', box).textContent = 'Дані операторів оновлено: ' + upd + '. Графік оновлюється автоматично.';
  };
  const form = item => modal({
    title: item ? 'Редагувати графік' : 'Новий графік', body: `<form class="stack"><label>Назва локації<input class="input" name="name" maxlength="40" placeholder="Наприклад, Дім" value="${esc(item?.name || '')}" required autofocus></label>
      <label>Оператор системи розподілу<select class="input" name="operator">${Object.entries(ext.OPERATORS).map(([k, v]) => `<option value="${k}" ${item?.operator === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Група відключення<select class="input" name="group">${ext.GROUPS.map(g => `<option ${item?.group === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" name="notify" ${item?.notify ? 'checked' : ''}><span>Попереджати за 10 хвилин до відключення</span></label><div class="row end gap"><button type="button" class="btn ghost" data-close>Скасувати</button><button class="btn">Зберегти</button></div></form>`,
    onMount(el, close) {
      el.querySelector('form').onsubmit = async e => {
        e.preventDefault(); const f = e.target;
        try { if (f.notify.checked) await askNotify(); list = await api.outagesSave(session.token, { id: item?.id, name: f.name.value, operator: f.operator.value, group: f.group.value, notify: f.notify.checked }); close(); toast('Графік збережено'); draw(); } catch (er) { fail(er); }
      };
    },
  });
  acts(box, {
    day: el => { day = el.dataset.d; draw(); }, add: () => form(null), edit: el => form(list.find(x => x.id === el.dataset.id)),
    del: async el => { const it = list.find(x => x.id === el.dataset.id); if (await confirmDlg('Видалити графік?', `Графік «${esc(it.name)}» буде видалено.`, 'Видалити', true)) { try { list = await api.outagesDelete(session.token, it.id); draw(); } catch (e) { fail(e); } } },
    bell: async el => { const it = list.find(x => x.id === el.dataset.id); try { if (!it.notify) await askNotify(); list = await api.outagesSave(session.token, { ...it, notify: !it.notify }); toast(it.notify ? 'Сповіщення вимкнено' : 'Попередимо за 10 хвилин до відключення'); draw(); } catch (e) { fail(e); } },
  });
  try { list = await api.outagesList(session.token); if (alive()) draw(); } catch (e) { fail(e); }
}
async function askNotify() {
  if (!('Notification' in window)) { toast('Браузер не підтримує системні сповіщення — попередження з’являться у відкритому кабінеті.', 'warn'); return; }
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission !== 'granted') toast('Системні сповіщення заборонено в браузері — попередження з’являться лише у відкритому кабінеті.', 'warn', 6000);
}

// ---------- детальна погода ----------
export async function weatherView(root) {
  const W = await ext.weather(); let sel = 0;
  const draw = () => {
    const d = W.days[sel]; const nowH = sel === 0 ? new Date().getHours() : -1;
    root.innerHTML = pageHead('Погода в Дніпрі', '#/home') + `
      <section class="card wx-now"><span class="wx big">${W.now.cond.icon}</span><div><b class="t">${fmt.temp(W.now.temp)}</b><p>${esc(W.now.cond.text)} · відчувається як ${fmt.temp(W.now.feels)}</p><small class="muted">Код стану погоди (WMO): ${W.now.cond.code}</small></div>
        <div class="stats">${cell('Тиск', ext.hPaToMm(W.now.pressure) + ' мм рт. ст.', fmt.num(W.now.pressure) + ' гПа')}${cell('Вологість', fmt.num(W.now.humidity) + '%')}${cell('Опади', fmt.num(W.now.precip, 1) + ' мм')}${cell('Вітер', fmt.num(W.now.wind, 1) + ' м/с')}${cell('Схід сонця', W.days[0].sunrise)}${cell('Захід сонця', W.days[0].sunset)}</div></section>
      <div class="days" role="tablist" aria-label="Прогноз на 10 днів">${W.days.map((x, i) => `<button role="tab" aria-selected="${i === sel}" class="day ${i === sel ? 'on' : ''}" data-act="day" data-i="${i}"><small>${i === 0 ? 'Сьогодні' : fmt.dayShort(x.date + 'T12:00')}</small><span class="wx">${x.cond.icon}</span><b>${fmt.temp(x.tmax)}</b><span class="muted">${fmt.temp(x.tmin)}</span></button>`).join('')}</div>
      <section class="card"><div class="row between wrap gap"><h2>${sel === 0 ? 'Сьогодні' : esc(fmt.dateLong(d.date + 'T12:00'))}: ${esc(d.cond.text.toLowerCase())}</h2><span class="muted">☀ ${d.sunrise} — ${d.sunset} · опади ${fmt.num(d.precip, 1)} мм</span></div>
        <div class="table-wrap"><table class="table hourly"><thead><tr><th>Час</th><th></th><th>Темп.</th><th>Відчув.</th><th>Опади</th><th>Імовірн.</th><th>Вологість</th><th>Тиск</th><th>Вітер</th></tr></thead><tbody>
        ${d.hours.map(h => `<tr class="${+h.time.slice(0, 2) === nowH ? 'now' : ''}"><td>${h.time}</td><td title="${esc(h.cond.text)}">${h.cond.icon}</td><td><b>${fmt.temp(h.temp)}</b></td><td>${fmt.temp(h.feels)}</td><td>${fmt.num(h.precip, 1)} мм</td><td>${h.prob ?? '—'}%</td><td>${h.humidity}%</td><td>${ext.hPaToMm(h.pressure)} мм</td><td>${fmt.num(h.wind, 1)} м/с</td></tr>`).join('')}
        </tbody></table></div><p class="muted sm">Погодинний прогноз на 10 днів. Джерело: Open-Meteo.</p></section>`;
  };
  acts(root, { day: el => { sel = +el.dataset.i; draw(); root.querySelector('.day.on')?.scrollIntoView({ block: 'nearest', inline: 'center' }); } });
  draw();
}

// ---------- мапа якості повітря ----------
export async function airView(root, ctx) {
  const A = await ext.air(); const lv = ext.aqiLevel(A.avg);
  root.innerHTML = pageHead('Якість повітря', '#/home') + `
    <section class="card aqi-top"><span class="aqi-badge big" style="${ext.aqiStyle(A.avg)}">${A.avg}</span><div><b>Середній індекс якості повітря (AQI) у місті зараз</b><p>${lv.text}. ${esc(A.source)}.</p></div></section>
    <div class="map-layout"><div class="card map-card"><div id="airmap" class="map" role="application" aria-label="Мапа датчиків якості повітря"></div><div class="legend">${[[25, '0–50'], [75, '51–100'], [125, '101–150'], [175, '151–200'], [250, '201+']].map(([v, t]) => `<span><i style="background:${ext.aqiLevel(v).color}"></i>${t}</span>`).join('')}</div></div>
    <aside class="card side"><div id="st-detail">${A.stations.length ? '<p class="muted">Оберіть датчик на мапі або в списку.</p>' : '<p class="muted">Датчики зараз недоступні, показано модельне значення по місту.</p>'}</div><div class="st-list">${A.stations.slice().sort((a, b) => b.aqi - a.aqi).map(s => `<button class="st" data-act="st" data-id="${esc(s.id)}"><span class="aqi-badge sm" style="${ext.aqiStyle(s.aqi)}">${s.aqi}</span><span>${esc(s.name)}${s.street && s.street.trim().toLowerCase() !== s.name.trim().toLowerCase() ? `<small>${esc(s.street)}</small>` : ''}</span></button>`).join('')}</div></aside></div>`;
  const marks = {}; let M = null;
  const show = id => {
    const s = A.stations.find(x => x.id === id); if (!s) return; const l = ext.aqiLevel(s.aqi);
    $('#st-detail', root).innerHTML = `<h3>${esc(s.name)}</h3><p class="muted">${esc(s.street)} · ${esc(s.platform || '')}</p><div class="row gap"><span class="aqi-badge" style="${ext.aqiStyle(s.aqi)}">${s.aqi}</span><b>${l.text}</b></div><div class="stats">${cell('PM2.5', fmt.num(s.pm25, 1), 'мкг/м³')}${cell('PM10', fmt.num(s.pm10, 1), 'мкг/м³')}${cell('Темп.', s.temp != null ? fmt.temp(s.temp) : '—')}${cell('Вологість', s.humidity ? fmt.num(s.humidity) + '%' : '—')}</div><p class="muted sm">Оновлено: ${s.time ? fmt.dt(s.time) : '—'}</p>`;
    if (M) { M.map.setView([s.lat, s.lon], Math.max(M.map.getZoom(), 13)); marks[id]?.openTooltip(); }
  };
  acts(root, { st: el => show(el.dataset.id) });
  try {
    M = await makeMap($('#airmap', root)); ctx.onLeave(() => M.map.remove());
    for (const s of A.stations) {
      marks[s.id] = M.L.marker([s.lat, s.lon], { icon: M.L.divIcon({ className: '', html: `<div class="aqi-pin" style="${ext.aqiStyle(s.aqi)}">${s.aqi}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] }), title: s.name, keyboard: true }).addTo(M.map).bindTooltip(esc(s.name)).on('click', () => show(s.id));
    }
  } catch (e) { $('#airmap', root).innerHTML = empty('Мапу не вдалося завантажити.', esc(e.message)); }
}

// ---------- фінанси ----------
export async function financeView(root) {
  const [r, f] = await Promise.allSettled([ext.rates(), api.fuel()]); const R = r.value, F = f.value; let q = '';
  const rows = () => R.items.filter(x => !q || (x.cc + ' ' + x.name).toLowerCase().includes(q)).map(x => `<tr><td><b>${x.cc}</b></td><td>${esc(x.name)}</td><td class="num">${fmt.num(x.rate, 4)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Нічого не знайдено</td></tr>';
  root.innerHTML = pageHead('Фінанси', '#/home') + `<div class="grid two">
    <section class="card"><h2>Ціни на пальне ${demoTag()}</h2>${F ? `<table class="table"><thead><tr><th>Тип пального</th><th class="num">грн/л</th><th class="num">За добу</th></tr></thead><tbody>${F.items.map(x => `<tr><td><b>${esc(x.name)}</b></td><td class="num">${fmt.num(x.price, 2)}</td><td class="num ${x.delta > 0 ? 'up' : x.delta < 0 ? 'dn' : ''}">${x.delta > 0 ? '+' : ''}${fmt.num(x.delta, 2)}</td></tr>`).join('')}</tbody></table><p class="muted sm">Середня вартість літра на АЗС міста. У робочій версії дані збирає парсер цін АЗС на боці АС ВВО МР; оновлено ${fmt.ago(F.updatedAt)}.</p>` : empty('Ціни тимчасово недоступні.')}</section>
    <section class="card"><h2>Офіційний курс НБУ</h2>${R ? `<p class="muted">На ${esc(R.date)}, гривень за одиницю валюти</p><input class="input" type="search" placeholder="Пошук валюти" aria-label="Пошук валюти" id="cur-q"><div class="table-wrap tall"><table class="table"><thead><tr><th>Код</th><th>Валюта</th><th class="num">Курс</th></tr></thead><tbody id="cur-rows">${rows()}</tbody></table></div>` : empty('Курси НБУ тимчасово недоступні.')}</section></div>`;
  $('#cur-q', root)?.addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); $('#cur-rows', root).innerHTML = rows(); });
}
