// Панель емулятора АС ВВО МР — лише для демонстрації. У робочій системі її роль виконує адміністратор АС ВВО МР.
import { api, SECTIONS } from './asvvo.js';
import { esc, fmt, toast, confirmDlg, acts, session } from './core.js';

export async function emulatorView(root) {
  const draw = () => {
    const s = api.admin.state();
    root.innerHTML = `<div class="emu"><header class="row between wrap gap"><div><h1>Панель емулятора АС ВВО МР</h1><p class="muted">Імітує дії адміністратора серверної системи Замовника. Зміни одразу застосовуються у відкритому кабінеті — без повторного входу користувача.</p></div><a class="btn ghost" href="${session.token ? '#/home' : '#/login'}">← До кабінету</a></header>
      <section class="card"><h2>Користувачі</h2><div class="table-wrap"><table class="table"><thead><tr><th>Користувач</th><th>Телефон</th><th>Рівень авторизації</th><th>Стан</th></tr></thead><tbody>${s.users.map(u => `<tr><td><b>${esc([u.last, u.first].filter(Boolean).join(' ') || '— профіль не заповнено —')}</b></td><td>${esc(fmt.phone(u.phone))}</td><td><div class="seg sm">${[0, 1, 2].map(l => `<button class="${u.level === l ? 'on' : ''}" data-act="lvl" data-id="${u.id}" data-l="${l}">${l}</button>`).join('')}</div></td><td><button class="btn sm ${u.blocked ? 'danger' : 'ghost'}" data-act="block" data-id="${u.id}" data-on="${u.blocked ? '' : '1'}">${u.blocked ? 'Заблоковано — розблокувати' : 'Заблокувати'}</button></td></tr>`).join('')}</tbody></table></div></section>
      <div class="grid two"><section class="card"><h2>Правила доступу</h2><p class="muted sm">Мінімальний рівень авторизації для розділу. Версія правил: ${s.rulesVersion}</p>${Object.entries(SECTIONS).map(([k, t]) => `<div class="kv"><div><b>${t}</b></div><div class="seg sm">${[0, 1, 2].map(l => `<button class="${s.rules[k] === l ? 'on' : ''}" data-act="rule" data-k="${k}" data-l="${l}">${l}</button>`).join('')}</div></div>`).join('')}</section>
      <section class="card"><h2>Повітряна тривога (демо)</h2><div class="seg">${[['null', 'Немає джерела'], ['true', 'Тривога'], ['false', 'Відбій']].map(([v, t]) => `<button class="${String(s.alertDemo) === v ? 'on' : ''}" data-act="alert" data-v="${v}">${t}</button>`).join('')}</div><p class="muted sm">Перемикає індикатор на головній, щоб показати обидва стани.</p>
        <h2>Опублікувати новину</h2><form class="stack" id="news-f"><input class="input" name="title" placeholder="Заголовок" required><textarea class="input" name="body" rows="3" placeholder="Текст новини" required></textarea><button class="btn sm">Опублікувати в єдиному каналі</button></form>
        <h2>Скидання</h2><button class="btn sm danger" data-act="reset">Скинути дані емулятора</button></section></div>
      <section class="card"><h2>Системний журнал</h2><div class="log">${s.log.map(l => `<div class="logrow ${l.sev}"><time>${fmt.dt(l.ts)}</time><span><b>${esc(l.phone ? fmt.phone(l.phone) || l.phone : 'система')}</b> · ${esc(l.type)} · ${esc(l.text)}</span></div>`).join('') || '<p class="muted">Подій ще немає.</p>'}</div></section></div>`;
  };
  acts(root, {
    lvl: el => { api.admin.setLevel(el.dataset.id, +el.dataset.l); toast('Рівень змінено'); draw(); },
    block: el => { api.admin.setBlocked(el.dataset.id, !!el.dataset.on); draw(); },
    rule: el => { api.admin.setRule(el.dataset.k, +el.dataset.l); toast('Правило оновлено'); draw(); },
    alert: el => { api.admin.setAlert(JSON.parse(el.dataset.v)); draw(); },
    reset: async () => { if (await confirmDlg('Скинути дані емулятора?', 'Усі користувачі, звернення та налаштування в цьому браузері повернуться до початкового стану.', 'Скинути', true)) { api.admin.reset(); session.clear(); toast('Дані скинуто'); draw(); } },
  });
  root.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'news-f') { api.admin.addNews(e.target.title.value, e.target.body.value); toast('Новину опубліковано'); draw(); } });
  draw();
}
