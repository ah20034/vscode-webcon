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

// 選択ダイアログ
const dlg = document.getElementById('qrChoice');
const btnPost = document.getElementById('choice-post');
const btnView = document.getElementById('choice-view');
const btnClose = document.getElementById('choice-close');

// 状態
let stream = null;
let scanning = false;
let qrRAF = null;
let scanCaptured = false; // 1セッションで1度だけ確定
let watchId = null;
let lastQR = null;

// util
const setStatus = (s) => statusEl.textContent = s;
const setG = (s) => gStatus.textContent = s;

// 位置情報オプション
const geoOpts = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

function onGeo(pos) {
  const { latitude, longitude, accuracy } = pos.coords;
  latEl.textContent = latitude.toFixed(6);
  lngEl.textContent = longitude.toFixed(6);
  accEl.textContent = Math.round(accuracy);
  tsEl.textContent = new Date(pos.timestamp).toLocaleString();
  setG('取得成功');
}

function onGeoErr(err) {
  setG(`エラー(${err.code}): ${err.message}`);
}

function requestOneShotGeo() {
  if (!('geolocation' in navigator)) {
    setG('このブラウザは位置情報に未対応');
    return;
  }
  if (!isSecureContext) {
    setG('HTTPS以外（localhost除く）では位置情報が制限されます');
  }
  setG('QR検出 → 現在地取得中...');
  navigator.geolocation.getCurrentPosition(onGeo, onGeoErr, geoOpts);
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
      // スキャン停止（プレビューは継続）
      scanning = false;
      startQR.disabled = false;
      stopQR.disabled = true;
      if (qrRAF) { cancelAnimationFrame(qrRAF); qrRAF = null; }

      // 位置情報を1回取得
      requestOneShotGeo();

      // 選択ダイアログ（将来の投稿/閲覧遷移に利用）
      if (typeof dlg?.showModal === 'function') {
        dlg.showModal();
      }
    }
  }
  qrRAF = requestAnimationFrame(scanLoop);
}

startQR.addEventListener('click', () => {
  scanning = true;
  scanCaptured = false;
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
  navigator.geolocation.getCurrentPosition(onGeo, onGeoErr, geoOpts);
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