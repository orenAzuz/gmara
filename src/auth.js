(function () {
  const fb = window.GmaraFB;
  if (!fb) {
    console.error('[gmara] Auth: GmaraFB missing — load firebase-config.js first');
    return;
  }

  const auth = fb.auth;
  const db = fb.db;
  const listeners = [];
  let currentUser = null;

  function toProfile(u) {
    if (!u) return null;
    return {
      uid: u.uid,
      displayName: u.displayName || (u.isAnonymous ? 'אורח' : (u.email ? u.email.split('@')[0] : 'לומד')),
      email: u.email || '',
      photoURL: u.photoURL || '',
      isAnonymous: !!u.isAnonymous
    };
  }

  function upsertProfile(profile) {
    if (!profile) return Promise.resolve();
    return db.collection('users').doc(profile.uid).set({
      displayName: profile.displayName,
      email: profile.email,
      photoURL: profile.photoURL,
      isAnonymous: profile.isAnonymous,
      lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(function (e) {
      console.warn('[gmara] Auth: profile upsert failed', e);
    });
  }

  auth.onAuthStateChanged(function (u) {
    currentUser = toProfile(u);
    if (currentUser) upsertProfile(currentUser);
    listeners.forEach(function (cb) {
      try { cb(currentUser); } catch (e) { console.warn('[gmara] Auth listener error', e); }
    });
  });

  const Auth = {
    signIn: function () {
      const provider = new firebase.auth.GoogleAuthProvider();
      return auth.signInWithPopup(provider).then(function (res) {
        return toProfile(res.user);
      });
    },

    signInAnonymously: function () {
      return auth.signInAnonymously().then(function (res) {
        return toProfile(res.user);
      });
    },

    signOut: function () {
      return auth.signOut();
    },

    onUser: function (cb) {
      listeners.push(cb);
      if (currentUser !== undefined) {
        try { cb(currentUser); } catch (e) { /* ignore */ }
      }
      return function () {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    },

    get user() { return currentUser; },
    get uid() { return currentUser ? currentUser.uid : null; }
  };

  window.Auth = Auth;
})();
