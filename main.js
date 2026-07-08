const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

const EDGE_TTS = ['/home/orez/Music/speek/.venv/bin/edge-tts', 'edge-tts'];

function speakToDataUri(text, voice) {
  return new Promise((resolve) => {
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 6000);
    if (!clean) return resolve({ ok: false, error: 'empty' });
    const out = path.join(os.tmpdir(), 'gmara-tts-' + Date.now() + '.mp3');
    const v = voice === 'female' ? 'he-IL-HilaNeural' : 'he-IL-AvriNeural';
    const tryBin = (i) => {
      if (i >= EDGE_TTS.length) return resolve({ ok: false, error: 'edge-tts-missing' });
      execFile(EDGE_TTS[i], ['--voice', v, '--rate', '-12%', '--text', clean, '--write-media', out], { timeout: 60000 }, (err) => {
        if (err) return tryBin(i + 1);
        try {
          const b64 = fs.readFileSync(out).toString('base64');
          fs.unlink(out, () => {});
          resolve({ ok: true, uri: 'data:audio/mp3;base64,' + b64 });
        } catch (e) { resolve({ ok: false, error: String(e.message || e) }); }
      });
    };
    tryBin(0);
  });
}

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

const SEFARIA = 'https://www.sefaria.org/api';

function toUrlRef(ref) {
  return encodeURIComponent(ref.trim().replace(/ /g, '_')).replace(/%2F/g, '/');
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  return res.json();
}

async function fetchText(ref) {
  const url = `${SEFARIA}/texts/${toUrlRef(ref)}?context=0&pad=0&commentary=0&wrapLinks=0`;
  const data = await getJson(url);
  return {
    ref: data.ref || ref,
    heRef: data.heRef || '',
    he: Array.isArray(data.he) ? data.he : (data.he ? [data.he] : []),
    text: Array.isArray(data.text) ? data.text : (data.text ? [data.text] : []),
    next: data.next || null,
    prev: data.prev || null
  };
}

async function fetchLinks(ref) {
  const url = `${SEFARIA}/links/${toUrlRef(ref)}?with_text=0`;
  const data = await getJson(url);
  return Array.isArray(data) ? data : [];
}

function loadApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const paths = [
    path.join(__dirname, '.env'),
    '/home/orez/Music/SoundMchine/.env'
  ];
  for (const p of paths) {
    try {
      const m = fs.readFileSync(p, 'utf8').match(/^ANTHROPIC_API_KEY=(.+)$/m);
      if (m && m[1].trim().startsWith('sk-')) return m[1].trim();
    } catch (e) {}
  }
  return null;
}

async function findRefs(question) {
  const key = loadApiKey();
  if (!key) return { ok: false, error: 'no-api-key' };
  const system =
    'You locate sources in the Babylonian Talmud (Talmud Bavli). Given a question or topic in Hebrew or English, ' +
    'respond with ONLY valid JSON, no prose: {"results":[{"ref":"Ketubot 62b","he":"כתובות סב ע״ב","why":"one short Hebrew sentence"}]}. ' +
    'Up to 5 most relevant Talmud Bavli locations, most relevant first, using Sefaria English ref format (e.g. "Bava Metzia 59b"). ' +
    'Only Talmud Bavli. If nothing fits, {"results":[]}.';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        system,
        messages: [{ role: 'user', content: question }]
      })
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const data = await res.json();
    let txt = (data.content && data.content[0] && data.content[0].text || '').trim();
    txt = txt.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(txt);
    return { ok: true, results: Array.isArray(parsed.results) ? parsed.results : [] };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: '#e9edf4',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.once('ready-to-show', () => {
    win.show();
    win.setFullScreen(true);
    win.focus();
    win.moveTop();
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  win.webContents.on('console-message', (_e, level, message) => {
    console.log('[renderer]', message);
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.log('[did-fail-load]', code, desc);
  });

  globalShortcut.register('F11', () => win.setFullScreen(!win.isFullScreen()));
  globalShortcut.register('CommandOrControl+Q', () => app.quit());

  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });
  return win;
}

ipcMain.handle('sefaria:text', async (_e, ref) => {
  try { return { ok: true, data: await fetchText(ref) }; }
  catch (err) { return { ok: false, error: String(err.message || err) }; }
});

ipcMain.handle('sefaria:links', async (_e, ref) => {
  try { return { ok: true, data: await fetchLinks(ref) }; }
  catch (err) { return { ok: false, error: String(err.message || err) }; }
});

ipcMain.handle('ai:findRefs', async (_e, question) => findRefs(question));
ipcMain.handle('tts:speak', async (_e, text, voice) => speakToDataUri(text, voice));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
