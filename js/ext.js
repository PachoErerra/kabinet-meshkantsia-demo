// Інтеграції зі сторонніми надавачами даних (п. A.2 та 2.1.3.3 ТЗ).
// У демо веб-клієнт звертається до відкритих API напряму; у промисловій версії
// ті самі відповіді має віддавати шлюз АС ВВО МР — достатньо змінити адреси в SOURCES.

export const SOURCES = {
  nbu: 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json',
  weather: 'https://api.open-meteo.com/v1/forecast?latitude=48.4647&longitude=35.0462&timezone=Europe%2FKyiv&forecast_days=10&wind_speed_unit=ms'
    + '&current=temperature_2m,apparent_temperature,weather_code,surface_pressure,relative_humidity_2m,precipitation,wind_speed_10m,is_day'
    + '&hourly=temperature_2m,apparent_temperature,weather_code,surface_pressure,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum',
  air: 'https://api.saveecobot.com/output.json',
  airModel: 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=48.4647&longitude=35.0462&current=us_aqi,pm2_5,pm10',
  outages: 'https://raw.githubusercontent.com/Baskerville42/outage-data-ua/main/data/dnipro.json',
  alerts: null, // джерело тривог потребує ключа доступу; у промисловій версії — канал АС ВВО МР
};

const mem = new Map();
async function cached(key, ttlMs, loader) {
  const hit = mem.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return hit.val;
  try {
    const val = await loader(); mem.set(key, { ts: Date.now(), val });
    try { sessionStorage.setItem('kmd.cache.' + key, JSON.stringify({ ts: Date.now(), val })); } catch { /* кеш необов'язковий */ }
    return val;
  } catch (e) {
    if (hit) return hit.val;
    try { const s = JSON.parse(sessionStorage.getItem('kmd.cache.' + key)); if (s) return { ...s.val, stale: true }; } catch { /* немає кешу */ }
    throw e;
  }
}
async function getJson(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

// ---------- курси НБУ ----------
const CUR_ORDER = ['USD', 'EUR', 'PLN', 'GBP', 'CHF', 'CZK', 'CAD', 'TRY', 'CNY', 'JPY'];
export const rates = () => cached('nbu', 30 * 60000, async () => {
  const raw = await getJson(SOURCES.nbu);
  const all = raw.map(x => ({ cc: x.cc, name: x.txt, rate: x.rate, date: x.exchangedate }));
  all.sort((a, b) => { const ia = CUR_ORDER.indexOf(a.cc), ib = CUR_ORDER.indexOf(b.cc); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.name.localeCompare(b.name, 'uk'); });
  return { date: all[0]?.date, items: all };
});

// ---------- погода ----------
const WMO = {
  0: ['Ясно', '☀️'], 1: ['Переважно ясно', '🌤️'], 2: ['Мінлива хмарність', '⛅'], 3: ['Хмарно', '☁️'],
  45: ['Туман', '🌫️'], 48: ['Туман з памороззю', '🌫️'], 51: ['Слабка мряка', '🌦️'], 53: ['Мряка', '🌦️'], 55: ['Сильна мряка', '🌧️'],
  56: ['Крижана мряка', '🌧️'], 57: ['Сильна крижана мряка', '🌧️'], 61: ['Невеликий дощ', '🌦️'], 63: ['Дощ', '🌧️'], 65: ['Сильний дощ', '🌧️'],
  66: ['Крижаний дощ', '🌧️'], 67: ['Сильний крижаний дощ', '🌧️'], 71: ['Невеликий сніг', '🌨️'], 73: ['Сніг', '🌨️'], 75: ['Сильний сніг', '❄️'],
  77: ['Снігова крупа', '🌨️'], 80: ['Короткочасний дощ', '🌦️'], 81: ['Зливи', '🌧️'], 82: ['Сильні зливи', '⛈️'],
  85: ['Снігопад', '🌨️'], 86: ['Сильний снігопад', '❄️'], 95: ['Гроза', '⛈️'], 96: ['Гроза з градом', '⛈️'], 99: ['Сильна гроза з градом', '⛈️'],
};
export const condition = code => ({ code, text: (WMO[code] || ['Невідомо', '🌡️'])[0], icon: (WMO[code] || ['', '🌡️'])[1] });
export const hPaToMm = h => Math.round(h * 0.750062);
export const weather = () => cached('weather', 15 * 60000, async () => {
  const w = await getJson(SOURCES.weather); const H = w.hourly, D = w.daily;
  const days = D.time.map((date, i) => ({
    date, cond: condition(D.weather_code[i]), tmax: D.temperature_2m_max[i], tmin: D.temperature_2m_min[i],
    sunrise: D.sunrise[i].slice(11), sunset: D.sunset[i].slice(11), precip: D.precipitation_sum[i], hours: [],
  }));
  const byDate = Object.fromEntries(days.map(d => [d.date, d]));
  H.time.forEach((t, i) => byDate[t.slice(0, 10)]?.hours.push({
    time: t.slice(11), temp: H.temperature_2m[i], feels: H.apparent_temperature[i], cond: condition(H.weather_code[i]),
    pressure: H.surface_pressure[i], humidity: H.relative_humidity_2m[i], precip: H.precipitation[i], prob: H.precipitation_probability[i], wind: H.wind_speed_10m[i],
  }));
  const c = w.current;
  return { now: { time: c.time, temp: c.temperature_2m, feels: c.apparent_temperature, cond: condition(c.weather_code), pressure: c.surface_pressure, humidity: c.relative_humidity_2m, precip: c.precipitation, wind: c.wind_speed_10m }, days };
});

// ---------- якість повітря ----------
export function aqiLevel(v) {
  if (v == null) return { text: 'Немає даних', color: '#8a94a6', cls: 'na' };
  if (v <= 50) return { text: 'Добра', color: '#2e9e5b', cls: 'good' };
  if (v <= 100) return { text: 'Помірна', color: '#d6a400', cls: 'mod' };
  if (v <= 150) return { text: 'Шкідлива для чутливих груп', color: '#e67e22', cls: 'usg' };
  if (v <= 200) return { text: 'Шкідлива', color: '#d64545', cls: 'bad' };
  if (v <= 300) return { text: 'Дуже шкідлива', color: '#8e44ad', cls: 'vbad' };
  return { text: 'Небезпечна', color: '#7b1e2b', cls: 'haz' };
}
export const air = () => cached('air', 10 * 60000, async () => {
  let stations = [];
  try {
    const raw = await getJson(SOURCES.air); const fresh = Date.now() - 6 * 3600e3;
    stations = raw.filter(s => +s.latitude > 48.33 && +s.latitude < 48.6 && +s.longitude > 34.85 && +s.longitude < 35.25).map(s => {
      const p = Object.fromEntries(s.pollutants.map(x => [x.pol, x]));
      const aq = p['Air Quality Index'];
      return { id: s.id, name: s.localName || s.stationName, street: s.stationName, lat: +s.latitude, lon: +s.longitude, platform: s.platformName, aqi: aq && Date.parse(aq.time) > fresh - 18 * 3600e3 ? Math.round(aq.value) : null, pm25: p['PM2.5']?.value ?? null, pm10: p['PM10']?.value ?? null, temp: p['Temperature']?.value ?? null, humidity: p['Humidity']?.value ?? null, time: aq?.time || null };
    }).filter(s => s.aqi != null);
  } catch { /* впадемо на модельні дані нижче */ }
  if (stations.length) { const avg = Math.round(stations.reduce((a, s) => a + s.aqi, 0) / stations.length); return { avg, stations, source: 'Громадські датчики SaveEcoBot / SaveDnipro' }; }
  const m = await getJson(SOURCES.airModel);
  return { avg: Math.round(m.current.us_aqi), stations: [], source: 'Модельні дані Open-Meteo (датчики недоступні)' };
});

// ---------- графіки відключень ----------
export const OPERATORS = { dtek: 'ДТЕК Дніпровські електромережі', cek: 'ЦЕК' };
export const GROUPS = ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2', '6.1', '6.2'];
const gpv = (operator, group) => operator === 'cek' ? 'GPV100' + group : 'GPV' + group;
// 48 півгодин: 'on' | 'off' | 'maybe'
function halves(hours) {
  const out = [];
  for (let h = 1; h <= 24; h++) {
    const v = hours?.[h] ?? 'yes';
    const pair = { yes: ['on', 'on'], no: ['off', 'off'], maybe: ['maybe', 'maybe'], first: ['off', 'on'], second: ['on', 'off'], mfirst: ['maybe', 'on'], msecond: ['on', 'maybe'] }[v] || ['on', 'on'];
    out.push(...pair);
  }
  return out;
}
export function intervals(h, kind) {
  const out = []; let s = -1;
  for (let i = 0; i <= 48; i++) { if (i < 48 && h[i] === kind) { if (s < 0) s = i; } else if (s >= 0) { out.push([s, i]); s = -1; } }
  return out;
}
export const hm = i => String(Math.floor(i / 2) % 24).padStart(2, '0') + ':' + (i % 2 ? '30' : '00');
export const outageFeed = () => cached('outages', 5 * 60000, () => getJson(SOURCES.outages));
export async function outageSchedule(operator, group) {
  const feed = await outageFeed(); const key = gpv(operator, group); const today = feed.fact?.today;
  const day = (ts, offset) => {
    const fact = feed.fact?.data?.[String(ts)]?.[key];
    if (fact) return { halves: halves(fact), kind: 'fact' };
    const wd = ((new Date((ts + 43200) * 1000).getUTCDay() + 6) % 7) + 1; // 1 = понеділок
    const preset = feed.preset?.data?.[key]?.[wd];
    return preset ? { halves: halves(preset), kind: 'preset' } : { halves: null, kind: 'none', offset };
  };
  return { today: day(today, 0), tomorrow: day(today + 86400, 1), updated: feed.fact?.update || feed.lastUpdated, todayTs: today * 1000 };
}

// ---------- повітряна тривога ----------
export async function alertStatus(demoOverride) {
  if (demoOverride === true || demoOverride === false) return { state: demoOverride ? 'on' : 'off', demo: true, since: null };
  if (!SOURCES.alerts) return { state: 'unknown' };
  try { const d = await getJson(SOURCES.alerts); const s = d.states?.['Дніпропетровська область']; return { state: s?.alertnow ? 'on' : 'off', since: s?.changed || null }; }
  catch { return { state: 'unknown' }; }
}

export const staticData = name => cached('static.' + name, 3600e3, () => getJson('data/' + name + '.json').then(items => ({ items })));
