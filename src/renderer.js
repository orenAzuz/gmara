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
  seferNav: { prev: null, next: null },
  history: []
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
  requestAnimationFrame(layoutTz);
  setTimeout(layoutTz, 120);
  if (haveFB() && Auth.uid) { try { Presence.setDaf(state.masechet.he, state.daf); } catch (e) {} }
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

function layoutTz() {
  const g = $('col-gemara'), grid = $('daf-grid');
  if (!g || !grid || !grid.classList.contains('tz')) return;
  const h = g.offsetHeight;
  if (h > 0) {
    grid.style.setProperty('--gm-h', h + 'px');
    grid.style.minHeight = (h + 24) + 'px';
  }
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
    (i % 2 === 0 ? right : left).appendChild(makeMefBox(name, mef.get(name), { open: false }));
  });
  const mesoret = collectMesoret(links);
  if (mesoret.length) right.insertBefore(makeMesoretBox(mesoret), right.firstChild);
  $('mefarshim-wrap').style.display = 'none';

  renderSectionGroup($('poskim-sections'), pos, sortPoskim([...pos.keys()]));
  $('poskim-wrap').style.display = pos.size ? '' : 'none';
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
  sum.innerHTML = `<span>${name}</span><span class="sum-tools"><button class="mef-read" title="הקרא בקול">🔊</button><button class="enlarge" title="הגדל וקרא">⤢</button><span class="count">${list.length}</span></span>`;
  det.appendChild(sum);
  sum.querySelector('.enlarge').onclick = (e) => { e.preventDefault(); e.stopPropagation(); openRead(name, list, segs); };
  sum.querySelector('.mef-read').onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    speak(list.map((ln) => flat(ln.he).map(stripHtml).join(' ')).join(' '));
  };

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

function collectMesoret(links) {
  const seen = new Set(), out = [];
  const CATS = ['Talmud', 'Mishnah', 'Tanakh', 'Midrash'];
  for (const ln of links) {
    if (!ln || !CATS.includes(ln.category)) continue;
    const ref = ln.ref;
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    out.push({ ref, he: ln.sourceHeRef || ref, cat: ln.category, seg: segNumOf(ln.anchorRef) || 0 });
  }
  return out.sort((a, b) => a.seg - b.seg);
}

function makeMesoretBox(list) {
  const det = document.createElement('details');
  det.className = 'mef mesoret';
  det.open = true;
  const sum = document.createElement('summary');
  sum.innerHTML = `<span>מסורת הש״ס</span><span class="count">${list.length}</span>`;
  det.appendChild(sum);
  const body = document.createElement('div');
  body.className = 'mef-body';
  const tag = { Talmud: 'גמ׳', Mishnah: 'משנה', Tanakh: 'פסוק', Midrash: 'מדרש' };
  list.forEach((m) => {
    const it = document.createElement('div');
    it.className = 'xref';
    it.title = m.ref;
    it.innerHTML = `<span class="xref-tag">${tag[m.cat] || ''}</span><span class="xref-he">${m.he}</span>`;
    it.onclick = () => openXref(m);
    body.appendChild(it);
  });
  det.appendChild(body);
  return det;
}

function openXref(m) {
  if (m.seg) flashSegment(m.seg);
  if (m.cat === 'Talmud' && parseRefString(m.ref)) navigateToRef(m.ref);
  else openRefText(m.ref, m.he);
}

async function openRefText(ref, heRef) {
  $('read-title').textContent = heRef || ref;
  $('read-body').innerHTML = '<div class="spinner" style="margin:30px auto"></div>';
  $('read-modal').classList.remove('hidden');
  const r = await Api.fetchText(ref);
  const parts = r.ok ? flat(r.data.he) : [];
  $('read-body').innerHTML = parts.length
    ? parts.map((p) => `<div class="read-text">${p}</div>`).join('')
    : '<div class="read-text" style="color:var(--ink-soft)">אין טקסט זמין למקור זה.</div>';
  setReadFS(readFS);
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
      .appendChild(makeMefBox(name, nosei.get(name), { open: false, segs: state.seferSegs, onJump: flashSeferSeg }));
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

/* ── search: reference jump + content (Claude + Sefaria) ── */
function detectAmud(q) {
  if (/[:：]|עמוד\s*ב|ע["״'`]?\s*ב(?![א-ת])|amud\s*bet|\d+\s*b\b/i.test(q)) return 'b';
  if (/\.|עמוד\s*א|ע["״'`]?\s*א(?![א-ת])|amud\s*alef|\d+\s*a\b/i.test(q)) return 'a';
  return null;
}

function parseRefString(ref) {
  if (!ref) return null;
  const m = MASECHTOT.slice().sort((a, b) => b.en.length - a.en.length)
    .find((x) => ref === x.en || ref.startsWith(x.en + ' '));
  if (!m) return null;
  const rest = ref.slice(m.en.length).trim();
  const dm = rest.match(/^(\d+)\s*([ab])?(?::(\d+))?/);
  if (!dm) return null;
  const num = parseInt(dm[1], 10);
  if (num < 2 || num > m.last) return null;
  return { masechet: m, daf: num + (dm[2] || 'a'), seg: dm[3] ? parseInt(dm[3], 10) : null };
}

function pushHistory() {
  state.history.push({ mi: MASECHTOT.indexOf(state.masechet), daf: state.daf, view: state.view });
  if (state.history.length > 60) state.history.shift();
}

async function goBack() {
  if (!state.history.length) { toast('אין דף קודם'); return; }
  const loc = state.history.pop();
  state.masechet = MASECHTOT[loc.mi];
  state.daf = loc.daf;
  state.view = loc.view;
  $('masechet').value = String(loc.mi);
  buildDafSelect();
  $('daf').value = loc.daf;
  $('view').value = loc.view;
  if (loc.view === 'daf') {
    $('daf-stage').style.display = ''; $('mefarshim-wrap').style.display = ''; $('poskim-wrap').style.display = '';
    $('sefer-view').classList.add('hidden');
    await loadDaf();
  } else {
    switchView(loc.view);
  }
}

async function navigateToRef(ref) {
  const p = parseRefString(ref);
  if (!p) { toast('לא ניתן לנווט: ' + ref); return false; }
  pushHistory();
  state.masechet = p.masechet;
  state.daf = p.daf;
  $('masechet').value = String(MASECHTOT.indexOf(p.masechet));
  buildDafSelect();
  $('daf').value = p.daf;
  state.view = 'daf'; $('view').value = 'daf';
  $('daf-stage').style.display = ''; $('mefarshim-wrap').style.display = ''; $('poskim-wrap').style.display = '';
  $('sefer-view').classList.add('hidden');
  await loadDaf();
  if (p.seg) flashSegment(p.seg);
  hideSearchResults();
  return true;
}

async function tryNavigateRef(q) {
  const r = await Api.resolveRef(q);
  if (!(r.ok && r.isRef && r.ref)) return false;
  let ref = r.ref;
  const headNoSeg = ref.replace(/:.*$/, '');
  if (!/[ab]$/.test(headNoSeg)) {
    const amud = detectAmud(q);
    ref = headNoSeg + (amud || 'a') + (ref.includes(':') ? ref.slice(ref.indexOf(':')) : '');
  }
  if (!parseRefString(ref)) return false;
  await navigateToRef(ref);
  return true;
}

async function doSearch(q) {
  q = (q || '').trim();
  if (!q) return;
  showSearchResults('<div class="sr-msg">מחפש…</div>');
  if (await tryNavigateRef(q)) return;

  let results = [];
  const ai = await Api.findRefs(q);
  if (ai.ok && ai.results && ai.results.length) results = ai.results;
  if (!results.length) {
    const s = await Api.searchTalmud(q);
    if (s.ok) results = s.refs.map((r) => ({ ref: r }));
  }
  if (!results.length) {
    showSearchResults('<div class="sr-msg">לא נמצאו מקורות. נסה ניסוח אחר, או מקור מדויק (למשל: כתובות סב:).</div>');
    return;
  }
  renderSearchResults(results);
  const navigable = results.filter((r) => parseRefString(r.ref));
  if (navigable.length) navigateToRef(navigable[0].ref);
}

function renderSearchResults(results) {
  const box = $('search-results');
  box.innerHTML = '<div class="sr-head">מקורות (' + results.length + ') — לחץ לניווט:</div>' +
    results.map((r, i) => {
      const ok = !!parseRefString(r.ref);
      const he = r.he || r.ref;
      const why = r.why ? `<span class="sr-why">${r.why}</span>` : '';
      return `<div class="sr-item ${ok ? '' : 'sr-dim'}" data-ref="${r.ref}" data-ok="${ok}">` +
        `<span class="sr-ref">${i === 0 ? '★ ' : ''}${he}</span>${why}</div>`;
    }).join('');
  box.querySelectorAll('.sr-item').forEach((el) => {
    el.onclick = () => {
      if (el.dataset.ok === 'true') navigateToRef(el.dataset.ref);
      else toast('מקור לא זמין לניווט בבבלי: ' + el.dataset.ref);
    };
  });
  box.classList.remove('hidden');
}

function showSearchResults(html) { const b = $('search-results'); b.innerHTML = html; b.classList.remove('hidden'); }
function hideSearchResults() { $('search-results').classList.add('hidden'); }

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

/* ── chavrusa: accounts + presence + native call ── */
function haveFB() { return typeof Auth !== 'undefined' && typeof window.GmaraFB !== 'undefined' && !!window.GmaraFB.app; }

function doSignIn() {
  if (!haveFB()) { toast('מנוע החברותא לא נטען (בדוק אינטרנט)'); return; }
  Auth.signIn().catch(() => Auth.signInAnonymously().catch(() => toast('כניסה נכשלה — ודא ש-Google/אנונימי מופעלים ב-Firebase')));
}

function renderAuth(user) {
  const box = $('chavrusa-auth');
  if (user) {
    box.innerHTML = `${user.photoURL ? `<img src="${user.photoURL}" referrerpolicy="no-referrer">` : ''}<span>${user.displayName || 'אורח'}</span><button id="signOutBtn">התנתק</button>`;
    box.querySelector('#signOutBtn').onclick = () => Auth.signOut();
    $('signInBtn').textContent = '👤 ' + (user.displayName ? user.displayName.split(' ')[0] : 'מחובר');
  } else {
    box.innerHTML = `<button id="btnGoogle">התחבר עם Google</button><button id="btnAnon">כניסה כאורח</button>`;
    box.querySelector('#btnGoogle').onclick = doSignIn;
    box.querySelector('#btnAnon').onclick = () => { if (haveFB()) Auth.signInAnonymously().catch(() => toast('כניסה נכשלה')); };
    $('signInBtn').textContent = '👤 התחבר';
    $('online-list').innerHTML = '<div class="muted">התחבר כדי לראות מי לומד ולפתוח חברותא.</div>';
  }
}

function renderOnline(list) {
  const box = $('online-list');
  const me = (typeof Auth !== 'undefined') ? Auth.uid : null;
  const others = (list || []).filter((x) => x.uid !== me);
  if (!others.length) { box.innerHTML = '<div class="muted">אין עדיין לומדים אחרים מחוברים.</div>'; return; }
  box.innerHTML = '';
  others.forEach((o) => {
    const row = document.createElement('div');
    row.className = 'online-row';
    const daf = o.currentMasechet ? `${o.currentMasechet} ${o.currentDaf || ''}` : 'ללא דף';
    row.innerHTML = `<span><span class="who">${o.displayName || 'אורח'}</span><br><span class="daf">${daf}</span></span>`;
    const b = document.createElement('button');
    b.textContent = '📹 התקשר';
    b.onclick = () => startCall(o.uid, o.displayName);
    row.appendChild(b);
    box.appendChild(row);
  });
}

async function startCall(uid, name) {
  if (!haveFB() || !Auth.uid) { toast('התחבר תחילה'); return; }
  openCallOverlay('מתקשר ל' + (name || 'חברותא') + '…');
  try {
    await Call.start(uid, $('localVideo'), $('remoteVideo'), { masechet: state.masechet.he, daf: state.daf });
  } catch (e) { toast('שיחה נכשלה: ' + (e.message || e)); closeCallOverlay(); }
}

function openCallOverlay(status) {
  $('call-status').textContent = status || '';
  $('call-overlay').classList.remove('hidden');
  $('chavrusa-panel').classList.add('hidden');
}
function closeCallOverlay() {
  $('call-overlay').classList.add('hidden');
  try { $('remoteVideo').srcObject = null; $('localVideo').srcObject = null; } catch (e) {}
  ['btn-mic', 'btn-cam'].forEach((id) => $(id).classList.remove('off'));
}

function toggleTrack(kind, btn) {
  const ms = $('localVideo').srcObject;
  if (!ms) return;
  ms.getTracks().filter((t) => t.kind === kind).forEach((t) => { t.enabled = !t.enabled; btn.classList.toggle('off', !t.enabled); });
}

function showIncoming(inv) {
  $('incoming-text').textContent = `${inv.fromName || 'חברותא'} מזמין אותך ללמוד${inv.masechet ? ' — ' + inv.masechet + ' ' + (inv.daf || '') : ''}`;
  $('incoming-call').classList.remove('hidden');
  $('incoming-accept').onclick = async () => {
    $('incoming-call').classList.add('hidden');
    openCallOverlay('מתחבר…');
    try { await Call.answer(inv.callId, $('localVideo'), $('remoteVideo')); }
    catch (e) { toast('מענה נכשל'); closeCallOverlay(); }
  };
  $('incoming-decline').onclick = () => { $('incoming-call').classList.add('hidden'); Call.decline(inv.callId); };
}

function initChavrusa() {
  $('callBtn').addEventListener('click', () => $('chavrusa-panel').classList.toggle('hidden'));
  $('chavrusa-close').addEventListener('click', () => $('chavrusa-panel').classList.add('hidden'));
  $('signInBtn').addEventListener('click', () => { $('chavrusa-panel').classList.remove('hidden'); if (!haveFB()) toast('מנוע החברותא לא נטען'); });
  $('jitsiFallback').addEventListener('click', () => { $('chavrusa-panel').classList.add('hidden'); openCall(); });
  $('btn-hangup').addEventListener('click', () => { if (typeof Call !== 'undefined') try { Call.hangup(); } catch (e) {} closeCallOverlay(); });
  $('btn-mic').addEventListener('click', () => toggleTrack('audio', $('btn-mic')));
  $('btn-cam').addEventListener('click', () => toggleTrack('video', $('btn-cam')));

  if (!haveFB()) { renderAuth(null); return; }
  Auth.onUser((user) => { renderAuth(user); if (user) Presence.setDaf(state.masechet.he, state.daf); });
  Presence.online(renderOnline);
  Call.listenForInvites(showIncoming);
  Call.onState((s) => {
    if (s === 'connected') $('call-status').textContent = 'מחובר ✓';
    else if (s === 'declined') { toast('השיחה נדחתה'); closeCallOverlay(); }
    else if (s === 'ended' || s === 'disconnected' || s === 'failed') closeCallOverlay();
  });
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

/* ── read-aloud (Hebrew TTS via edge-tts, browser fallback) ── */
const tts = { audio: null, on: false, voice: 'male' };

const RASHEI_TEVOT = [
  ['וכו׳', 'וְכוּלֵי'], ["וכו'", 'וְכוּלֵי'], ['כו׳', 'וְכוּלֵי'], ["כו'", 'וְכוּלֵי'], ['וכ׳', 'וְכוּלֵי'],
  ['וגו׳', 'וְגוֹמֵר'], ["וגו'", 'וְגוֹמֵר'],
  ['א״ר', 'אָמַר רַבִּי'], ['א"ר', 'אָמַר רַבִּי'], ['דא״ר', 'דְּאָמַר רַבִּי'], ['דא"ר', 'דְּאָמַר רַבִּי'],
  ['ת״ר', 'תָּנוּ רַבָּנָן'], ['ת"ר', 'תָּנוּ רַבָּנָן'],
  ['א״ל', 'אָמַר לֵיהּ'], ['א"ל', 'אָמַר לֵיהּ'],
  ['ה״ק', 'הָכִי קָאָמַר'], ['ה"ק', 'הָכִי קָאָמַר'],
  ['מ״ט', 'מַאי טַעְמָא'], ['מ"ט', 'מַאי טַעְמָא'],
  ['ד״ה', 'דִּבּוּר הַמַּתְחִיל'], ['ד"ה', 'דִּבּוּר הַמַּתְחִיל'],
  ['ע״ש', 'עַיֵּין שָׁם'], ['ע"ש', 'עַיֵּין שָׁם'], ['ע״כ', 'עַד כָּאן'], ['ע"כ', 'עַד כָּאן'],
  ['כ״ש', 'כָּל שֶׁכֵּן'], ['כ"ש', 'כָּל שֶׁכֵּן'], ['ה״נ', 'הָכִי נַמִי'], ['ה"נ', 'הָכִי נַמִי'],
  ['ש״מ', 'שְׁמַע מִינַּהּ'], ['ש"מ', 'שְׁמַע מִינַּהּ'], ['ק״ו', 'קַל וָחוֹמֶר'], ['ק"ו', 'קַל וָחוֹמֶר'],
  ['ל״ל', 'לְמָה לִי'], ['ל"ל', 'לְמָה לִי'], ['נ״מ', 'נַפְקָא מִינַּהּ'], ['נ"מ', 'נַפְקָא מִינַּהּ'],
  ['וא״ת', 'וְאִם תֹּאמַר'], ['וא"ת', 'וְאִם תֹּאמַר'], ['וי״ל', 'וְיֵשׁ לוֹמַר'], ['וי"ל', 'וְיֵשׁ לוֹמַר'],
  ['פ״ק', 'פֶּרֶק קַמָּא'], ['רמב״ם', 'רַמְבַּם'], ['רמב"ם', 'רַמְבַּם']
];
function expandAbbrev(t) {
  let s = ' ' + String(t || '') + ' ';
  for (const [a, b] of RASHEI_TEVOT) s = s.split(a).join(b);
  return s.trim();
}

function currentReadText() {
  const sel = window.getSelection ? String(window.getSelection()) : '';
  if (sel && sel.trim().length > 1) return sel.trim();
  const segs = state.view === 'daf' ? state.gemaraSegs : state.seferSegs;
  return flat(segs).map(stripHtml).join(' ');
}

function setSpeaking(on) {
  tts.on = on;
  const b = $('readBtn');
  if (b) { b.textContent = on ? '⏹ עצור' : '🔊 הקרא'; b.classList.toggle('reading', on); }
}
function setPreparing() {
  tts.on = true;
  const b = $('readBtn');
  if (b) { b.textContent = '⏳ מכין…'; b.classList.add('reading'); }
}

function stopSpeak() {
  if (tts.audio) { try { tts.audio.pause(); } catch (e) {} tts.audio = null; }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  setSpeaking(false);
}

async function speak(rawText) {
  const text = expandAbbrev((rawText || '').trim());
  if (!text) { toast('אין טקסט להקראה'); return; }
  stopSpeak();
  setPreparing();
  let uri = null;
  if (window.gmara && window.gmara.tts) {
    const r = await window.gmara.tts(text, tts.voice);
    if (r && r.ok) uri = r.uri;
  }
  if (uri) {
    tts.audio = new Audio(uri);
    tts.audio.onended = () => setSpeaking(false);
    tts.audio.onerror = () => { setSpeaking(false); toast('שגיאת השמעה'); };
    tts.audio.play().then(() => setSpeaking(true)).catch(() => { setSpeaking(false); toast('לא ניתן להשמיע'); });
  } else if (window.speechSynthesis) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'he-IL'; u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  } else {
    setSpeaking(false);
    toast('הקראה אינה זמינה כאן');
  }
}

function toggleRead() { if (tts.on) stopSpeak(); else speak(currentReadText()); }

let dafScale = 1;
function setDafScale(v) {
  dafScale = Math.max(0.7, Math.min(2.2, v));
  document.body.style.setProperty('--daf-scale', dafScale.toFixed(2));
  requestAnimationFrame(layoutTz);
}
function openReadDaf() {
  $('read-title').textContent = state.masechet.he + ' · ' + amudLabel(state.daf).full;
  const gem = state.gemaraSegs.map((s) => boldDH(s)).join(' ');
  $('read-body').innerHTML =
    `<div class="read-text read-gemara">${gem || '—'}</div>` +
    `<div class="read-sec">${$('rashi-title').textContent}</div><div class="read-text ktav-rashi">${$('rashi-body').innerHTML}</div>` +
    `<div class="read-sec">${$('tosafot-title').textContent}</div><div class="read-text ktav-rashi">${$('tosafot-body').innerHTML}</div>`;
  setReadFS(readFS);
  $('read-modal').classList.remove('hidden');
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
  $('backBtn').addEventListener('click', goBack);
  $('prev').addEventListener('click', () => step(-1));
  $('next').addEventListener('click', () => step(1));
  const searchEl = $('search');
  searchEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(searchEl.value); } });
  searchEl.addEventListener('focus', () => { if ($('search-results').innerHTML.trim()) $('search-results').classList.remove('hidden'); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search-wrap')) hideSearchResults(); });
  window.addEventListener('resize', () => requestAnimationFrame(layoutTz));

  $('fontBtn').addEventListener('click', toggleFont);
  $('themeBtn').addEventListener('click', cycleTheme);
  $('zoomIn').addEventListener('click', () => setDafScale(dafScale + 0.15));
  $('zoomOut').addEventListener('click', () => setDafScale(dafScale - 0.15));
  $('focusBtn').addEventListener('click', openReadDaf);
  $('readBtn').addEventListener('click', toggleRead);
  $('call-close').addEventListener('click', closeCall);
  $('join-btn').addEventListener('click', joinCall);
  $('fsBtn').addEventListener('click', () => toast('מסך מלא: F11'));
  initChavrusa();

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
