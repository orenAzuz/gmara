# Chavrusa backend — integration guide

User accounts + presence + "invite your chavrusa" + native WebRTC video, on top of
the existing Firebase project **dawjam-126b1**. All new code lives under `src/` as
plain `<script>` files (no bundler), exposing globals `Auth`, `Presence`, `Call`.

## Files added
| File | Global | Purpose |
|------|--------|---------|
| `src/firebase-config.js` | `window.GmaraFB` `{app, auth, db, config}` | Real dawjam-126b1 web config + `initializeApp`. |
| `src/auth.js` | `window.Auth` | Google sign-in + anonymous fallback. |
| `src/presence.js` | `window.Presence` | Per-user `presence/{uid}` doc + live online list. |
| `src/call.js` | `window.Call` | Firestore-signalled native WebRTC video, Cloudflare-TURN aware. |
| `src/gmara.firestore.rules` | — | Least-privilege rules for `presence/*`, `calls/*`, `users/*`. Do NOT auto-deploy. |

The Firebase web config is **real** — pulled from
`/home/orez/Music/SoundMchine/clientDaw/src/environments/environment.ts`
(apiKey `AIzaSy...9fZpY`, projectId `dawjam-126b1`, appId `1:113610711072:web:c5b0416936b5f9dd72dc45`).
These values are client-safe (they gate on Firestore rules + enabled auth providers, not on the apiKey).

## Firebase SDK — compat CDN
This app has no bundler, so we use the **compat** builds which expose a single global
`firebase`. Add these to `index.html` **before** the new scripts (order matters):

```html
<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js"></script>

<script src="firebase-config.js"></script>
<script src="auth.js"></script>
<script src="presence.js"></script>
<script src="call.js"></script>
```

Put them right before the existing `<script src="renderer.js"></script>` line (which is
the last script). `presence.js` auto-subscribes to `Auth.onUser`, so presence starts/stops
automatically with sign-in/out. In Electron the compat CDN loads fine over https; if you
ever run fully offline, vendor the three files into `assets/` and point the src at them.

## renderer.js wiring (the file is owned by another process — these are the calls to add)

### 1. Sign-in
Add a sign-in button to the header (e.g. next to `#callBtn`) and:
```js
document.getElementById('signInBtn').addEventListener('click', () => {
  Auth.signIn().catch(() => Auth.signInAnonymously());
});
Auth.onUser(user => {
  // update UI: show user.displayName / photoURL, or a "sign in" prompt when null
});
```

### 2. Publish which daf you're on
Wherever the daf/masechet actually changes (the existing render function that reads
`#masechet` and `#daf`), append:
```js
Presence.setDaf(currentMasechet, currentDaf);
```
`Presence.start()` is already called for you on sign-in; `setDaf` just updates the doc.

### 3. Presence list UI ("who's learning")
```js
Presence.online(list => {
  // list: [{uid, displayName, currentMasechet, currentDaf, lastSeenMs}, ...]
  // render each; add a 📹 button per row that calls startCall(entry.uid)
});
// or only people on the same daf as you:
Presence.onDaf(currentMasechet, currentDaf, sameDafList => { ... });
```
Filter out your own `Auth.uid` when rendering.

### 4. Start / receive a call (native WebRTC)
You need two `<video>` elements (local + remote). The existing `#call-modal` /
`#jitsi-container` can host them, or add a small pair. Then:
```js
async function startCall(targetUid) {
  const local = document.getElementById('localVideo');
  const remote = document.getElementById('remoteVideo');
  await Call.start(targetUid, local, remote, { masechet: currentMasechet, daf: currentDaf });
}

// incoming invites (call once, after sign-in):
Call.listenForInvites(inv => {
  // inv: {callId, from, fromName, masechet, daf}
  if (confirm(`${inv.fromName} מזמין אותך ללמוד — לענות?`)) {
    Call.answer(inv.callId,
      document.getElementById('localVideo'),
      document.getElementById('remoteVideo'));
  } else {
    Call.decline(inv.callId);
  }
});

Call.onState(s => { /* 'ringing' | 'connected' | 'declined' | 'ended' | RTC states */ });

// hang up button:
document.getElementById('hangupBtn').addEventListener('click', () => Call.hangup());
```
`Call.invite(...)` is an alias for `Call.start(...)`. The existing Jitsi room flow can stay
as a fallback; the native path is fully independent.

## TURN (cellular / cross-NAT calls)
`Call` uses public Google STUN by default (works on same Wi-Fi / friendly NATs). For calls
that must traverse cellular / symmetric NATs you need TURN. Three ways to plug it in — set
one before the first call (e.g. in renderer bootstrap):

```js
// A) via a server endpoint that returns { iceServers: [...] } (recommended — keeps the
//    Cloudflare API token server-side). E.g. the speek server's /rtc-ice, or a tiny
//    Firebase Function that mints creds.
Call.TurnConfig.endpoint = 'https://<your-host>/rtc-ice';

// B) direct Cloudflare mint (client-side — exposes the API token in the browser; test only)
Call.TurnConfig.cloudflare = { keyId: '<CF_TURN_KEY_ID>', apiToken: '<CF_TURN_API_TOKEN>', ttl: 86400 };

// C) static coturn / Metered creds
Call.TurnConfig.static = { urls: 'turn:host:3478', username: 'u', credential: 'p' };
```
Cloudflare creds were **not** present on this machine (`/home/orez/Music/speek/.speek-turn.json`
does not exist), so nothing is hard-coded. The mint endpoint/format matches the speek project:
`POST https://rtc.live.cloudflare.com/v1/turn/keys/{keyId}/credentials/generate`,
`Authorization: Bearer <token>`, body `{ttl}`, response `{iceServers:{urls,username,credential}}`.
Get the two values from Cloudflare dashboard → Realtime → TURN Keys → Create TURN Key.

## Firestore data model
- `users/{uid}` — `{displayName, email, photoURL, isAnonymous, lastLogin}`.
- `presence/{uid}` — `{displayName, online, currentMasechet, currentDaf, lastSeen}`; 15s heartbeat,
  entries older than 35s treated as offline; `online:false` written on sign-out / tab close.
- `calls/{callId}` — `{from, fromName, to, status, masechet, daf, offer, answer, createdAt}` with
  subcollections `callerCandidates/*` and `calleeCandidates/*` (standard Firebase-WebRTC pattern).
  `status`: `ringing` → `connected` → `ended`, or `declined`.

## Remaining manual setup (user must do, once)
1. **Firebase console → dawjam-126b1 → Authentication → Sign-in method:** enable **Google**
   and **Anonymous**.
2. **Authorized domains:** add wherever Gmara is served (e.g. `localhost`, and the hosting
   domain). For Electron, Google popup sign-in works because it opens the real authDomain;
   if the popup is blocked in Electron, switch `auth.js` to `signInWithRedirect` or open the
   OAuth flow in the system browser.
3. **Register a Web App** in the project if `web:c5b0...72dc45` ever changes — the current
   appId is reused from DawJam and is valid for the same project.
4. **Deploy the Firestore rules.** The rules in `src/gmara.firestore.rules` are a *standalone*
   ruleset covering only the new collections. dawjam-126b1 already has a large
   `firestore.rules` in SoundMchine — do NOT overwrite it. Instead **merge** the
   `presence/*`, `calls/*` (and the relaxed `users/{uid}` read) match blocks into that file,
   then `firebase deploy --only firestore:rules` from the SoundMchine repo. (Not done here —
   no deploys were performed.)
5. **(Optional) TURN:** run `/home/orez/Music/speek/setup-turn.sh <keyId> <token>` to create
   Cloudflare creds, then wire `Call.TurnConfig` per the TURN section above (endpoint form
   preferred so the token stays server-side).

## Notes / caveats
- `users/{uid}` read is `isAuthed()` (any signed-in user) so presence rows can show display
  names. Tighten to `isOwner` if you only ever read your own profile.
- The `calls` listener query (`where to == me && status == ringing`) needs no composite index
  (single equality on two fields is auto-indexed by Firestore).
- No code comments were added (per house style); all explanation lives here.
- No files under `SoundMchine/` or `speek/` were modified, and nothing was deployed.
