(function () {
  const fb = window.GmaraFB;
  if (!fb) {
    console.error('[gmara] Presence: GmaraFB missing — load firebase-config.js first');
    return;
  }

  const db = fb.db;
  const HEARTBEAT_INTERVAL_MS = 15000;
  const HEARTBEAT_STALE_MS = 35000;

  let uid = null;
  let displayName = '';
  let currentMasechet = null;
  let currentDaf = null;

  let heartbeatId = null;
  let staleTickId = null;
  let snapUnsub = null;
  let boundUnload = null;

  const subscribers = [];
  let liveList = [];

  function myDoc() {
    return uid ? db.collection('presence').doc(uid) : null;
  }

  function heartbeat() {
    const ref = myDoc();
    if (!ref) return;
    ref.set({
      displayName: displayName,
      online: true,
      currentMasechet: currentMasechet,
      currentDaf: currentDaf,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(function (e) {
      console.warn('[gmara] Presence heartbeat failed', e);
    });
  }

  function emit() {
    subscribers.forEach(function (cb) {
      try { cb(liveList.slice()); } catch (e) { /* ignore */ }
    });
  }

  function pruneStale() {
    const now = Date.now();
    const fresh = liveList.filter(function (e) { return now - e.lastSeenMs <= HEARTBEAT_STALE_MS; });
    if (fresh.length !== liveList.length) { liveList = fresh; emit(); }
  }

  function startListener() {
    if (snapUnsub) return;
    snapUnsub = db.collection('presence').onSnapshot(function (snap) {
      const now = Date.now();
      const entries = [];
      snap.forEach(function (d) {
        const data = d.data() || {};
        const ms = data.lastSeen && data.lastSeen.toMillis ? data.lastSeen.toMillis() : 0;
        if (data.online === false) return;
        if (ms && now - ms > HEARTBEAT_STALE_MS) return;
        entries.push({
          uid: d.id,
          displayName: data.displayName || 'לומד',
          currentMasechet: data.currentMasechet || null,
          currentDaf: data.currentDaf || null,
          lastSeenMs: ms
        });
      });
      liveList = entries;
      emit();
    }, function (err) {
      console.warn('[gmara] Presence snapshot error', err);
    });
  }

  function leaveSync() {
    const ref = myDoc();
    if (ref) {
      ref.set({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(function () {});
    }
  }

  const Presence = {
    start: function (user) {
      if (!user || !user.uid) return;
      if (uid === user.uid) { displayName = user.displayName || displayName; return; }
      this.stop();
      uid = user.uid;
      displayName = user.displayName || 'לומד';

      heartbeat();
      heartbeatId = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
      staleTickId = setInterval(pruneStale, 5000);
      startListener();

      boundUnload = function () { leaveSync(); };
      window.addEventListener('beforeunload', boundUnload);
    },

    setDaf: function (masechet, daf) {
      currentMasechet = masechet != null ? masechet : null;
      currentDaf = daf != null ? daf : null;
      heartbeat();
    },

    online: function (cb) {
      subscribers.push(cb);
      try { cb(liveList.slice()); } catch (e) { /* ignore */ }
      return function () {
        const i = subscribers.indexOf(cb);
        if (i >= 0) subscribers.splice(i, 1);
      };
    },

    onDaf: function (masechet, daf, cb) {
      return this.online(function (list) {
        cb(list.filter(function (e) {
          return e.currentMasechet === masechet && String(e.currentDaf) === String(daf);
        }));
      });
    },

    get list() { return liveList.slice(); },

    stop: function () {
      if (heartbeatId) { clearInterval(heartbeatId); heartbeatId = null; }
      if (staleTickId) { clearInterval(staleTickId); staleTickId = null; }
      if (snapUnsub) { snapUnsub(); snapUnsub = null; }
      if (boundUnload) { window.removeEventListener('beforeunload', boundUnload); boundUnload = null; }
      const ref = myDoc();
      uid = null;
      liveList = [];
      emit();
      if (ref) {
        ref.set({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(function () {});
      }
    }
  };

  if (window.Auth && typeof window.Auth.onUser === 'function') {
    window.Auth.onUser(function (user) {
      if (user) Presence.start(user);
      else Presence.stop();
    });
  }

  window.Presence = Presence;
})();
