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
  },

  async resolveRef(q) {
    try {
      const d = await getJson(`${SEFARIA}/name/${encodeURIComponent(q.trim())}`);
      return { ok: true, isRef: !!d.is_ref, ref: d.ref || null, completions: d.completions || [] };
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  },

  async searchTalmud(q) {
    try {
      const res = await fetch(`${SEFARIA}/search-wrapper`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, type: 'text', size: 8 })
      });
      const d = await res.json();
      const hits = (d.hits && d.hits.hits) || [];
      const refs = hits.map((h) => (h._id || '').replace(/ \([^)]*\)\s*$/, '')).filter(Boolean);
      return { ok: true, refs };
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  },

  async findRefs(q) {
    if (typeof window !== 'undefined' && window.gmara && window.gmara.findRefs) {
      return window.gmara.findRefs(q);
    }
    return { ok: false, error: 'ai-unavailable' };
  }
};
