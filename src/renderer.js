const $ = (id) => document.getElementById(id);

const state = {
  masechet: MASECHTOT[0],
  daf: '2a',
  dapim: [],
  gemaraSegs: [],
  jumpTargets: new Map(),
  jitsi: null,
  view: 'daf',
  seferSegs: [],
  seferNav: { prev: null, next: null }
};

const WORKS = {
  rif: { he: 'רי״ף', start: (en) => `Rif ${en} 2a` },
  rosh: { he: 'פסקי הרא״ש', start: (en) => `Rosh on ${en} 1:1` },
  maharsha: { he: 'מהרש״א', start: (en) => `Chidushei Halachot on ${en} 2a` }
};

const THEMES = ['blue', 'red', 'classic'];
const POSEK_ORDER = ['רי"ף', 'רא"ש', 'משנה תורה', 'רמב"ם', 'טור', 'שולחן ערוך', 'ספר מצוות גדול', 'ספר החינוך'];

const SIDE_DEFAULT = { inner: { title: 'רש"י', prefix: 'Rashi on' }, outer: { title: 'תוספות', prefix: 'Tosafot on' } };
const SIDE = {
  Nedarim: { inner: { title: 'רש"י', prefix: 'Rashi on' }, outer: { title: 'ר"ן', prefix: 'Ran on' } }
};

function boldDH(html) {
  if (typeof html !== 'string') html = String(html || '');
  if (/^\s*<b/i.test(html)) return html;
  const m = html.match(/^(\s*[^<][^.–\-־׃]{1,88}?)([.׃]|\s[–\-־])/);
  if (!m) return html;
  return '<b class="dh-bold">' + m[1] + '</b>' + html.slice(m[1].length);
}

let readFS = 22;

function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

function flat(x) {
  const out = [];
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v != null && String(v).trim()) out.push(String(v));
  };
  walk(x);
  return out;
}
function stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = flat(html).join(' ');
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}
function snippet(html, words = 6) {
  const clean = stripHtml(html).replace(/[־–]/g, ' ');
  return clean.split(' ').filter(Boolean).slice(0, words).join(' ');
}
function segNumOf(ref) {
  const m = String(ref || '').match(/:(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
function nameOf(ln) {
  return (ln.collectiveTitle && ln.collectiveTitle.he) || ln.heTitle || ln.index_title || '';
}

/* ── selects ─────────────────────────────────── */
function buildMasechetSelect() {
  const sel = $('masechet');
  sel.innerHTML = '';
  const seders = {};
  MASECHTOT.forEach((m, i) => (seders[m.seder] = seders[m.seder] || []).push({ m, i }));
  for (const seder of Object.keys(seders)) {
    const og = document.createElement('optgroup');
    og.label = 'סדר ' + seder;
    for (const { m, i } of seders[seder]) {
      const o = document.createElement('option');
      o.value = String(i); o.textContent = m.he;
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
}
function buildDafSelect() {
  const sel = $('daf');
  sel.innerHTML = '';
  state.dapim = dapimFor(state.masechet);
  for (const d of state.dapim) {
    const lbl = amudLabel(d);
    const o = document.createElement('option');
    o.value = d; o.textContent = `${lbl.daf} ${lbl.amud === 'א' ? '.' : ':'}`;
    sel.appendChild(o);
  }
  sel.value = state.daf;
}

/* ── load a daf ──────────────────────────────── */
async function loadDaf() {
  const en = state.masechet.en, daf = state.daf;
  $('loading').classList.remove('hidden');

  const lbl = amudLabel(daf);
  $('banner-mid').textContent = state.masechet.he;
  $('corner-r').textContent = `${lbl.daf}${lbl.amud === 'א' ? '.' : ':'}`;
  $('corner-l').textContent = `${lbl.daf}${lbl.amud === 'א' ? '.' : ':'}`;
  $('footer-masechet').textContent = state.masechet.he;
  $('footer-daf').textContent = lbl.full;
  $('daf-grid').classList.toggle('amud-b', lbl.amud === 'ב');

  const side = SIDE[en] || SIDE_DEFAULT;
  state.side = side;
  $('rashi-title').textContent = side.inner.title;
  $('tosafot-title').textContent = side.outer.title;

  const gemaraRef = `${en} ${daf}`;
  const [gem, inner, outer, links] = await Promise.all([
    Api.fetchText(gemaraRef),
    Api.fetchText(`${side.inner.prefix} ${en} ${daf}`),
    Api.fetchText(`${side.outer.prefix} ${en} ${daf}`),
    Api.fetchLinks(gemaraRef, true)
  ]);

  if (!gem.ok) {
    $('loading').classList.add('hidden');
    toast('לא הצלחתי לטעון את הדף (בדוק חיבור לאינטרנט)');
    $('gemara-body').innerHTML = `<div style="color:var(--title)">שגיאה: ${gem.error}</div>`;
    return;
  }

  console.log('DAF', gemaraRef, 'gem.ok=', gem.ok, 'segs=', (gem.data && gem.data.he || []).length,
    'inner=', inner.ok && flat(inner.data.he).length, 'outer=', outer.ok && flat(outer.data.he).length,
    'links=', links.ok && links.data.length);

  renderGemara(gem.data);
  renderColumn($('rashi-body'), inner.ok ? inner.data.he : []);
  renderColumn($('tosafot-body'), outer.ok ? outer.data.he : []);
  buildSections(links.ok ? links.data : []);

  $('page-scroll').scrollTop = 0;
  $('gemara-body').scrollTop = 0;
  $('loading').classList.add('hidden');
}

function firstWord(html) {
  const t = stripHtml(html);
  return (t.split(/\s+/)[0] || '').replace(/[.,:;׃]$/, '');
}

function renderGemara(data) {
  state.gemaraSegs = data.he || [];
  const body = $('gemara-body');
  body.innerHTML = '';
  if (state.daf === '2a' && state.gemaraSegs.length) {
    const w = firstWord(state.gemaraSegs[0]);
    if (w) {
      const box = document.createElement('div');
      box.className = 'incipit';
      box.textContent = w;
      body.appendChild(box);
    }
  }
  state.gemaraSegs.forEach((seg, i) => {
    const span = document.createElement('span');
    span.className = 'seg seg-anchor';
    span.id = 'seg-' + (i + 1);
    span.innerHTML = ' ' + seg + ' ';
    body.appendChild(span);
  });
  if (!state.gemaraSegs.length) body.innerHTML = '<div style="color:var(--ink-soft)">אין טקסט לדף זה.</div>';
}

function renderColumn(el, arr) {
  el.innerHTML = '';
  const items = flat(arr);
  if (!items.length) { el.innerHTML = '<div style="color:var(--ink-soft);font-size:14px">— אין —</div>'; return; }
  items.forEach((c) => {
    const d = document.createElement('div');
    d.className = 'comment';
    d.innerHTML = boldDH(c);
    el.appendChild(d);
  });
}

/* ── mefarshim + poskim sections ─────────────── */
function buildSections(links) {
  state.jumpTargets = new Map();
  const mef = new Map(), pos = new Map();

  for (const ln of links) {
    if (!ln) continue;
    const name = nameOf(ln);
    if (!name) continue;
    if (ln.category === 'Commentary') {
      if (name === state.side.inner.title || name === state.side.outer.title) continue;
      if (/Rashi|Tosafot|^רש"?י$|^תוספות$/i.test(name)) continue;
      (mef.get(name) || mef.set(name, []).get(name)).push(ln);
    } else if (ln.category === 'Halakhah') {
      const base = name.split(',')[0].trim();
      (pos.get(base) || pos.set(base, []).get(base)).push(ln);
    }
  }

  const mefNames = sortMefarshim([...mef.keys()]);
  const right = $('otzar-right'), left = $('otzar-left');
  right.innerHTML = ''; left.innerHTML = '';
  mefNames.forEach((name, i) => {
    (i % 2 === 0 ? right : left).appendChild(makeMefBox(name, mef.get(name), { open: true }));
  });
  $('mefarshim-wrap').style.display = 'none';

  renderSectionGroup($('poskim-sections'), pos, sortPoskim([...pos.keys()]));
  $('poskim-wrap').style.display = pos.size ? '' : 'none';

  buildDropdown(mefNames, sortPoskim([...pos.keys()]));
}

const MEF_ORDER = ['רי"ף', 'רא"ש', 'מרדכי', 'ר"ן', 'רשב"א', 'ריטב"א', 'רמב"ן', 'רא"ה', 'מאירי', 'שיטה מקובצת', 'מהרש"א', 'מהר"ם', 'מהרש"ל', 'פני יהושע', 'צל"ח', 'רש"ש', 'חידושי רבי עקיבא איגר'];
function sortMefarshim(arr) {
  return arr.sort((a, b) => {
    const ia = MEF_ORDER.findIndex((p) => a.includes(p));
    const ib = MEF_ORDER.findIndex((p) => b.includes(p));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'he');
  });
}

function makeMefBox(name, rawList, opts) {
  opts = opts || {};
  const segs = opts.segs || state.gemaraSegs;
  const onJump = opts.onJump || flashSegment;
  const list = rawList.slice().sort((a, b) => (segNumOf(a.anchorRef) || 0) - (segNumOf(b.anchorRef) || 0));
  const det = document.createElement('details');
  det.className = 'mef';
  if (opts.open) det.open = true;
  state.jumpTargets.set(name, det);

  const sum = document.createElement('summary');
  sum.innerHTML = `<span>${name}</span><span class="sum-tools"><button class="enlarge" title="הגדל וקרא">⤢</button><span class="count">${list.length}</span></span>`;
  det.appendChild(sum);
  sum.querySelector('.enlarge').onclick = (e) => { e.preventDefault(); e.stopPropagation(); openRead(name, list, segs); };

  const body = document.createElement('div');
  body.className = 'mef-body';
  list.forEach((ln, i) => {
    const segN = segNumOf(ln.anchorRef);
    const gemHtml = segN && segs[segN - 1] ? segs[segN - 1] : '';
    const dh = snippet(gemHtml) || ('סימן ' + (segN || '?'));
    const c = document.createElement('div');
    c.className = 'mef-comment';
    const parts = flat(ln.he).length ? flat(ln.he) : ['(אין טקסט)'];
    c.innerHTML =
      `<span class="dh"><span class="n">${i + 1}.</span>${dh} …</span>` +
      `<div class="body">${boldDH(parts.join(' '))}</div>`;
    c.querySelector('.dh').onclick = () => onJump(segN);
    body.appendChild(c);
  });
  det.appendChild(body);
  return det;
}

function openRead(name, rawList, segs) {
  segs = segs || state.gemaraSegs;
  const list = rawList.slice().sort((a, b) => (segNumOf(a.anchorRef) || 0) - (segNumOf(b.anchorRef) || 0));
  $('read-title').textContent = name;
  $('read-body').innerHTML = list.map((ln, i) => {
    const segN = segNumOf(ln.anchorRef);
    const gemHtml = segN && segs[segN - 1] ? segs[segN - 1] : '';
    const dh = snippet(gemHtml, 8) || ('סימן ' + (segN || '?'));
    const parts = flat(ln.he).length ? flat(ln.he) : ['(אין טקסט)'];
    return `<div class="read-comment"><div class="read-dh" data-seg="${segN || ''}"><span class="n">${i + 1}.</span>${dh} …</div>` +
      `<div class="read-text">${boldDH(parts.join(' '))}</div></div>`;
  }).join('');
  $('read-body').querySelectorAll('.read-dh').forEach((el) => {
    el.onclick = () => { const s = parseInt(el.dataset.seg, 10); if (s) { closeRead(); flashSegment(s); } };
  });
  setReadFS(readFS);
  $('read-modal').classList.remove('hidden');
}
function closeRead() { $('read-modal').classList.add('hidden'); }
function setReadFS(px) { readFS = Math.max(14, Math.min(52, px)); $('read-body').style.fontSize = readFS + 'px'; }

function sortByHe(arr) { return arr.sort((a, b) => a.localeCompare(b, 'he')); }
function sortPoskim(arr) {
  return arr.sort((a, b) => {
    const ia = POSEK_ORDER.findIndex((p) => a.includes(p));
    const ib = POSEK_ORDER.findIndex((p) => b.includes(p));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'he');
  });
}

function renderSectionGroup(container, map, names) {
  container.innerHTML = '';
  names.forEach((name) => container.appendChild(makeMefBox(name, map.get(name), { open: false })));
}

function buildDropdown(mefNames, posNames) {
  const sel = $('mefaresh');
  sel.innerHTML = '';
  const head = document.createElement('option');
  head.value = '';
  head.textContent = (mefNames.length + posNames.length) ? '— קפוץ למפרש —' : '— אין מפרשים —';
  sel.appendChild(head);
  const grp = (label, names) => {
    if (!names.length) return;
    const og = document.createElement('optgroup');
    og.label = label;
    names.forEach((n) => {
      const o = document.createElement('option');
      o.value = n; o.textContent = n;
      og.appendChild(o);
    });
    sel.appendChild(og);
  };
  grp('מפרשים', mefNames);
  grp('פוסקים', posNames);
}

function jumpTo(name) {
  const det = state.jumpTargets.get(name);
  if (!det) return;
  det.open = true;
  det.scrollIntoView({ behavior: 'smooth', block: 'start' });
  det.querySelector('summary').style.background = 'color-mix(in srgb, var(--gold) 30%, transparent)';
  setTimeout(() => (det.querySelector('summary').style.background = ''), 1500);
}

function flashSegment(n) {
  if (!n) return;
  const el = $('seg-' + n);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1800);
}

/* ── sefer view (back-of-volume works) ───────── */
function switchView(view) {
  state.view = view;
  const isDaf = view === 'daf';
  $('daf-stage').style.display = isDaf ? '' : 'none';
  $('mefarshim-wrap').style.display = isDaf ? '' : 'none';
  $('poskim-wrap').style.display = isDaf ? '' : 'none';
  $('sefer-view').classList.toggle('hidden', isDaf);
  if (!isDaf) loadSefer(WORKS[view].start(state.masechet.en), view);
}

async function loadSefer(ref, view) {
  $('loading').classList.remove('hidden');
  $('sefer-right').innerHTML = ''; $('sefer-left').innerHTML = '';
  const [txt, links] = await Promise.all([Api.fetchText(ref), Api.fetchLinks(ref, true)]);
  $('loading').classList.add('hidden');

  if (!txt.ok || !flat(txt.data.he).length) {
    $('sefer-title').textContent = WORKS[view].he + ' · ' + state.masechet.he;
    $('sefer-main').innerHTML = '<div style="color:var(--ink-soft);text-align:center;padding:30px">אין טקסט זמין לחיבור זה במסכת זו.</div>';
    $('sefer-foot').textContent = '';
    state.seferNav = { prev: null, next: null };
    return;
  }

  state.seferNav = { prev: txt.data.prev, next: txt.data.next };
  state.seferSegs = flat(txt.data.he);
  $('sefer-title').textContent = `${WORKS[view].he} · ${state.masechet.he}`;
  $('sefer-foot').textContent = txt.data.heRef || '';

  const main = $('sefer-main');
  main.innerHTML = '';
  state.seferSegs.forEach((seg, i) => {
    const span = document.createElement('div');
    span.className = 'seg';
    span.id = 'sseg-' + (i + 1);
    span.innerHTML = boldDH(seg);
    main.appendChild(span);
  });
  main.scrollTop = 0;

  const nosei = new Map();
  (links.ok ? links.data : []).forEach((ln) => {
    if (!ln || ln.category !== 'Commentary') return;
    const name = nameOf(ln);
    if (!name) return;
    (nosei.get(name) || nosei.set(name, []).get(name)).push(ln);
  });
  const names = [...nosei.keys()];
  names.forEach((name, i) => {
    (i % 2 === 0 ? $('sefer-right') : $('sefer-left'))
      .appendChild(makeMefBox(name, nosei.get(name), { open: true, segs: state.seferSegs, onJump: flashSeferSeg }));
  });
  $('page-scroll').scrollTop = 0;
}

function flashSeferSeg(n) {
  if (!n) return;
  const el = $('sseg-' + n);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1800);
}

function stepSefer(dir) {
  const ref = dir < 0 ? state.seferNav.prev : state.seferNav.next;
  if (!ref) { toast('סוף החיבור'); return; }
  loadSefer(ref, state.view);
}

/* ── navigation ──────────────────────────────── */
function stepDaf(dir) {
  const i = state.dapim.indexOf(state.daf);
  const j = i + dir;
  if (j < 0 || j >= state.dapim.length) { toast('סוף המסכת'); return; }
  state.daf = state.dapim[j];
  $('daf').value = state.daf;
  loadDaf();
}

/* ── video ───────────────────────────────────── */
function roomName() { return `Gmara-${state.masechet.en}-${state.daf}`.replace(/[^a-zA-Z0-9-]/g, ''); }
function openCall() {
  $('room-input').value = roomName();
  $('call-modal').classList.remove('hidden');
  $('call-setup').style.display = 'block';
  $('jitsi-container').innerHTML = '';
}
function joinCall() {
  const room = ($('room-input').value || roomName()).trim();
  const start = () => {
    $('call-setup').style.display = 'none';
    if (state.jitsi) { try { state.jitsi.dispose(); } catch (e) {} }
    state.jitsi = new JitsiMeetExternalAPI('meet.jit.si', {
      roomName: room, parentNode: $('jitsi-container'),
      width: '100%', height: '100%',
      configOverwrite: { prejoinPageEnabled: false },
      userInfo: { displayName: 'חברותא' }
    });
  };
  if (window.JitsiMeetExternalAPI) return start();
  const s = document.createElement('script');
  s.src = 'https://meet.jit.si/external_api.js';
  s.onload = start;
  s.onerror = () => toast('לא הצלחתי לטעון את Jitsi (בדוק אינטרנט)');
  document.head.appendChild(s);
}
function closeCall() {
  if (state.jitsi) { try { state.jitsi.dispose(); } catch (e) {} state.jitsi = null; }
  $('jitsi-container').innerHTML = '';
  $('call-modal').classList.add('hidden');
}

/* ── toggles ─────────────────────────────────── */
function toggleFont() {
  document.body.classList.toggle('square-comment');
  $('fontBtn').textContent = document.body.classList.contains('square-comment') ? 'אות מרובע' : 'אות רש״י';
}
function cycleTheme() {
  const cur = document.body.getAttribute('data-theme');
  const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
  document.body.setAttribute('data-theme', next);
  toast('צבע: ' + ({ blue: 'כחול', red: 'אדום', classic: 'קלאסי' }[next]));
}

/* ── init ────────────────────────────────────── */
function init() {
  buildMasechetSelect();
  buildDafSelect();

  const step = (dir) => (state.view === 'daf' ? stepDaf : stepSefer)(dir);

  $('masechet').addEventListener('change', (e) => {
    state.masechet = MASECHTOT[parseInt(e.target.value, 10)];
    state.daf = '2a'; buildDafSelect(); switchView(state.view);
  });
  $('daf').addEventListener('change', (e) => { state.daf = e.target.value; if (state.view === 'daf') loadDaf(); });
  $('view').addEventListener('change', (e) => switchView(e.target.value));
  $('sefer-prev').addEventListener('click', () => stepSefer(-1));
  $('sefer-next').addEventListener('click', () => stepSefer(1));
  $('prev').addEventListener('click', () => step(-1));
  $('next').addEventListener('click', () => step(1));
  $('mefaresh').addEventListener('change', (e) => { if (e.target.value) { jumpTo(e.target.value); e.target.value = ''; } });

  $('fontBtn').addEventListener('click', toggleFont);
  $('themeBtn').addEventListener('click', cycleTheme);
  $('callBtn').addEventListener('click', openCall);
  $('call-close').addEventListener('click', closeCall);
  $('join-btn').addEventListener('click', joinCall);
  $('fsBtn').addEventListener('click', () => toast('מסך מלא: F11'));

  $('read-close').addEventListener('click', closeRead);
  $('read-bigger').addEventListener('click', () => setReadFS(readFS + 2));
  $('read-smaller').addEventListener('click', () => setReadFS(readFS - 2));
  $('read-modal').addEventListener('click', (e) => { if (e.target.id === 'read-modal') closeRead(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeRead();
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') step(-1);
    if (e.key === 'ArrowLeft') step(1);
  });

  loadDaf();
}
window.addEventListener('DOMContentLoaded', init);
