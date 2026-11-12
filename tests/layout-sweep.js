// Обхід екранів із перевіркою верстки. Викликається з консолі відкритого кабінету:
//   const { sweep } = await import('./tests/layout-sweep.js'); await sweep(['home', 'parking/subs'])
const sleep = ms => new Promise(r => setTimeout(r, ms));
const desc = el => (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '')).slice(0, 60);
const scroller = el => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX) && p !== document.body && p !== document.documentElement) return true; if (p.classList.contains('leaflet-container')) return true; } return false; };
const visible = el => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0'; };

export async function check(label) {
  const vw = document.documentElement.clientWidth, out = [];
  const pageOver = document.documentElement.scrollWidth - vw; if (pageOver > 1) out.push('сторінка ширша за екран на ' + pageOver + 'px');
  const sticking = new Set();
  for (const el of document.querySelectorAll('#view *, #nav *, #tabbar *, #demo-bar, .modal *')) { if (!visible(el) || el.closest('.leaflet-container')) continue; const b = el.getBoundingClientRect(); if ((b.right > vw + 1 || b.left < -1) && !scroller(el)) sticking.add(desc(el)); }
  if (sticking.size) out.push('виходить за екран: ' + [...sticking].slice(0, 4).join(', '));
  const clipped = new Set();
  for (const el of document.querySelectorAll('#view *, #nav *, #tabbar *, .modal *')) { if (!visible(el) || el.children.length || !el.textContent.trim() || el.closest('.leaflet-container')) continue; const s = getComputedStyle(el); if (el.scrollWidth > el.clientWidth + 2 && s.display !== 'inline' && /(hidden|clip)/.test(s.overflowX)) clipped.add(desc(el)); }
  if (clipped.size) out.push('обрізаний текст: ' + [...clipped].slice(0, 4).join(', '));
  if (matchMedia('(max-width: 860px)').matches) { const small = new Set(); for (const el of document.querySelectorAll('#view button, #view a.btn, #view input:not([type=checkbox]):not([type=radio]), #view select, #tabbar a')) { if (!visible(el) || el.closest('.leaflet-container')) continue; const b = el.getBoundingClientRect(); if (b.height < 32 || b.width < 32) small.add(desc(el) + ' ' + Math.round(b.width) + '×' + Math.round(b.height)); } if (small.size) out.push('дрібні кнопки: ' + [...small].slice(0, 5).join(', ')); }
  const tb = document.querySelector('#tabbar'); if (tb && visible(tb)) { const last = [...document.querySelectorAll('#view .view > *')].pop(); if (last) { window.scrollTo(0, document.body.scrollHeight); await sleep(50); const lb = last.getBoundingClientRect(), t = tb.getBoundingClientRect(); if (lb.bottom > t.top + 1) out.push('нижня панель перекриває кінець сторінки на ' + Math.round(lb.bottom - t.top) + 'px'); window.scrollTo(0, 0); } }
  const junk = (document.querySelector('#view').innerText.match(/\b(undefined|NaN|null|\[object [A-Za-z]+\]|Invalid Date)\b/g) || []); if (junk.length) out.push('сміття в тексті: ' + [...new Set(junk)].join(', '));
  if (document.querySelector('#view .skel')) out.push('завис індикатор завантаження');
  if (document.querySelector('#view .empty.err')) out.push('екран помилки');
  for (const img of document.images) if (img.complete && !img.naturalWidth) out.push('не завантажилось зображення ' + img.src.split('/').pop());
  for (const el of document.querySelectorAll('#view button, #view a, #view input, #view select')) { if (!visible(el)) continue; const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.title || (el.labels && el.labels[0]?.textContent) || el.value || '').trim(); if (!name) { out.push('елемент без назви для читача екрана: ' + desc(el)); break; } }
  return out.length ? { [label]: out } : null;
}
export async function sweep(routes, wait = 1500) {
  const issues = {}; const errs = []; const onErr = e => errs.push(String(e.message || e.reason || e)); addEventListener('error', onErr); addEventListener('unhandledrejection', onErr);
  for (const r of routes) { location.hash = '#/' + r; await sleep(/maps|air/.test(r) ? wait + 1800 : wait); Object.assign(issues, await check(r) || {}); }
  removeEventListener('error', onErr); removeEventListener('unhandledrejection', onErr);
  return { viewport: innerWidth + '×' + innerHeight, checked: routes.length, issues, jsErrors: errs };
}

// Контраст тексту за WCAG 2.1 AA: 4.5:1 для звичайного тексту, 3:1 для великого
const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };
const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
function bgOf(el) { const stack = []; for (let p = el; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.backgroundImage !== 'none') return null; const c = parse(s.backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; } } let base = { r: 255, g: 255, b: 255, a: 1 }; for (const c of stack.reverse()) base = over(c, base); return base; }
export function contrast() {
  const bad = new Map();
  for (const el of document.querySelectorAll('#view *, #nav *, #tabbar *, #demo-bar, #demo-bar *, .modal *')) {
    if (!visible(el) || el.closest('.leaflet-container') || el.closest('svg') || el.disabled) continue;
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const s = getComputedStyle(el), fg0 = parse(s.color), bg = bgOf(el); if (!fg0 || !bg) continue;
    const fg = over(fg0, bg), a = lum(fg), b = lum(bg), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const px = parseFloat(s.fontSize), big = px >= 24 || (px >= 18.66 && +s.fontWeight >= 700);
    if (ratio < (big ? 3 : 4.5)) { const k = desc(el); if (!bad.has(k) || bad.get(k) > ratio) bad.set(k, +ratio.toFixed(2)); }
  }
  return Object.fromEntries(bad);
}
export async function contrastSweep(routes, wait = 1200) { const out = {}; for (const r of routes) { location.hash = '#/' + r; await sleep(/maps|air/.test(r) ? wait + 1500 : wait); const c = contrast(); if (Object.keys(c).length) out[r] = c; } return out; }
