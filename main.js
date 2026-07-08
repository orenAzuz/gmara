const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');

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

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#f4ecd8',
    fullscreen: true,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));

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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
