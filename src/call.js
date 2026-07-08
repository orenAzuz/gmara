(function () {
  const fb = window.GmaraFB;
  if (!fb) {
    console.error('[gmara] Call: GmaraFB missing — load firebase-config.js first');
    return;
  }

  const db = fb.db;

  const TurnConfig = {
    endpoint: null,
    cloudflare: null,
    static: null
  };

  const STUN = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  const iceCache = { servers: null, exp: 0 };

  async function getIceServers() {
    const now = Date.now();
    if (iceCache.servers && now < iceCache.exp) return iceCache.servers;

    let servers = STUN.slice();

    try {
      if (TurnConfig.endpoint) {
        const res = await fetch(TurnConfig.endpoint, { headers: { Accept: 'application/json' } });
        if (res.ok) {
          const data = await res.json();
          const ice = data.iceServers;
          if (Array.isArray(ice)) servers = servers.concat(ice);
          else if (ice) servers.push(ice);
        }
      } else if (TurnConfig.cloudflare && TurnConfig.cloudflare.keyId && TurnConfig.cloudflare.apiToken) {
        const ttl = TurnConfig.cloudflare.ttl || 86400;
        const url = 'https://rtc.live.cloudflare.com/v1/turn/keys/' + TurnConfig.cloudflare.keyId + '/credentials/generate';
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + TurnConfig.cloudflare.apiToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ttl: ttl })
        });
        if (res.ok) {
          const data = await res.json();
          const ice = data.iceServers;
          if (Array.isArray(ice)) servers = servers.concat(ice);
          else if (ice) servers.push(ice);
          iceCache.exp = now + Math.max(60, ttl - 300) * 1000;
        }
      } else if (TurnConfig.static && TurnConfig.static.urls) {
        servers.push({
          urls: TurnConfig.static.urls,
          username: TurnConfig.static.username || '',
          credential: TurnConfig.static.credential || ''
        });
      }
    } catch (e) {
      console.warn('[gmara] Call: TURN fetch failed, falling back to STUN', e);
    }

    iceCache.servers = servers;
    if (!iceCache.exp) iceCache.exp = now + 60 * 1000;
    return servers;
  }

  let pc = null;
  let localStream = null;
  let activeCallId = null;
  let candidateUnsub = null;
  let statusUnsub = null;
  let localVideoElRef = null;
  let remoteVideoElRef = null;
  let onStateChange = null;

  function setStatus(s) {
    if (typeof onStateChange === 'function') {
      try { onStateChange(s); } catch (e) { /* ignore */ }
    }
  }

  async function getMedia(localVideoEl) {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (localVideoEl) {
      localVideoEl.srcObject = localStream;
      localVideoEl.muted = true;
      const p = localVideoEl.play();
      if (p && p.catch) p.catch(function () {});
    }
    return localStream;
  }

  async function buildPeer(remoteVideoEl) {
    const iceServers = await getIceServers();
    const conn = new RTCPeerConnection({ iceServers: iceServers });

    if (localStream) {
      localStream.getTracks().forEach(function (t) { conn.addTrack(t, localStream); });
    }

    const remoteStream = new MediaStream();
    if (remoteVideoEl) remoteVideoEl.srcObject = remoteStream;

    conn.ontrack = function (event) {
      (event.streams[0] ? event.streams[0].getTracks() : [event.track]).forEach(function (t) {
        remoteStream.addTrack(t);
      });
      if (remoteVideoEl) {
        const p = remoteVideoEl.play();
        if (p && p.catch) p.catch(function () {});
      }
    };

    conn.onconnectionstatechange = function () {
      setStatus(conn.connectionState);
      if (conn.connectionState === 'failed' || conn.connectionState === 'disconnected') {
        console.warn('[gmara] Call: connection', conn.connectionState);
      }
    };

    return conn;
  }

  function myUid() {
    return window.Auth && window.Auth.uid ? window.Auth.uid : null;
  }

  function myName() {
    return window.Auth && window.Auth.user ? window.Auth.user.displayName : 'לומד';
  }

  const Call = {
    TurnConfig: TurnConfig,

    onState: function (cb) { onStateChange = cb; },

    invite: function (targetUid, localVideoEl, remoteVideoEl, meta) {
      return this.start(targetUid, localVideoEl, remoteVideoEl, meta);
    },

    start: async function (targetUid, localVideoEl, remoteVideoEl, meta) {
      const from = myUid();
      if (!from) throw new Error('not signed in');
      await this.hangup();

      localVideoElRef = localVideoEl;
      remoteVideoElRef = remoteVideoEl;

      await getMedia(localVideoEl);
      pc = await buildPeer(remoteVideoEl);

      const callRef = db.collection('calls').doc();
      activeCallId = callRef.id;
      const callerCandidates = callRef.collection('callerCandidates');
      const calleeCandidates = callRef.collection('calleeCandidates');

      pc.onicecandidate = function (event) {
        if (event.candidate) callerCandidates.add(event.candidate.toJSON());
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await callRef.set({
        from: from,
        fromName: myName(),
        to: targetUid,
        status: 'ringing',
        masechet: meta && meta.masechet != null ? meta.masechet : null,
        daf: meta && meta.daf != null ? meta.daf : null,
        offer: { type: offer.type, sdp: offer.sdp },
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      setStatus('ringing');

      statusUnsub = callRef.onSnapshot(function (snap) {
        const data = snap.data();
        if (!data) return;
        if (data.answer && pc && !pc.currentRemoteDescription) {
          pc.setRemoteDescription(new RTCSessionDescription(data.answer)).catch(function (e) {
            console.warn('[gmara] Call: setRemoteDescription(answer) failed', e);
          });
        }
        if (data.status === 'declined') { setStatus('declined'); Call.hangup(); }
        if (data.status === 'ended') { setStatus('ended'); Call.hangup(); }
      });

      candidateUnsub = calleeCandidates.onSnapshot(function (snap) {
        snap.docChanges().forEach(function (change) {
          if (change.type === 'added' && pc) {
            pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(function () {});
          }
        });
      });

      return activeCallId;
    },

    answer: async function (callId, localVideoEl, remoteVideoEl) {
      const me = myUid();
      if (!me) throw new Error('not signed in');
      await this.hangup();

      localVideoElRef = localVideoEl;
      remoteVideoElRef = remoteVideoEl;

      const callRef = db.collection('calls').doc(callId);
      const snap = await callRef.get();
      const data = snap.data();
      if (!data || !data.offer) throw new Error('call not found or has no offer');

      activeCallId = callId;
      const callerCandidates = callRef.collection('callerCandidates');
      const calleeCandidates = callRef.collection('calleeCandidates');

      await getMedia(localVideoEl);
      pc = await buildPeer(remoteVideoEl);

      pc.onicecandidate = function (event) {
        if (event.candidate) calleeCandidates.add(event.candidate.toJSON());
      };

      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await callRef.update({
        status: 'connected',
        answer: { type: answer.type, sdp: answer.sdp }
      });

      setStatus('connected');

      candidateUnsub = callerCandidates.onSnapshot(function (s) {
        s.docChanges().forEach(function (change) {
          if (change.type === 'added' && pc) {
            pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(function () {});
          }
        });
      });

      statusUnsub = callRef.onSnapshot(function (s) {
        const d = s.data();
        if (d && d.status === 'ended') { setStatus('ended'); Call.hangup(); }
      });

      return activeCallId;
    },

    decline: function (callId) {
      return db.collection('calls').doc(callId).update({ status: 'declined' }).catch(function () {});
    },

    listenForInvites: function (cb) {
      const me = myUid();
      if (!me) { console.warn('[gmara] Call.listenForInvites: not signed in'); return function () {}; }
      return db.collection('calls')
        .where('to', '==', me)
        .where('status', '==', 'ringing')
        .onSnapshot(function (snap) {
          snap.docChanges().forEach(function (change) {
            if (change.type === 'added') {
              const d = change.doc.data();
              cb({
                callId: change.doc.id,
                from: d.from,
                fromName: d.fromName || 'לומד',
                masechet: d.masechet || null,
                daf: d.daf || null
              });
            }
          });
        }, function (err) {
          console.warn('[gmara] Call.listenForInvites error', err);
        });
    },

    hangup: async function () {
      if (candidateUnsub) { candidateUnsub(); candidateUnsub = null; }
      if (statusUnsub) { statusUnsub(); statusUnsub = null; }

      if (pc) { try { pc.close(); } catch (e) { /* ignore */ } pc = null; }
      if (localStream) { localStream.getTracks().forEach(function (t) { t.stop(); }); localStream = null; }

      if (localVideoElRef) { localVideoElRef.srcObject = null; localVideoElRef = null; }
      if (remoteVideoElRef) { remoteVideoElRef.srcObject = null; remoteVideoElRef = null; }

      const id = activeCallId;
      activeCallId = null;
      if (id) {
        try { await db.collection('calls').doc(id).update({ status: 'ended' }); } catch (e) { /* ignore */ }
      }
    },

    get currentCallId() { return activeCallId; }
  };

  window.Call = Call;
})();
