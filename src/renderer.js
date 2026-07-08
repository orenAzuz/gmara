const $ = (id) => document.getElementById(id);

const state = {
  masechet: MASECHTOT[0],
  daf: '2a',
  dapim: [],
  gemaraSegs: [],
  commentators: new Map(),
  jitsi: null
};

function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

function stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

function snippet(html, words = 6) {
  const clean = stripHtml(html).replace(/[־–-]/g, ' ');
  return clean.split(' ').filter(Boolean).slice(0, words).join(' ');
}

function segNumOf(ref) {
  const m = String(ref).match(/:(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/* ── build selects ─────────────────────────── */
function buildMasechetSelect() {
  const sel = $('masechet');
  sel.innerHTML = '';
  const seders = {};
  MASECHTOT.forEach((m, i) => {
    (seders[m.seder] = seders[m.seder] || []).push({ m, i });
  });
  for (const seder of Object.keys(seders)) {
    const og = document.createElement('optgroup');
    og.label = 'סדר ' + seder;
    for (const { m, i } of seders[seder]) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = m.he;
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
    o.value = d;
    o.textContent = `${lbl.daf} ${lbl.amud === 'א' ? '.' : ':'}`;
    sel.appendChild(o);
  }
  sel.value = state.daf;
}

/* ── load a daf ────────────────────────────── */
async function loadDaf() {
  const en = state.masechet.en;
  const daf = state.daf;
  $('loading').classList.remove('hidden');
  closeMefareshPanel();

  const lbl = amudLabel(daf);
  $('daf-title').textContent = `${state.masechet.he} · ${lbl.full}`;
  $('daf-mesorah').textContent = '';

  const gemaraRef = `${en} ${daf}`;
  const [gem, rashi, tos, linksRes] = await Promise.all([
    window.gmara.fetchText(gemaraRef),
    window.gmara.fetchText(`Rashi on ${en} ${daf}`),
    window.gmara.fetchText(`Tosafot on ${en} ${daf}`),
    window.gmara.fetchLinks(gemaraRef)
  ]);

  if (!gem.ok) {
    $('loading').classList.add('hidden');
    toast('לא הצלחתי לטעון את הדף (בדוק חיבור לאינטרנט)');
    $('gemara-body').innerHTML = `<div style="color:#7a1f1f">שגיאה: ${gem.error}</div>`;
    return;
  }

  renderGemara(gem.data);
  renderCommentaryColumn($('rashi-body'), rashi.ok ? rashi.data.he : []);
  renderCommentaryColumn($('tosafot-body'), tos.ok ? tos.data.he : []);
  buildMefareshDropdown(linksRes.ok ? linksRes.data : []);

  $('gemara-body').scrollTop = 0;
  $('loading').classList.add('hidden');
}

function renderGemara(data) {
  state.gemaraSegs = data.he || [];
  const body = $('gemara-body');
  body.innerHTML = '';
  state.gemaraSegs.forEach((seg, i) => {
    const span = document.createElement('span');
    span.className = 'seg seg-anchor';
    span.id = 'seg-' + (i + 1);
    span.innerHTML = ' ' + seg + ' ';
    span.title = 'סימן ' + (i + 1);
    body.appendChild(span);
  });
  if (!state.gemaraSegs.length) body.innerHTML = '<div style="color:#5a4326">אין טקסט לדף זה.</div>';
}

function flat(arr) {
  const out = [];
  const walk = (x) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x != null && String(x).trim()) out.push(String(x));
  };
  walk(arr);
  return out;
}

function renderCommentaryColumn(el, arr) {
  el.innerHTML = '';
  const items = flat(arr);
  if (!items.length) {
    el.innerHTML = '<div style="color:#8a7550;font-size:14px">— אין —</div>';
    return;
  }
  items.forEach((c) => {
    const d = document.createElement('div');
    d.className = 'comment';
    d.innerHTML = c;
    el.appendChild(d);
  });
}

/* ── mefarshim dropdown ────────────────────── */
function buildMefareshDropdown(links) {
  const map = new Map();
  for (const ln of links) {
    if (!ln) continue;
    if (ln.category !== 'Commentary') continue;
    const name = (ln.collectiveTitle && ln.collectiveTitle.he) || ln.index_title || '';
    if (!name) continue;
    if (/^רש"?י$|^תוספות$|Rashi|Tosafot/i.test(name)) continue;
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(ln);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (segNumOf(a.anchorRef) || 0) - (segNumOf(b.anchorRef) || 0));
  }
  state.commentators = map;

  const sel = $('mefaresh');
  sel.innerHTML = '';
  const head = document.createElement('option');
  head.value = '';
  head.textContent = map.size ? `— בחר מפרש (${map.size}) —` : '— אין מפרשים נוספים —';
  sel.appendChild(head);

  [...map.keys()].sort((a, b) => a.localeCompare(b, 'he')).forEach((name) => {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = `${name}  (${map.get(name).length})`;
    sel.appendChild(o);
  });
}

/* ── mefaresh panel ────────────────────────── */
function openMefaresh(name) {
  const list = state.commentators.get(name);
  if (!list) return;
  $('mefaresh-name').textContent = name;
  $('mefaresh-text').innerHTML = '<div style="color:#8a7550">בחר קטע מהרשימה כדי לקפוץ למקום שעליו דיבר המפרש.</div>';

  const box = $('mefaresh-list');
  box.innerHTML = '';
  list.forEach((ln, idx) => {
    const segN = segNumOf(ln.anchorRef);
    const gemHtml = segN && state.gemaraSegs[segN - 1] ? state.gemaraSegs[segN - 1] : '';
    const dh = snippet(gemHtml) || ('סימן ' + (segN || '?'));
    const item = document.createElement('div');
    item.className = 'item';
    item.innerHTML = `<span class="num">${idx + 1}.</span> ${dh} …`;
    item.onclick = () => selectComment(ln, segN, item);
    box.appendChild(item);
  });

  $('mefaresh-panel').classList.remove('hidden');
}

async function selectComment(ln, segN, itemEl) {
  document.querySelectorAll('#mefaresh-list .item').forEach((n) => (n.style.background = ''));
  if (itemEl) itemEl.style.background = '#fff3d6';
  flashSegment(segN);

  const target = $('mefaresh-text');
  target.innerHTML = '<div class="spinner" style="margin:20px auto"></div>';
  const res = await window.gmara.fetchText(ln.ref);
  if (!res.ok) { target.innerHTML = '<div style="color:#7a1f1f">שגיאה בטעינת המפרש.</div>'; return; }
  const parts = flat(res.data.he);
  target.innerHTML = (parts.length ? parts : ['(אין טקסט)']).map((p) => `<div class="comment">${p}</div>`).join('');
  target.scrollTop = 0;
}

function flashSegment(n) {
  if (!n) return;
  const el = $('seg-' + n);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1800);
}

function closeMefareshPanel() {
  $('mefaresh-panel').classList.add('hidden');
  const sel = $('mefaresh');
  if (sel) sel.value = '';
}

/* ── navigation ────────────────────────────── */
function stepDaf(dir) {
  const i = state.dapim.indexOf(state.daf);
  const j = i + dir;
  if (j < 0 || j >= state.dapim.length) { toast('סוף המסכת'); return; }
  state.daf = state.dapim[j];
  $('daf').value = state.daf;
  loadDaf();
}

/* ── Jitsi video ───────────────────────────── */
function roomName() {
  return `Gmara-${state.masechet.en}-${state.daf}`.replace(/[^a-zA-Z0-9-]/g, '');
}

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
      roomName: room,
      parentNode: $('jitsi-container'),
      width: '100%',
      height: '100%',
      configOverwrite: { startWithAudioMuted: false, prejoinPageEnabled: false },
      interfaceConfigOverwrite: { DEFAULT_BACKGROUND: '#2a1c0c' },
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

/* ── wire up ───────────────────────────────── */
function init() {
  buildMasechetSelect();
  buildDafSelect();

  $('masechet').addEventListener('change', (e) => {
    state.masechet = MASECHTOT[parseInt(e.target.value, 10)];
    state.daf = '2a';
    buildDafSelect();
    loadDaf();
  });
  $('daf').addEventListener('change', (e) => { state.daf = e.target.value; loadDaf(); });
  $('prev').addEventListener('click', () => stepDaf(-1));
  $('next').addEventListener('click', () => stepDaf(1));
  $('mefaresh').addEventListener('change', (e) => { if (e.target.value) openMefaresh(e.target.value); });
  $('mefaresh-close').addEventListener('click', closeMefareshPanel);

  $('callBtn').addEventListener('click', openCall);
  $('call-close').addEventListener('click', closeCall);
  $('join-btn').addEventListener('click', joinCall);
  $('fsBtn').addEventListener('click', () => toast('מסך מלא: F11'));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeMefareshPanel(); }
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') stepDaf(-1);
    if (e.key === 'ArrowLeft') stepDaf(1);
  });

  loadDaf();
}

window.addEventListener('DOMContentLoaded', init);
