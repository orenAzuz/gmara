const SEFARIA = 'https://www.sefaria.org/api';

function toUrlRef(ref) {
  return encodeURIComponent(String(ref).trim().replace(/ /g, '_')).replace(/%2F/g, '/');
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function asArray(x) {
  return Array.isArray(x) ? x : (x != null && x !== '' ? [x] : []);
}

const Api = {
  async fetchText(ref) {
    try {
      const url = `${SEFARIA}/texts/${toUrlRef(ref)}?context=0&pad=0&commentary=0&wrapLinks=0`;
      const d = await getJson(url);
      return {
        ok: true,
        data: {
          ref: d.ref || ref,
          heRef: d.heRef || '',
          he: asArray(d.he),
          text: asArray(d.text),
          next: d.next || null,
          prev: d.prev || null
        }
      };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  },

  async fetchLinks(ref, withText = true) {
    try {
      const url = `${SEFARIA}/links/${toUrlRef(ref)}?with_text=${withText ? 1 : 0}`;
      const d = await getJson(url);
      return { ok: true, data: Array.isArray(d) ? d : [] };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }
};
