// Модуль авторизації (п. 2.1.3.1): вхід і реєстрація лише через механізми АС ВВО МР.
import { api } from './asvvo.js';
import { $, esc, session, toast, fail, otpDlg, modal, icon, acts, clearOtp } from './core.js';

const brand = `<div class="auth-brand"><img src="icons/icon.svg" width="56" height="56" alt=""><h1>Кабінет мешканця Дніпра</h1><p>Демонстраційний прототип вебкабінету міських послуг. Не є офіційним сервісом міської ради.</p></div>`;

export async function loginView(root) {
  let step = 'phone', phone = '', ch = null;
  const draw = () => {
    root.innerHTML = `<div class="auth">${brand}<div class="card auth-card">${{
      phone: `<h2>Вхід або реєстрація</h2><form class="stack" data-f="phone"><label>Номер телефону<input class="input" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+380 XX XXX XX XX" value="${esc(phone)}" required autofocus></label><button class="btn block">Отримати код</button></form>
        <p class="muted sm">Якщо кабінету ще немає, ми створимо його після підтвердження номера.</p>
        <div class="demo-box"><b>Демо-акаунти</b><div class="row gap wrap"><button class="chip" data-act="demo" data-p="+380500000001">Олена · рівень 1</button><button class="chip" data-act="demo" data-p="+380500000002">Андрій · рівень 2</button><button class="chip" data-act="demo" data-p="+380500000003">Без профілю · рівень 0</button><button class="chip" data-act="demo" data-p="+380500000005">Олександра · пароль demo-1234</button><button class="chip" data-act="demo" data-p="+380500000004">Заблокований</button><button class="chip" data-act="demo" data-p="+38067${String(Math.floor(1e6 + Math.random() * 9e6))}">Новий номер</button></div><small>Код із «SMS» з’явиться на екрані. Справжні номери й паролі не вводьте — це демонстрація.</small></div>`,
      otp: `<h2>Введіть код</h2><p>Код надіслано на <b>${esc(ch?.masked)}</b> ${ch?.channel === 'email' ? '(ел. пошта)' : '(SMS)'}. ${ch?.isNew ? 'Після підтвердження створимо ваш кабінет.' : ''}</p><form class="stack" data-f="otp"><input class="input otp" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" required autofocus><button class="btn block">Увійти</button></form><div class="row between"><button class="link" data-act="back">Змінити номер</button><button class="link" data-act="again">Надіслати ще раз</button></div>`,
      pass: `<h2>Двоетапна перевірка</h2><p>Для цього кабінету ввімкнено додатковий пароль.</p><form class="stack" data-f="pass"><label>Пароль<input class="input" name="password" type="password" autocomplete="current-password" required autofocus></label><button class="btn block">Увійти</button></form><div class="row between"><button class="link" data-act="back">Назад</button><button class="link" data-act="forgot">Забули пароль?</button></div>`,
    }[step]}</div><p class="auth-foot"><a href="#/emulator">Панель емулятора АС ВВО МР</a> · демо-версія</p></div>`;
    root.querySelector('[autofocus]')?.focus();
  };
  const done = async token => { clearOtp(); session.set(token); await session.refresh(); location.hash = session.user.level === 0 ? '#/welcome' : '#/home'; };
  root.addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target, btn = f.querySelector('.btn'); btn.disabled = true;
    try {
      if (f.dataset.f === 'phone') { phone = f.phone.value; ch = await api.authStart(phone); step = 'otp'; draw(); }
      else if (f.dataset.f === 'otp') { const r = await api.authVerify(ch.challengeId, f.code.value); if (r.twoStep) { clearOtp(); ch = { ...ch, challengeId: r.challengeId }; step = 'pass'; draw(); } else await done(r.token); }
      else if (f.dataset.f === 'pass') { const r = await api.authTwoStep(ch.challengeId, f.password.value); await done(r.token); }
    } catch (er) { fail(er); btn.disabled = false; }
  });
  acts(root, {
    demo: el => { phone = el.dataset.p; $('[name=phone]', root).value = phone; $('[data-f=phone] .btn', root).click(); },
    back: () => { step = 'phone'; draw(); },
    again: async () => { try { ch = await api.authStart(phone); toast('Код надіслано повторно'); } catch (e) { fail(e); } },
    forgot: () => modal({
      title: 'Відновлення пароля', body: `<p>Підтвердимо вашу особу кодом і встановимо новий пароль двоетапної перевірки.</p><form class="stack"><label>Новий пароль (від 8 символів)<input class="input" name="p" type="password" minlength="8" autocomplete="new-password" required autofocus></label><button class="btn">Продовжити</button></form>`,
      onMount(el, close) { el.querySelector('form').onsubmit = async e => { e.preventDefault(); const np = el.querySelector('[name=p]').value; close(); const ok = await otpDlg({ title: 'Відновлення пароля', start: () => api.passwordResetStart(phone), finish: (id, code) => api.passwordResetFinish(id, code, np) }); if (ok) { toast('Пароль змінено. Увійдіть з новим паролем.'); step = 'phone'; draw(); } }; },
    }),
  });
  draw();
}

// Після першого входу: профіль і згода на обробку даних (рівень 0 → 1)
export async function welcomeView(root) {
  const u = session.user; if (u.level > 0) { location.hash = '#/home'; return; }
  const consent = await api.consentText();
  root.innerHTML = `<div class="auth">${brand}<div class="card auth-card"><h2>Завершіть реєстрацію</h2><p>Номер ${esc(u.phone)} підтверджено. Заповніть профіль, щоб відкрити сервіси кабінету.</p>
    <form class="stack"><label>Прізвище<input class="input" name="last" autocomplete="family-name" required autofocus></label><label>Ім’я<input class="input" name="first" autocomplete="given-name" required></label><label>По батькові<input class="input" name="middle" autocomplete="additional-name"></label><label>Дата народження<input class="input" name="birth" type="date" max="${new Date().toISOString().slice(0, 10)}"></label><label>Електронна пошта (необов’язково)<input class="input" name="email" type="email" autocomplete="email"></label>
    <details class="consent"><summary>Згода на обробку персональних даних</summary><p>${esc(consent)}</p></details><label class="check"><input type="checkbox" name="consent" required><span>Я надаю згоду на обробку персональних даних</span></label>
    <button class="btn block">Зберегти та продовжити</button></form><div class="row between"><a class="link" href="#/home">Пропустити (рівень 0)</a><button class="link" data-act="out">Вийти</button></div></div></div>`;
  root.querySelector('form').onsubmit = async e => {
    e.preventDefault(); const f = e.target; f.querySelector('.btn').disabled = true;
    try { await api.completeProfile(session.token, { last: f.last.value, first: f.first.value, middle: f.middle.value, birth: f.birth.value, email: f.email.value, consent: f.consent.checked }); await session.refresh(); toast('Профіль збережено. Рівень авторизації — 1.'); location.hash = '#/home'; }
    catch (er) { fail(er); f.querySelector('.btn').disabled = false; }
  };
  acts(root, { out: async () => { await api.logout(session.token); session.clear(); location.hash = '#/login'; } });
}
export { icon };
