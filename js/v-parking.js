// Сервіс «Паркування» (п. 2.1.3.10): автомобілі, абонементи, штрафи. Джерело — «Єдиний паркувальний простір».
import { api } from './asvvo.js';
import { $, esc, fmt, icon, session, toast, fail, modal, confirmDlg, payDlg, acts, pageHead, empty, demoTag } from './core.js';

const plateEl = p => `<span class="plate">${esc(p)}</span>`;

export async function parkingView(root, ctx) {
  let tab = ctx.params[0] || 'cars';
  let [cars, subs, tariffs] = await Promise.all([api.carsList(session.token), api.subsList(session.token), api.parkingTariffs()]);
  let fines = null, fineQuery = '', busy = false;
  const canPay = session.can('payments');

  const body = () => {
    if (tab === 'cars') return `<section class="card"><div class="row between gap"><h2>Мої автомобілі</h2><button class="btn sm" data-act="addcar">${icon('plus')} Додати авто</button></div>
      ${cars.length ? cars.map(c => `<div class="car">${plateEl(c.plate)}<div class="grow"><b>${esc(c.title || 'Автомобіль')}</b><small>${c.kind === 'ua' ? 'Державний номер' : 'Іноземний / іменний номер'} · ${esc(c.source)}</small></div><button class="icon-btn" data-act="delcar" data-id="${c.id}" aria-label="Видалити авто">${icon('trash')}</button></div>`).join('') : empty('Автомобілів ще немає.', 'Додайте авто за номером, щоб купувати абонементи та перевіряти штрафи.')}
      <p class="muted sm">Перелік синхронізується з іншими системами АС ВВО МР: авто, додані в «єДніпро», з’являться тут автоматично.</p></section>`;
    if (tab === 'subs') {
      const active = subs.filter(s => s.to > Date.now());
      return `<section class="card"><h2>Придбати абонемент ${demoTag('демо-тарифи')}</h2>${cars.length ? `<form class="stack" id="sub-form"><label>Автомобіль<select class="input" name="plate">${cars.map(c => `<option>${esc(c.plate)}</option>`).join('')}</select></label>
        <fieldset class="tariffs"><legend>Абонемент</legend>${tariffs.items.map((t, i) => `<label class="tariff"><input type="radio" name="tariff" value="${t.id}" ${i === 0 ? 'checked' : ''}><div><b>${esc(t.name)}</b><span>${esc(t.note)}</span></div><b>${fmt.money(t.price)}</b></label>`).join('')}</fieldset>
        <label>Початок дії<input class="input" type="date" name="start" value="${new Date().toISOString().slice(0, 10)}" min="${new Date().toISOString().slice(0, 10)}"></label>
        <button class="btn" ${canPay ? '' : 'disabled'}>Перейти до оплати</button>${canPay ? '' : `<p class="muted sm">Оплата доступна з рівня авторизації ${session.needLevel('payments')}.</p>`}</form>` : empty('Спершу додайте автомобіль.', '<button class="btn sm" data-act="tab" data-t="cars">До автомобілів</button>')}</section>
        <section class="card"><h2>Мої абонементи</h2>${subs.length ? subs.map(s => `<div class="car">${plateEl(s.plate)}<div class="grow"><b>${esc(s.tariff)}</b><small>${fmt.date(s.from)} — ${fmt.date(s.to)} · ${fmt.money(s.price)}</small></div><span class="tag st-${s.to > Date.now() ? 'ok' : 'mute'}">${s.to > Date.now() ? 'Діє' : 'Завершено'}</span></div>`).join('') : empty('Абонементів ще немає.')}${active.length ? '<p class="muted sm">Абонемент і квитанція збережені в розділі <a href="#/requests">«Звернення»</a>.</p>' : ''}</section>`;
    }
    return `<section class="card"><h2>Штрафи за паркування ${demoTag()}</h2><form class="row gap wrap" id="fine-form"><input class="input grow" name="q" placeholder="Номер авто, наприклад АЕ1234ВС" value="${esc(fineQuery)}" aria-label="Номер автомобіля"><button class="btn" ${busy ? 'disabled' : ''}>Знайти</button>${cars.length ? `<button type="button" class="btn ghost" data-act="mine" ${busy ? 'disabled' : ''}>Перевірити мої авто (${cars.length})</button>` : ''}</form>
      ${busy ? '<p class="muted">Шукаємо постанови…</p>' : fines === null ? '<p class="muted">Введіть номер або перевірте додані автомобілі.</p>' : fines.length ? fines.map(f => `<div class="fine ${f.paid ? 'paid' : ''}"><div class="row between gap wrap">${plateEl(f.plate)}<b class="sum">${fmt.money(f.amount)}</b></div><p>Постанова <b>${esc(f.no)}</b> від ${fmt.date(f.date)}<br><span class="muted">${esc(f.place)} · ${esc(f.article)}</span></p>${f.paid ? `<span class="tag st-ok">Сплачено ${fmt.date(f.paid.paidAt)}</span>` : `<button class="btn sm" data-act="pay" data-id="${f.id}" ${canPay ? '' : 'disabled'}>Сплатити</button>`}</div>`).join('') : empty('Несплачених штрафів не знайдено.')}</section>`;
  };
  const draw = () => {
    root.innerHTML = pageHead('Паркування', '#/services') + `<div class="note">${icon('info')}<span>Сервіс працює з міською системою «Єдиний паркувальний простір» через АС ВВО МР. ${demoTag('у демо — емуляція')}</span></div>
      <div class="seg wide">${[['cars', 'Автомобілі'], ['subs', 'Абонементи'], ['fines', 'Штрафи']].map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-act="tab" data-t="${k}">${t}</button>`).join('')}</div>${body()}`;
  };
  const search = async plates => { busy = true; draw(); try { fines = await api.finesSearch(session.token, plates); } catch (e) { fail(e); fines = null; } busy = false; draw(); };
  root.addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target;
    if (f.id === 'fine-form') { fineQuery = f.q.value.trim(); if (!fineQuery) return toast('Введіть номер автомобіля.', 'warn'); search([fineQuery]); }
    if (f.id === 'sub-form') {
      const t = tariffs.items.find(x => x.id === f.tariff.value); const plate = f.plate.value, start = f.start.value;
      if (!await payDlg({ amount: t.price, purpose: `Абонемент «${t.name}» для авто ${plate}` })) return;
      try { await api.subsBuy(session.token, { plate, tariffId: t.id, start }); subs = await api.subsList(session.token); toast('Абонемент оплачено й активовано.'); draw(); } catch (er) { fail(er); }
    }
  });
  acts(root, {
    tab: el => { tab = el.dataset.t; history.replaceState(null, '', '#/parking/' + tab); draw(); },
    mine: () => { fineQuery = ''; search(cars.map(c => c.plate)); },
    addcar: () => modal({
      title: 'Додати автомобіль', body: `<form class="stack"><fieldset class="seg-field"><legend>Тип номера</legend><label><input type="radio" name="kind" value="ua" checked> Державний (АА1234ВВ)</label><label><input type="radio" name="kind" value="other"> Іноземний або іменний</label></fieldset>
        <label>Номер<input class="input plate-input" name="plate" maxlength="12" placeholder="АЕ1234ВС" autocapitalize="characters" required autofocus></label><label>Назва (необов’язково)<input class="input" name="title" maxlength="40" placeholder="Наприклад, Skoda Octavia"></label><div class="row end gap"><button type="button" class="btn ghost" data-close>Скасувати</button><button class="btn">Додати</button></div></form>`,
      onMount(el, close) { el.querySelector('form').onsubmit = async e => { e.preventDefault(); const f = e.target; try { cars = await api.carsAdd(session.token, { plate: f.plate.value, kind: f.kind.value, title: f.title.value }); close(); toast('Автомобіль додано'); draw(); } catch (er) { fail(er); } }; },
    }),
    delcar: async el => { const c = cars.find(x => x.id === el.dataset.id); if (await confirmDlg('Видалити автомобіль?', `Авто ${esc(c.plate)} буде прибрано з кабінету.`, 'Видалити', true)) { try { cars = await api.carsDelete(session.token, c.id); draw(); } catch (e) { fail(e); } } },
    pay: async el => { const f = fines.find(x => x.id === el.dataset.id); if (!await payDlg({ amount: f.amount, purpose: `Штраф за паркування, постанова ${f.no}` })) return; try { f.paid = await api.finesPay(session.token, f); toast('Штраф сплачено. Квитанція — у розділі «Звернення».'); draw(); } catch (e) { fail(e); } },
  });
  draw();
}
