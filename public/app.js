/* imgbed — 前端逻辑 */
const TOKEN_KEY = 'imgbed_token';

const $ = (s, r = document) => r.querySelector(s);
const el = {
  dropzone: $('#dropzone'),
  fileInput: $('#fileInput'),
  results: $('#results'),
  gallery: $('#gallery'),
  views: { upload: $('#view-upload'), gallery: $('#view-gallery') },
  tabs: Array.from(document.querySelectorAll('.nav-tab')),
  tokenBtn: $('#tokenBtn'),
  tokenDot: $('#tokenDot'),
  tokenLabel: $('#tokenLabel'),
  tokenDialog: $('#tokenDialog'),
  tokenInput: $('#tokenInput'),
  tokenSave: $('#tokenSave'),
  tokenCancel: $('#tokenCancel'),
  refreshBtn: $('#refreshBtn'),
  toast: $('#toast'),
};

/* ---------------- Token ---------------- */
const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
  renderToken();
};
function renderToken() {
  const ok = !!getToken();
  el.tokenDot.className = 'dot ' + (ok ? 'dot-on' : 'dot-off');
  el.tokenLabel.textContent = ok ? 'Token 已设置' : '未设置 Token';
}
function openTokenDialog() {
  el.tokenInput.value = getToken() || '';
  el.tokenDialog.showModal();
  setTimeout(() => el.tokenInput.focus(), 30);
}
function ensureToken() {
  if (getToken()) return true;
  toast('请先设置上传 Token', true);
  openTokenDialog();
  return false;
}
const authHeaders = (extra = {}) => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}`, ...extra } : extra;
};

/* ---------------- Toast ---------------- */
let toastTimer;
function toast(msg, isErr = false) {
  el.toast.textContent = msg;
  el.toast.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.toast.className = 'toast'), 2400);
}

async function copy(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    toast('复制失败，请手动复制', true);
    return;
  }
  toast('已复制');
  if (btn) {
    const prev = btn.textContent;
    btn.classList.add('copied');
    btn.textContent = '已复制';
    setTimeout(() => { btn.classList.remove('copied'); btn.textContent = prev; }, 1100);
  }
}

function fmtSize(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

/* ---------------- 视图切换 ---------------- */
function switchView(name) {
  el.tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.view === name));
  Object.entries(el.views).forEach(([k, v]) => (v.hidden = k !== name));
  if (name === 'gallery') loadGallery();
}

/* ---------------- 图片处理（上传前，浏览器本地 Canvas）---------------- */
const numVal = (sel, d) => {
  const v = Number($(sel).value);
  return Number.isFinite(v) && v > 0 ? v : d;
};

function getSettings() {
  return {
    resize: { on: $('#rsOn').checked, width: numVal('#rsWidth', 1920) },
    compress: { on: $('#cpOn').checked, quality: numVal('#cpQ', 80) },
    format: { on: $('#fmOn').checked, type: $('#fmType').value },
    watermark: {
      on: $('#wmOn').checked,
      text: $('#wmText').value.trim(),
      pos: $('#wmPos').value,
      size: numVal('#wmSize', 28),
      opacity: numVal('#wmOpacity', 45),
      color: $('#wmColor').value,
    },
  };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败，跳过处理')); };
    img.src = url;
  });
}

// 在浏览器本地处理：缩放 →（铺白底，若输出 JPEG）→ 绘制 → 水印 → 导出
async function processImage(file, s) {
  if (!/^image\/(png|jpeg|webp|bmp)$/i.test(file.type)) return file; // GIF/SVG 原样上传
  const img = await loadImage(file);
  let w = img.naturalWidth, h = img.naturalHeight;
  if (s.resize.on && w > s.resize.width) {
    const r = s.resize.width / w;
    w = Math.round(w * r); h = Math.round(h * r);
  }
  const outType = s.format.on ? s.format.type : file.type;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (outType === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); } // JPEG 无透明通道
  ctx.drawImage(img, 0, 0, w, h);
  if (s.watermark.on && s.watermark.text) drawWatermark(ctx, w, h, s.watermark);
  const quality = s.compress.on ? s.compress.quality / 100 : 0.92;
  const blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('导出失败'))), outType, quality)
  );
  const ext = outType === 'image/webp' ? 'webp' : outType === 'image/png' ? 'png' : 'jpg';
  const baseName = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.${ext}`, { type: outType });
}

function drawWatermark(ctx, w, h, wm) {
  const fs = Math.max(8, wm.size);
  const map = { br: ['b', 'r'], bl: ['b', 'l'], tr: ['t', 'r'], tl: ['t', 'l'], c: ['m', 'c'] };
  const [vy, vx] = map[wm.pos] || ['b', 'r'];
  ctx.save();
  ctx.font = `600 ${fs}px -apple-system, "SF Pro Display", system-ui, "PingFang SC", sans-serif`;
  ctx.globalAlpha = Math.min(1, Math.max(0.05, wm.opacity / 100));
  ctx.fillStyle = wm.color;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = fs * 0.16;
  ctx.shadowOffsetY = fs * 0.05;
  ctx.textBaseline = 'middle';
  ctx.textAlign = vx === 'l' ? 'left' : vx === 'r' ? 'right' : 'center';
  const pad = Math.max(12, fs * 0.5);
  const x = vx === 'l' ? pad : vx === 'r' ? w - pad : w / 2;
  const y = vy === 't' ? pad + fs / 2 : vy === 'b' ? h - pad - fs / 2 : h / 2;
  ctx.fillText(wm.text, x, y);
  ctx.restore();
}

/* ---------------- 上传 ---------------- */
async function uploadFile(file) {
  const signRes = await fetch('/api/upload', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ filename: file.name, contentType: file.type }),
  });
  if (signRes.status === 401) throw new Error('Token 无效或未设置');
  if (!signRes.ok) {
    const e = await signRes.json().catch(() => ({}));
    throw new Error(e.error || `签名失败 ${signRes.status}`);
  }
  const { uploadUrl, viewUrl } = await signRes.json();

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`上传失败 ${putRes.status}（若是 CORS 错误，请检查对象存储桶 CORS 是否放行本域名）`);
  }
  return { viewUrl, name: file.name, size: file.size };
}

function addResultCard({ viewUrl, name, size }, origSize = null) {
  const node = $('#tpl-result').content.firstElementChild.cloneNode(true);
  node.querySelector('img').src = viewUrl;
  node.querySelector('.rc-name').textContent = name;
  node.querySelector('.rc-meta').textContent =
    origSize !== null && origSize !== size ? `${fmtSize(size)} · 处理自 ${fmtSize(origSize)}` : fmtSize(size);
  node.querySelector('.rc-open').href = viewUrl;

  const md = `![${name}](${viewUrl})`;
  const html = `<img src="${viewUrl}" alt="${name}" />`;
  const rows = [
    ['直链', viewUrl],
    ['MD', md],
    ['HTML', html],
  ];
  const links = node.querySelector('.rc-links');
  for (const [lbl, val] of rows) {
    const row = document.createElement('div');
    row.className = 'link-row';
    row.innerHTML = `<span class="lbl">${lbl}</span><input class="val" readonly /><button class="btn btn-ghost copybtn" type="button">复制</button>`;
    row.querySelector('.val').value = val;
    row.querySelector('.val').addEventListener('click', (e) => e.target.select());
    row.querySelector('.copybtn').addEventListener('click', (e) => copy(val, e.currentTarget));
    links.appendChild(row);
  }
  el.results.prepend(node);
}

async function handleFiles(files) {
  const imgs = [...files].filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) { toast('请选择图片文件', true); return; }
  if (!ensureToken()) return;
  const s = getSettings();
  const anyProc = s.resize.on || s.compress.on || s.format.on || s.watermark.on;
  for (const file of imgs) {
    try {
      let out = file, origSize = null;
      if (anyProc) {
        origSize = file.size;
        out = await processImage(file, s);
        if (out === file) origSize = null; // 该格式不支持处理（GIF/SVG），不显示对比
      }
      addResultCard(await uploadFile(out), origSize);
      toast('上传成功');
    } catch (e) {
      toast(e.message, true);
    }
  }
}

/* ---------------- 拖拽 / 选择 / 粘贴 ---------------- */
function bindDropzone() {
  const dz = el.dropzone;
  dz.addEventListener('click', () => el.fileInput.click());
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.fileInput.click(); }
  });
  el.fileInput.addEventListener('change', () => {
    handleFiles(el.fileInput.files);
    el.fileInput.value = '';
  });
  ['dragenter', 'dragover'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('is-drag'); })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('is-drag'); })
  );
  dz.addEventListener('drop', (e) => {
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  });
  // 全局防止拖到非放置区时浏览器直接打开图片
  ['dragover', 'drop'].forEach((ev) =>
    window.addEventListener(ev, (e) => { if (e.target !== dz && !dz.contains(e.target)) e.preventDefault(); })
  );
}

function bindPaste() {
  window.addEventListener('paste', (e) => {
    if (el.views.upload.hidden) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f && f.type.startsWith('image/')) files.push(f);
      }
    }
    if (files.length) { e.preventDefault(); handleFiles(files); }
  });
}

/* ---------------- 图库 ---------------- */
async function loadGallery() {
  el.gallery.innerHTML = '<div class="gallery-empty">加载中…</div>';
  let data;
  try {
    const res = await fetch('/api/list', { headers: authHeaders() });
    if (res.status === 401) { el.gallery.innerHTML = '<div class="gallery-empty">请先设置 Token</div>'; return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    el.gallery.innerHTML = `<div class="gallery-empty">加载失败：${e.message}</div>`;
    return;
  }
  if (!data.items?.length) {
    el.gallery.innerHTML = '<div class="gallery-empty">还没有图片，去上传一张吧</div>';
    return;
  }
  el.gallery.innerHTML = '';
  for (const it of data.items) {
    const node = $('#tpl-gallery-item').content.firstElementChild.cloneNode(true);
    node.querySelector('img').src = it.viewUrl;
    const nameEl = node.querySelector('.g-name');
    const short = it.key.split('/').pop();
    nameEl.textContent = short;
    nameEl.title = it.key;
    node.querySelector('[data-act="copy"]').addEventListener('click', () => copy(it.viewUrl));
    node.querySelector('[data-act="delete"]').addEventListener('click', async (e) => {
      if (!confirm(`删除 ${short} ？`)) return;
      const r = await fetch(`/api/delete?key=${encodeURIComponent(it.key)}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      if (r.ok) { node.remove(); toast('已删除'); }
      else toast('删除失败', true);
    });
    el.gallery.appendChild(node);
  }
}

/* ---------------- 初始化 ---------------- */
function init() {
  renderToken();
  bindDropzone();
  bindPaste();
  el.tabs.forEach((t) => t.addEventListener('click', () => switchView(t.dataset.view)));
  el.tokenBtn.addEventListener('click', openTokenDialog);
  el.refreshBtn.addEventListener('click', loadGallery);

  // 图片处理面板：滑块联动数值显示
  [['#cpQ', '#cpQOut'], ['#wmOpacity', '#wmOpacityOut']].forEach(([r, o]) => {
    const rng = $(r), out = $(o);
    const sync = () => (out.textContent = rng.value);
    rng.addEventListener('input', sync);
    sync();
  });

  // Token 弹窗：点遮罩关闭，保存写入
  el.tokenDialog.addEventListener('click', (e) => {
    if (e.target === el.tokenDialog) el.tokenDialog.close();
  });
  el.tokenDialog.addEventListener('close', () => {
    if (el.tokenDialog.returnValue === 'save') {
      setToken(el.tokenInput.value.trim());
      toast(getToken() ? 'Token 已保存' : '已清除 Token');
    }
  });
  el.tokenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); el.tokenSave.click(); }
  });
}
init();
