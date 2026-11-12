// Розділ «Акаунт» (п. 2.1.3.2): дані, рівень авторизації, канали, безпека, видалення, вихід.
import { api } from './asvvo.js';
import { $, esc, fmt, icon, session, toast, fail, modal, confirmDlg, otpDlg, acts, pageHead, empty, levelChip } from './core.js';

const row = (label, value, act, actLabel = 'Змінити') => `<div class="kv"><div><small>${label}</small><b>${value}</b></div>${act ? `<button class="btn sm ghost" data-act="${act}">${actLabel}</button>` : ''}</div>`;
const sw = (name, on, label, hint) => `<label class="switch"><input type="checkbox" data-ch="${name}" ${on ? 'checked' : ''}><span class="track"></span><div><b>${label}</b><small>${hint}</small></div></label>`;

export async function accountView(root, ctx) {
  let u = session.user;
  const sync = async () => { await session.refresh(); u = session.user; draw(); };
  const draw = () => {
    const fio = [u.last, u.first, u.middle].filter(Boolean).join(' ') || 'Не вказано';
    root.innerHTML = pageHead('Акаунт') + `
      <section class="card acc-top"><div class="ava big">${esc((u.first || '?')[0])}</div><div class="grow"><h2>${esc(fio)}</h2><p class="muted">${esc(fmt.phone(u.phone))}</p></div><div class="lvl-box">${levelChip(u.level)}<small>${['Номер підтверджено, профіль не заповнено', 'Профіль заповнено, згоду надано', 'Особу підтверджено' + (u.verifiedBy ? ' через ' + esc(u.verifiedBy) : '')][u.level]}</small>${u.level < 2 ? `<button class="btn sm" data-act="elevate">Підвищити рівень</button>` : ''}</div></section>
      ${u.restricted ? `<div class="note warn">${icon('lock')}<span><b>Використання акаунта обмежено.</b> Сервіси недоступні, доки ви не знімете обмеження.</span><button class="btn sm" data-act="restrict">Зняти обмеження</button></div>` : ''}
      <div class="grid two">
      <section class="card"><h2>${icon('user')} Персональні дані</h2>${row('Прізвище, ім’я, по батькові', esc(fio))}${row('Дата народження', u.birth ? fmt.date(u.birth) : 'Не вказано')}
        ${u.level >= 2 ? `<p class="muted sm">${icon('shield')} Дані підтверджено через ${esc(u.verifiedBy || 'ІСЕІ')} і змінюються лише повторною ідентифікацією.</p>` : `<button class="btn sm ghost" data-act="${u.level === 0 ? 'welcome' : 'profile'}">${u.level === 0 ? 'Заповнити профіль' : 'Редагувати'}</button>`}
        <h3>Контакти</h3>${row('Телефон', esc(fmt.phone(u.phone)), 'phone')}${row('Електронна пошта', u.email ? esc(u.email) : 'Не додано', 'email', u.email ? 'Змінити' : 'Додати')}<p class="muted sm">Зміну контактів підтверджуємо кодом. Дані зберігаються в АС ВВО МР.</p></section>
      <section class="card"><h2>${icon('bell')} Канали комунікації</h2>${sw('sms', u.channels.sms, 'SMS', 'На номер ' + esc(fmt.phone(u.phone)))}${sw('email', u.channels.email, 'Електронна пошта', u.email ? esc(u.email) : 'Спершу додайте адресу')}${sw('push', u.channels.push, 'Push-сповіщення', 'У браузері та застосунку «єДніпро»')}
        <h3>${icon('key')} Безпека</h3>${row('Канал надсилання OTP-коду', u.otpChannel === 'email' ? 'Електронна пошта' : 'SMS', 'otpch')}${row('Двоетапна перевірка (пароль)', u.twoStep ? 'Увімкнено' : 'Вимкнено', 'twostep', u.twoStep ? 'Змінити' : 'Увімкнути')}
        <a class="navrow" href="#/log">${icon('list')}<span>Історія дій у кабінеті</span>${icon('right')}</a></section>
      <section class="card"><h2>${icon('help')} Довідка</h2><a class="navrow" href="#/faq">${icon('help')}<span>Часті питання</span>${icon('right')}</a><a class="navrow" href="#/consent">${icon('doc')}<span>Згода на обробку персональних даних</span>${icon('right')}</a><a class="navrow" href="docs/kerivnytstvo.html" target="_blank" rel="noopener">${icon('doc')}<span>Керівництво користувача</span>${icon('right')}</a></section>
      <section class="card"><h2>${icon('gear')} Керування акаунтом</h2>${u.restricted ? '' : `<button class="navrow" data-act="restrict">${icon('lock')}<span>Обмежити використання акаунта</span>${icon('right')}</button>`}<button class="navrow danger" data-act="delete">${icon('trash')}<span>Видалити обліковий запис</span>${icon('right')}</button><button class="navrow" data-act="logout">${icon('out')}<span>Вийти з акаунта</span>${icon('right')}</button></section></div>`;
  };
  const formDlg = (title, html, submit) => modal({ title, body: `<form class="stack">${html}<div class="row end gap"><button type="button" class="btn ghost" data-close>Скасувати</button><button class="btn">Зберегти</button></div></form>`, onMount(el, close) { el.querySelector('form').onsubmit = async e => { e.preventDefault(); const b = e.target.querySelector('.btn:not(.ghost)'); b.disabled = true; try { await submit(e.target, close); } catch (er) { fail(er); b.disabled = false; } }; } });
  const contact = (kind, value) => otpDlg({ start: () => api.contactChangeStart(session.token, kind, value), finish: (id, code) => api.contactChangeFinish(session.token, id, code) });
  const elevate = () => modal({
    title: 'Підвищення рівня авторизації', body: `<p>Підтвердьте особу через Інтегровану систему електронної ідентифікації. Після цього відкриються сервіси рівня 2, зокрема «Медичний кабінет».</p><div class="stack"><button class="btn block" data-m="diia">Підтвердити через Дію</button><button class="btn block ghost" data-m="bankid">Підтвердити через BankID НБУ</button></div><p class="muted sm">Демо: перехід до ІСЕІ емулюється, справжня ідентифікація не виконується. У робочій версії використовується наявний механізм АС ВВО МР.</p>`,
    onMount(el, close) { el.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => { b.disabled = true; b.textContent = 'Очікуємо відповідь ІСЕІ…'; try { await api.elevate(session.token, b.dataset.m); close(); await sync(); toast('Особу підтверджено. Рівень авторизації — 2.'); } catch (e) { fail(e); close(); } }); },
  });
  acts(root, {
    welcome: () => { location.hash = '#/welcome'; },
    elevate: () => u.level === 0 ? (location.hash = '#/welcome') : elevate(),
    profile: () => formDlg('Персональні дані', `<label>Прізвище<input class="input" name="last" value="${esc(u.last)}" required autofocus></label><label>Ім’я<input class="input" name="first" value="${esc(u.first)}" required></label><label>По батькові<input class="input" name="middle" value="${esc(u.middle)}"></label><label>Дата народження<input class="input" type="date" name="birth" value="${esc(u.birth)}" max="${new Date().toISOString().slice(0, 10)}"></label>`, async (f, close) => { await api.updateProfile(session.token, { last: f.last.value, first: f.first.value, middle: f.middle.value, birth: f.birth.value }); close(); toast('Дані збережено'); sync(); }),
    phone: () => formDlg('Новий номер телефону', `<label>Номер телефону<input class="input" name="v" type="tel" placeholder="+380 XX XXX XX XX" required autofocus></label><p class="muted sm">Надішлемо код на новий номер.</p>`, async (f, close) => { const v = f.v.value; close(); if (await contact('phone', v)) { toast('Номер змінено'); sync(); } }),
    email: () => formDlg('Електронна пошта', `<label>Адреса<input class="input" name="v" type="email" value="${esc(u.email)}" required autofocus></label><p class="muted sm">Надішлемо код на цю адресу.</p>`, async (f, close) => { const v = f.v.value; close(); if (await contact('email', v)) { toast('Адресу збережено'); sync(); } }),
    otpch: () => formDlg('Канал надсилання OTP-коду', `<label class="check"><input type="radio" name="c" value="sms" ${u.otpChannel !== 'email' ? 'checked' : ''}><span>SMS на ${esc(fmt.phone(u.phone))}</span></label><label class="check"><input type="radio" name="c" value="email" ${u.otpChannel === 'email' ? 'checked' : ''} ${u.email ? '' : 'disabled'}><span>Електронна пошта ${u.email ? esc(u.email) : '(спершу додайте адресу)'}</span></label>`, async (f, close) => { const v = f.c.value; close(); if (v !== u.otpChannel && await contact('otpChannel', v)) { toast('Канал надсилання коду змінено'); sync(); } }),
    twostep: () => formDlg('Двоетапна перевірка', `<p>Додатковий пароль запитуватиметься після коду під час кожного входу.</p>${u.twoStep ? '<label>Поточний пароль<input class="input" type="password" name="cur" autocomplete="current-password" required autofocus></label>' : ''}<label>Новий пароль (від 8 символів)<input class="input" type="password" name="p1" minlength="8" autocomplete="new-password" ${u.twoStep ? '' : 'required autofocus'}></label><label>Повторіть пароль<input class="input" type="password" name="p2" autocomplete="new-password"></label>${u.twoStep ? '<p class="muted sm">Залиште нові поля порожніми, щоб вимкнути перевірку.</p>' : ''}<p class="muted sm">Демо: не використовуйте справжні паролі.</p>`, async (f, close) => { if (f.p1.value !== f.p2.value) throw Object.assign(new Error('Паролі не збігаються.'), {}); await api.setTwoStep(session.token, f.p1.value || null, f.cur?.value); close(); toast(f.p1.value ? 'Двоетапну перевірку ввімкнено' : 'Двоетапну перевірку вимкнено'); sync(); }),
    restrict: async () => { const on = !u.restricted; if (on && !await confirmDlg('Обмежити використання акаунта?', 'Сервіси кабінету стануть недоступними, доки ви не знімете обмеження. Дані не видаляються.', 'Обмежити')) return; try { await api.setRestricted(session.token, on); toast(on ? 'Використання акаунта обмежено' : 'Обмеження знято'); sync(); } catch (e) { fail(e); } },
    delete: async () => { if (!await confirmDlg('Видалити обліковий запис?', 'Буде видалено профіль, графіки, автомобілі та історію звернень. Дію неможливо скасувати. Підтвердимо її кодом.', 'Продовжити', true)) return; const ok = await otpDlg({ title: 'Видалення облікового запису', start: () => api.deleteStart(session.token), finish: (id, code) => api.deleteFinish(session.token, id, code) }); if (ok) { session.clear(); toast('Обліковий запис видалено'); location.hash = '#/login'; } },
    logout: async () => { try { await api.logout(session.token); } finally { session.clear(); location.hash = '#/login'; } },
  });
  root.addEventListener('change', async e => {
    const name = e.target.dataset?.ch; if (!name) return;
    try { await api.setChannels(session.token, { ...u.channels, [name]: e.target.checked }); if (name === 'push' && e.target.checked && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); toast('Канали комунікації оновлено'); } catch (er) { fail(er); }
    sync();
  });
  draw();
  if (ctx.query.get('elevate') && u.level < 2) { history.replaceState(null, '', '#/account'); u.level === 0 ? (location.hash = '#/welcome') : elevate(); }
}

export async function faqView(root) {
  const list = await api.faq();
  root.innerHTML = pageHead('Часті питання', '#/account') + `<section class="card faq">${list.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>`;
}
export async function consentView(root) {
  const text = await api.consentText(); const u = session.user;
  root.innerHTML = pageHead('Згода на обробку даних', '#/account') + `<section class="card"><p>${esc(text)}</p><div class="note ${u.consentAt ? '' : 'warn'}">${icon(u.consentAt ? 'check' : 'info')}<span>${u.consentAt ? 'Згоду надано ' + fmt.dt(u.consentAt) + '.' : 'Згоду ще не надано. Вона потрібна для рівня авторизації 1.'}</span>${u.consentAt ? '' : '<a class="btn sm" href="#/welcome">Надати згоду</a>'}</div></section>`;
}
const SEV = { info: 'info', warn: 'warn', crit: 'crit' };
export async function logView(root) {
  const list = await api.myLog(session.token);
  root.innerHTML = pageHead('Історія дій', '#/account') + `<section class="card"><p class="muted">Журнал ведеться на боці АС ВВО МР: входи й виходи, спроби несанкціонованого доступу, зміни налаштувань і критичні операції.</p>${list.length ? `<div class="log">${list.map(l => `<div class="logrow ${SEV[l.sev]}"><time>${fmt.dt(l.ts)}</time><span>${esc(l.text)}</span></div>`).join('')}</div>` : empty('Записів ще немає.')}</section>`;
}
export { $ };
