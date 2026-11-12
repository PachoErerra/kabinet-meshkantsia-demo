// Сервіс «Медичний кабінет» (п. 2.1.3.4): картки пацієнтів з МІС «Каштан» і запис до лікаря.
import { api } from './asvvo.js';
import * as ext from './ext.js';
import { $, esc, fmt, icon, session, toast, fail, confirmDlg, acts, pageHead, empty, demoTag, skeleton } from './core.js';

export async function medicalView(root) {
  const [patients, fac, appts0] = await Promise.all([api.medPatients(session.token), ext.staticData('facilities'), api.medAppointments(session.token)]);
  const facilities = fac.items; let appts = appts0;
  const st = { patient: patients[0], mode: null, facility: null, doctor: null, doctors: null, days: null, day: 0 };
  const fById = id => facilities.find(f => f.id === id) || facilities[0];

  const wizard = () => {
    if (!st.mode) return `<div class="grid two"><button class="card pick" data-act="mode" data-m="own">${icon('user')}<div><b>До свого лікаря</b><span>${esc(st.patient.doctor.name)}, ${esc(st.patient.doctor.spec.toLowerCase())}</span></div>${icon('right')}</button><button class="card pick" data-act="mode" data-m="facility">${icon('med')}<div><b>Через медичний заклад</b><span>Обрати заклад, потім лікаря</span></div>${icon('right')}</button></div>`;
    const crumbs = `<div class="crumbs"><button class="link" data-act="reset">Спосіб запису</button>${st.facility ? ` › <button class="link" data-act="tofac">${esc(st.facility.name)}</button>` : ''}${st.doctor ? ` › <span>${esc(st.doctor.name)}</span>` : ''}</div>`;
    if (!st.facility) return crumbs + `<h3>Оберіть заклад</h3><div class="st-list">${facilities.map(f => `<button class="st" data-act="fac" data-id="${f.id}"><span class="pin-ic">${icon('med')}</span><span>${esc(f.name)}<small>${esc(f.address || 'м. Дніпро')}</small></span></button>`).join('')}</div>`;
    if (!st.doctor) return crumbs + `<h3>Оберіть лікаря</h3>${st.doctors ? `<div class="st-list">${st.doctors.map(d => `<button class="st" data-act="doc" data-id="${d.id}"><span class="ava sm">${esc(d.name[0])}</span><span>${esc(d.name)}<small>${esc(d.spec)} · каб. ${d.room}</small></span></button>`).join('')}</div>` : skeleton(3)}`;
    if (!st.days) return crumbs + skeleton(3);
    if (!st.days.length) return crumbs + empty('Вільного часу найближчими днями немає.');
    const d = st.days[st.day];
    return crumbs + `<h3>Оберіть час — ${esc(st.doctor.spec.toLowerCase())}, каб. ${st.doctor.room}</h3><div class="days small">${st.days.map((x, i) => `<button class="day ${i === st.day ? 'on' : ''}" data-act="dday" data-i="${i}"><small>${fmt.dayShort(x.day)}</small><b>${x.slots.filter(s => !s.busy).length}</b><span class="muted">вільно</span></button>`).join('')}</div><div class="slots">${d.slots.map(s => `<button class="slot" ${s.busy ? 'disabled' : ''} data-act="slot" data-ts="${s.ts}">${fmt.time(s.ts)}</button>`).join('')}</div>`;
  };
  const draw = () => {
    const mine = appts.filter(a => a.status === 'Заплановано' && a.ts > Date.now()); const past = appts.filter(a => !mine.includes(a)).slice(0, 5);
    root.innerHTML = pageHead('Медичний кабінет', '#/services') + `<div class="note">${icon('info')}<span>Дані надходять із медичної інформаційної системи «Каштан» через АС ВВО МР. ${demoTag('у демо — емуляція')}</span></div>
      <section class="card"><h2>${patients.length > 1 ? 'Пацієнти' : 'Пацієнт'}</h2>${patients.length > 1 ? '<p class="muted">Ваш номер телефону вказано в кількох медичних картках. Оберіть, для кого дія.</p>' : ''}
        <div class="grid two">${patients.map(p => `<button class="pat ${p.id === st.patient.id ? 'on' : ''}" data-act="pat" data-id="${p.id}" aria-pressed="${p.id === st.patient.id}"><div class="ava">${esc(p.name.split(' ')[1]?.[0] || '?')}</div><div><b>${esc(p.name)}</b><small>${p.birth ? 'Дата народження: ' + fmt.date(p.birth) : 'Дату народження не вказано'}</small><small>Медична картка ${esc(p.card)} · ${esc(p.relation)}</small><small>Заклад: ${esc(fById(p.facilityId).name)}</small><small>Лікар: ${esc(p.doctor.name)} (${esc(p.doctor.spec.toLowerCase())})</small></div></button>`).join('')}</div></section>
      <section class="card"><h2>Запис до лікаря</h2><p class="muted">Пацієнт: <b>${esc(st.patient.name)}</b></p>${wizard()}</section>
      <section class="card"><h2>Мої записи</h2>${mine.length ? mine.map(a => `<div class="appt"><div class="when"><b>${fmt.time(a.ts)}</b><small>${fmt.dayShort(a.ts)}</small></div><div class="grow"><b>${esc(a.doctorName)}</b><small>${esc(a.spec)} · каб. ${a.room} · ${esc(a.facilityName)}</small><small>Пацієнт: ${esc(a.patientName)}</small></div><button class="btn sm ghost" data-act="cancel" data-id="${a.id}">Скасувати</button></div>`).join('') : empty('Запланованих візитів немає.')}
        ${past.length ? `<details class="past"><summary>Минулі та скасовані (${past.length})</summary>${past.map(a => `<div class="appt mute"><div class="when"><b>${fmt.time(a.ts)}</b><small>${fmt.dayShort(a.ts)}</small></div><div class="grow"><b>${esc(a.doctorName)}</b><small>${esc(a.spec)} · ${esc(a.status)}</small></div></div>`).join('')}</details>` : ''}<p class="muted sm">Талони зберігаються в розділі <a href="#/requests">«Звернення»</a>.</p></section>`;
  };
  const loadDoctors = async () => { st.doctors = null; draw(); try { st.doctors = await api.medDoctors(session.token, st.facility.id); draw(); } catch (e) { fail(e); } };
  const loadSlots = async () => { st.days = null; st.day = 0; draw(); try { st.days = await api.medSlots(session.token, st.doctor.id); draw(); } catch (e) { fail(e); } };
  acts(root, {
    pat: el => { st.patient = patients.find(p => p.id === el.dataset.id); Object.assign(st, { mode: null, facility: null, doctor: null, days: null }); draw(); },
    mode: el => { st.mode = el.dataset.m; if (st.mode === 'own') { st.facility = fById(st.patient.facilityId); st.doctor = st.patient.doctor; loadSlots(); } else draw(); },
    reset: () => { Object.assign(st, { mode: null, facility: null, doctor: null, days: null }); draw(); },
    tofac: () => { if (st.mode === 'own') return; Object.assign(st, { doctor: null, days: null }); draw(); },
    fac: el => { st.facility = fById(el.dataset.id); loadDoctors(); },
    doc: el => { st.doctor = st.doctors.find(d => d.id === el.dataset.id); loadSlots(); },
    dday: el => { st.day = +el.dataset.i; draw(); },
    slot: async el => {
      const ts = +el.dataset.ts;
      if (!await confirmDlg('Підтвердити запис?', `<b>${esc(st.patient.name)}</b><br>${esc(st.doctor.name)}, ${esc(st.doctor.spec.toLowerCase())}<br>${esc(st.facility.name)}, каб. ${st.doctor.room}<br><b>${fmt.dt(ts)}</b>`, 'Записатися')) return;
      try { await api.medBook(session.token, { patient: st.patient, doctor: st.doctor, facility: st.facility, ts }); appts = await api.medAppointments(session.token); Object.assign(st, { mode: null, facility: null, doctor: null, days: null }); toast('Вас записано. Талон — у розділі «Звернення».'); draw(); }
      catch (e) { fail(e); if (e.code === 'busy') loadSlots(); }
    },
    cancel: async el => { if (!await confirmDlg('Скасувати запис?', 'Час прийому стане доступним для інших пацієнтів.', 'Скасувати запис', true)) return; try { await api.medCancel(session.token, el.dataset.id); appts = await api.medAppointments(session.token); toast('Запис скасовано'); draw(); } catch (e) { fail(e); } },
  });
  draw();
}
