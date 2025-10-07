// カメラ/QR/位置情報を Vanilla JS で実装。QR検出時に即座に現在地を1回取得。

// DOM
const startBtn = document.getElementById('startCam');
const stopBtn  = document.getElementById('stopCam');
const statusEl = document.getElementById('camStatus');
const videoEl  = document.getElementById('preview');
const overlay  = document.getElementById('qrOverlay');
const startQR  = document.getElementById('startQR');
const stopQR   = document.getElementById('stopQR');
const qrResultEl = document.getElementById('qrResult');

// 位置情報DOM
const gStatus = document.getElementById('geo-status');
const gReq = document.getElementById('geo-request');
const gWatch = document.getElementById('geo-watch');
const gStop = document.getElementById('geo-stop');
const latEl = document.getElementById('lat');
const lngEl = document.getElementById('lng');
const accEl = document.getElementById('acc');
const tsEl  = document.getElementById('ts');
const postForm = document.getElementById('postForm');
const postStatus = document.getElementById('post-status');
const postTypeEl = document.getElementById('post-type');
const postTitleEl = document.getElementById('post-title');
const postDescEl = document.getElementById('post-desc');
const postMediaEl = document.getElementById('post-media');
const btnLoadPosts = document.getElementById('btn-load-posts');
const loadStatus = document.getElementById('load-status');
const postsList = document.getElementById('posts-list');

// 選択ダイアログ
const dlg = document.getElementById('qrChoice');
const btnPost = document.getElementById('choice-post');
const btnView = document.getElementById('choice-view');
const btnClose = document.getElementById('choice-close');

// 状態
let stream = null;
let scanning = false;
let qrRAF = null;
let scanCaptured = false;
let lastQR = null;
let lastLat = null;
let lastLng = null;
let savedScanThisSession = false;
let lastSavedScanId = null;

// 追加: ユーティリティと位置情報ハンドラ
let watchId = null;
const setStatus = (s) => { if (statusEl) statusEl.textContent = s; };
const setG = (s) => { if (gStatus) gStatus.textContent = s; };
const geoOpts = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
const isLocalhost = () => ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
function onGeo(pos) {
  const { latitude, longitude, accuracy } = pos.coords;
  if (latEl) latEl.textContent = latitude.toFixed(6);
  if (lngEl) lngEl.textContent = longitude.toFixed(6);
  if (accEl) accEl.textContent = Math.round(accuracy);
  if (tsEl) tsEl.textContent = new Date(pos.timestamp).toLocaleString();
  setG('取得成功');
  lastLat = latitude;
  lastLng = longitude;
  // QR検出済みかつ未保存ならスキャンを保存
  maybeSaveScan();
}
function onGeoErr(err) {
  setG(`エラー(${err.code}): ${err.message}`);
}

function requestOneShotGeo() {
  if (!('geolocation' in navigator)) {
    console.warn('geolocation unsupported'); return;
  }
  if (!isSecureContext && !isLocalhost()) {
    setG('HTTPSではないため位置情報がブロックされる可能性があります（スマホは https でアクセスしてください）');
  }
  setG('QR検出 → 現在地取得中...');

  // 一度だけの現在地取得（getCurrentPositionが失敗/タイムアウト時はwatchPositionでフォールバック）
  const getOnePosition = () => new Promise((resolve, reject) => {
    let settled = false;
    const onSuccess = (pos) => { if (!settled) { settled = true; resolve(pos); } };
    const onError = (err) => { if (!settled) { settled = true; reject(err); } };

    // まず通常のワンショット
    navigator.geolocation.getCurrentPosition(onSuccess, () => {
      // フォールバック: watchPositionで最初のfixを拾う
      let wid = null;
      const timer = setTimeout(() => {
        if (wid !== null) navigator.geolocation.clearWatch(wid);
        onError(new Error('timeout (watchPosition)'));
      }, 12000);
      wid = navigator.geolocation.watchPosition((pos) => {
        clearTimeout(timer);
        if (wid !== null) navigator.geolocation.clearWatch(wid);
        onSuccess(pos);
      }, (e) => {
        clearTimeout(timer);
        if (wid !== null) navigator.geolocation.clearWatch(wid);
        onError(e);
      }, geoOpts);
    }, geoOpts);
  });

  getOnePosition()
    .then((pos) => {
      onGeo(pos);
    })
    .catch((err) => {
      onGeoErr(err);
    });
}

// カメラ起動/停止
startBtn.addEventListener('click', async () => {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('このブラウザはカメラ API に未対応です。');
      return;
    }
    setStatus('権限確認中…');
    startBtn.disabled = true;
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    videoEl.srcObject = stream;
    setStatus('映像取得中');
    stopBtn.disabled = false;
    startQR.disabled = false;
  } catch (e) {
    console.error(e);
    setStatus('起動失敗: ' + (e?.name || 'Unknown'));
    alert('カメラが起動できません。権限や他アプリの使用状況を確認してください。');
    startBtn.disabled = false;
  }
});

stopBtn.addEventListener('click', () => {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  videoEl.srcObject = null;
  setStatus('停止しました');
  stopBtn.disabled = true;
  startBtn.disabled = false;

  // QR 停止
  scanning = false;
  startQR.disabled = true;
  stopQR.disabled = true;
  if (qrRAF) { cancelAnimationFrame(qrRAF); qrRAF = null; }
  const ctx = overlay.getContext('2d');
  ctx && ctx.clearRect(0, 0, overlay.width, overlay.height);
});

// QR スキャン
function drawLine(ctx, a, b, color) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function scanLoop() {
  if (!scanning || !videoEl || videoEl.readyState < 2) {
    qrRAF = requestAnimationFrame(scanLoop);
    return;
  }
  const rect = videoEl.getBoundingClientRect();
  overlay.width = rect.width;
  overlay.height = rect.height;
  const ctx = overlay.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, overlay.width, overlay.height);
  const imageData = ctx.getImageData(0, 0, overlay.width, overlay.height);
  const qr = window.jsQR?.(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  if (qr) {
    drawLine(ctx, qr.location.topLeftCorner, qr.location.topRightCorner, '#00ff88');
    drawLine(ctx, qr.location.topRightCorner, qr.location.bottomRightCorner, '#00ff88');
    drawLine(ctx, qr.location.bottomRightCorner, qr.location.bottomLeftCorner, '#00ff88');
    drawLine(ctx, qr.location.bottomLeftCorner, qr.location.topLeftCorner, '#00ff88');
    qrResultEl.textContent = qr.data;
    if (!scanCaptured) {
      scanCaptured = true;
      lastQR = qr.data;
  btnLoadPosts?.removeAttribute('disabled');
  loadStatus && (loadStatus.textContent = 'QR検出済み');
      savedScanThisSession = false;
      // スキャン停止（プレビュー継続）
      scanning = false;
      startQR.disabled = false;
      stopQR.disabled = true;
      if (qrRAF) { cancelAnimationFrame(qrRAF); qrRAF = null; }
      // 位置情報を1回取得
      requestOneShotGeo();
    }
  }
  qrRAF = requestAnimationFrame(scanLoop);
}

startQR.addEventListener('click', () => {
  scanning = true;
  scanCaptured = false;  // 新しいセッション開始
  savedScanThisSession = false;
  startQR.disabled = true;
  stopQR.disabled = false;
  qrResultEl.textContent = '-';
  if (!qrRAF) qrRAF = requestAnimationFrame(scanLoop);
});

stopQR.addEventListener('click', () => {
  scanning = false;
  startQR.disabled = false;
  stopQR.disabled = true;
  if (qrRAF) { cancelAnimationFrame(qrRAF); qrRAF = null; }
  const ctx = overlay.getContext('2d');
  ctx && ctx.clearRect(0, 0, overlay.width, overlay.height);
});

// 位置情報の手動操作
gReq.addEventListener('click', () => {
  setG('現在地を取得中...');
  // 手動取得もフォールバック付きで
  const getOnePosition = () => new Promise((resolve, reject) => {
    let settled = false;
    const ok = (p) => { if (!settled) { settled = true; resolve(p); } };
    const ng = (e) => { if (!settled) { settled = true; reject(e); } };
    navigator.geolocation.getCurrentPosition(ok, () => {
      let wid = null;
      const timer = setTimeout(() => { if (wid !== null) navigator.geolocation.clearWatch(wid); ng(new Error('timeout (watchPosition)')); }, 12000);
      wid = navigator.geolocation.watchPosition((p) => { clearTimeout(timer); if (wid !== null) navigator.geolocation.clearWatch(wid); ok(p); }, (e) => { clearTimeout(timer); if (wid !== null) navigator.geolocation.clearWatch(wid); ng(e); }, geoOpts);
    }, geoOpts);
  });
  getOnePosition().then(onGeo).catch(onGeoErr);
});
gWatch.addEventListener('click', () => {
  if (watchId !== null) return;
  setG('追跡中...');
  watchId = navigator.geolocation.watchPosition(onGeo, onGeoErr, geoOpts);
  gWatch.disabled = true;
  gStop.disabled = false;
});
gStop.addEventListener('click', () => {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    setG('追跡停止');
    gWatch.disabled = false;
    gStop.disabled = true;
  }
});

// 権限状態の可視化（対応ブラウザ）
if (navigator.permissions?.query) {
  navigator.permissions.query({ name: 'geolocation' })
    .then(p => {
      setG(`権限: ${p.state}`);
      p.onchange = () => setG(`権限: ${p.state}`);
    })
    .catch(() => {});
}

// ダイアログのボタン（今はプレースホルダ）
btnPost?.addEventListener('click', () => {
  console.log('投稿へ遷移（準備中）', { qr: lastQR, lat: latEl.textContent, lng: lngEl.textContent });
  dlg.close();
});
btnView?.addEventListener('click', () => {
  console.log('閲覧へ遷移（準備中）', { qr: lastQR, lat: latEl.textContent, lng: lngEl.textContent });
  dlg.close();
});
btnClose?.addEventListener('click', () => dlg.close());

// QR + 位置情報が揃ったら一度だけ /api/scans に保存
async function maybeSaveScan() {
  try {
    if (!scanCaptured || savedScanThisSession) return;
    if (!lastQR || typeof lastLat !== 'number' || typeof lastLng !== 'number') return;
    // サーバーへ保存
    const res = await fetch('/api/scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrPayload: lastQR, lat: lastLat, lng: lastLng })
    });
    if (!res.ok) throw new Error('scan save failed');
    const data = await res.json();
    savedScanThisSession = true;
    lastSavedScanId = data.id || null;
    setG(`スキャン保存: ${data.id || 'OK'}`);
  } catch (e) {
    console.warn('save scan error', e);
    setG('スキャン保存に失敗しました');
  }
}

// 投稿フォーム
postForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    if (!postTypeEl?.value) return;
    const type = postTypeEl.value;
    const title = postTitleEl?.value || '';
    const description = postDescEl?.value || '';
    const file = postMediaEl?.files?.[0] || null;

    // 位置が未取得の場合は一度だけ取得を試みる
    if (typeof lastLat !== 'number' || typeof lastLng !== 'number') {
      await new Promise((resolve) => {
        const done = () => resolve();
        const ok = (p) => { onGeo(p); done(); };
        const ng = () => done();
        navigator.geolocation.getCurrentPosition(ok, ng, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
      });
    }
    if (typeof lastLat !== 'number' || typeof lastLng !== 'number') {
      postStatus.textContent = '位置情報が取得できていません';
      return;
    }

    const fd = new FormData();
    fd.append('type', type);
    fd.append('title', title);
    fd.append('description', description);
    fd.append('lat', String(lastLat));
    fd.append('lng', String(lastLng));
    if (file) fd.append('media', file);
    if (lastSavedScanId) fd.append('scanId', lastSavedScanId);

    postStatus.textContent = '送信中...';
    const res = await fetch('/api/posts', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
    const data = await res.json();
    postStatus.textContent = `投稿完了: ${data.id}`;
  } catch (err) {
    console.error(err);
    postStatus.textContent = '投稿に失敗しました';
  }
});

// QRの投稿読み込み
btnLoadPosts?.addEventListener('click', async () => {
  if (!lastQR) {
    loadStatus.textContent = 'QR未検出';
    return;
  }
  try {
    loadStatus.textContent = '読み込み中...';
    postsList.innerHTML = '';
    const url = `/api/posts/by-qr?qr=${encodeURIComponent(lastQR)}&limit=50`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    const items = data.items || [];
    if (items.length === 0) {
      loadStatus.textContent = '投稿はありません';
      return;
    }
    loadStatus.textContent = `${items.length} 件`;
    const frag = document.createDocumentFragment();
    for (const it of items) {
      const div = document.createElement('div');
      div.style.border = '1px solid #ddd';
      div.style.borderRadius = '8px';
      div.style.padding = '.5rem';
      div.style.marginTop = '.5rem';
      const title = document.createElement('div');
      title.textContent = `${it.type?.toUpperCase() || 'POST'}: ${it.title || '(無題)'} @ ${Number(it.lat).toFixed(6)}, ${Number(it.lng).toFixed(6)}`;
      const meta = document.createElement('div');
      meta.style.opacity = '0.8';
      meta.style.fontSize = '0.9em';
      meta.textContent = `${it.createdAt || ''} • ${it.contentType || ''} • ${it.originalName || ''}`;
      div.appendChild(title);
      div.appendChild(meta);
      if (it.mediaUrl) {
        if ((it.type === 'image') || (it.contentType?.startsWith('image/'))) {
          const img = document.createElement('img');
          img.src = it.mediaUrl;
          img.alt = it.title || '';
          img.style.maxWidth = '320px';
          img.style.display = 'block';
          img.style.marginTop = '.25rem';
          div.appendChild(img);
        } else {
          const link = document.createElement('a');
          link.href = it.mediaUrl;
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = 'メディアを開く';
          link.style.display = 'inline-block';
          link.style.marginTop = '.25rem';
          div.appendChild(link);
        }
      }
      frag.appendChild(div);
    }
    postsList.appendChild(frag);
  } catch (e) {
    console.error(e);
    loadStatus.textContent = '読み込み失敗';
  }
});