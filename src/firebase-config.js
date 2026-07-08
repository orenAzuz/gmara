(function () {
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyCR2K96OWGgrCCawigya9NHQmCvu-9fZpY',
    authDomain: 'dawjam-126b1.firebaseapp.com',
    projectId: 'dawjam-126b1',
    storageBucket: 'dawjam-126b1.firebasestorage.app',
    messagingSenderId: '113610711072',
    appId: '1:113610711072:web:c5b0416936b5f9dd72dc45',
    measurementId: 'G-T4RBPQY9P2'
  };

  if (typeof firebase === 'undefined') {
    console.error('[gmara] firebase compat SDK not loaded — add the gstatic <script> tags before firebase-config.js');
    return;
  }

  const app = firebase.apps && firebase.apps.length
    ? firebase.app()
    : firebase.initializeApp(FIREBASE_CONFIG);

  window.GmaraFB = {
    config: FIREBASE_CONFIG,
    app: app,
    auth: firebase.auth(),
    db: firebase.firestore()
  };
})();
