/* imgbed — 前端逻辑 */
const TOKEN_KEY = 'imgbed_token';

const $ = (s, r = document) => r.querySelector(s);
const el = {
  dropzone: $('#dropzone'),
  fileInput: $('#fileInput'),
  results: $('#results'),
  gallery: $('#gallery'),
  views: { upload: $('#view-upload'), gallery: $('#view-gallery'), ai: $('#view-ai') },
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

/* ---------------- AI 抠图换背景 ---------------- */
const TF_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';
const ai = {
  remover: null, cutoutCanvas: null, sceneImg: null,
  bgType: 'transparent', color: '#438edb', lastName: 'image',
};

// 懒加载 transformers.js + RMBG-1.4（首次下载，浏览器缓存）
async function getRemover(onProgress) {
  if (ai.remover) return ai.remover;
  const tr = await import(TF_CDN);
  tr.env.allowLocalModels = false;
  // 模型经本站 /hf 代理加载（Cloudflare 边缘可访问 HF 并缓存），绕开对 huggingface.co 的直连
  tr.env.remoteHost = location.origin + '/hf';
  // 优先 WebGPU（快），失败回退默认 WASM
  // 模型用 Xenova/modnet：transformers.js 原生兼容、公开可下、对人像抠图友好（适合证件照）
  try {
    ai.remover = await tr.pipeline('background-removal', 'Xenova/modnet', { device: 'webgpu', progress_callback: onProgress });
  } catch {
    ai.remover = await tr.pipeline('background-removal', 'Xenova/modnet', { progress_callback: onProgress });
  }
  return ai.remover;
}

function aiProgressCb(d) {
  if (d.status === 'progress' && d.file) {
    const pct = d.total ? Math.round((d.loaded / d.total) * 100) : 0;
    setAiProgress(pct, `下载模型 ${String(d.file).split('/').pop()} · ${pct}%`);
  } else if (d.status === 'ready') {
    setAiProgress(100, '模型就绪');
  }
}
const setAiProgress = (p, t) => { $('#aiBarFill').style.width = Math.max(0, Math.min(100, p)) + '%'; if (t) $('#aiProgressText').textContent = t; };
const showAiProgress = (p, t) => { $('#aiProgress').hidden = false; setAiProgress(p, t); };
const hideAiProgress = () => { $('#aiProgress').hidden = true; };

function loadImageSrc(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

async function aiSelect(file) {
  if (!file || !file.type.startsWith('image/')) { toast('请选择图片文件', true); return; }
  ai.lastName = file.name;
  showAiProgress(5, '加载模型…（首次约几十MB，之后缓存）');
  let remover;
  try {
    remover = await getRemover(aiProgressCb);
  } catch (e) {
    hideAiProgress();
    toast('模型加载失败：' + (e?.message || e) + '（CDN 可能被墙，可换网络或自托管模型）', true);
    return;
  }
  setAiProgress(100, '抠图中…');
  try {
    const url = URL.createObjectURL(file);
    let out;
    try { out = await remover(url); } finally { URL.revokeObjectURL(url); }
    const raw = Array.isArray(out) ? out[0] : out;
    ai.cutoutCanvas = raw && typeof raw.toCanvas === 'function' ? raw.toCanvas() : rawToCanvas(raw);
    hideAiProgress();
    $('#aiOpts').hidden = false;
    renderAiPreview();
    toast('抠图完成');
  } catch (e) {
    hideAiProgress();
    toast('抠图失败：' + (e?.message || e), true);
  }
}

function rawToCanvas(raw) {
  if (!raw || !raw.data || !raw.width || !raw.height) throw new Error('抠图输出无法识别');
  const c = document.createElement('canvas');
  c.width = raw.width; c.height = raw.height;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(raw.data), raw.width, raw.height), 0, 0);
  return c;
}

// 按当前选项合成（透明/纯色/AI场景 + 尺寸）
function composeCurrent() {
  if (!ai.cutoutCanvas) return null;
  const sizeVal = $('#aiSize').value;
  let w = ai.cutoutCanvas.width, h = ai.cutoutCanvas.height;
  if (sizeVal && sizeVal !== '0') { const [sw, sh] = sizeVal.split('x').map(Number); w = sw; h = sh; }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (ai.bgType === 'solid') { ctx.fillStyle = ai.color; ctx.fillRect(0, 0, w, h); }
  else if (ai.bgType === 'scene' && ai.sceneImg) { drawCover(ctx, ai.sceneImg, w, h); }
  drawContain(ctx, ai.cutoutCanvas, w, h);
  return c;
}
const drawContain = (ctx, src, w, h) => { const r = Math.min(w / src.width, h / src.height); const dw = src.width * r, dh = src.height * r; ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh); };
const drawCover = (ctx, src, w, h) => { const r = Math.max(w / src.width, h / src.height); const dw = src.width * r, dh = src.height * r; ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh); };

function renderAiPreview() {
  const c = composeCurrent();
  if (!c) return;
  const prev = $('#aiPreview');
  prev.innerHTML = '';
  prev.appendChild(c);
  $('#aiPrevInfo').textContent = `${c.width}×${c.height}`;
  $('#aiUploadBtn').disabled = false;
}

async function genBackground() {
  const prompt = $('#aiPrompt').value.trim();
  if (!prompt) { toast('请输入背景描述', true); return; }
  const engine = $('#aiEngine').value;
  const btn = $('#aiGenBtn'); btn.disabled = true;
  $('#aiGenStatus').textContent = `生成中（${engine}）…可能需十几秒`;
  try {
    const res = await fetch('/api/gen-bg', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prompt, engine }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `失败 ${res.status}`); }
    const { image } = await res.json();
    ai.sceneImg = await loadImageSrc(image);
    $('#aiGenStatus').textContent = '背景已生成';
    renderAiPreview();
    toast('背景生成成功');
  } catch (e) {
    $('#aiGenStatus').textContent = '';
    toast('生成失败：' + (e?.message || e), true);
  } finally {
    btn.disabled = false;
  }
}

async function aiUpload() {
  if (!ensureToken()) return;
  const c = composeCurrent();
  if (!c) return;
  const btn = $('#aiUploadBtn'); btn.disabled = true;
  try {
    const blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('导出失败'))), 'image/png'));
    const base = ai.lastName.replace(/\.[^.]+$/, '') || 'image';
    const file = new File([blob], `${base}-${ai.bgType}.png`, { type: 'image/png' });
    switchView('upload');
    addResultCard(await uploadFile(file), null);
    toast('上传成功');
  } catch (e) {
    toast('上传失败：' + (e?.message || e), true);
  } finally {
    btn.disabled = false;
  }
}

function bindAi() {
  const drop = $('#aiDrop'), file = $('#aiFile');
  drop.addEventListener('click', () => file.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
  file.addEventListener('change', () => { if (file.files[0]) aiSelect(file.files[0]); file.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-drag'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-drag'); }));
  drop.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.[0]) aiSelect(e.dataTransfer.files[0]); });

  $('#bgType').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn'); if (!b) return;
    $('#bgType').querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('is-active', x === b));
    ai.bgType = b.dataset.v;
    document.querySelectorAll('#aiOpts [data-show]').forEach((f) => (f.hidden = f.dataset.show !== ai.bgType));
    renderAiPreview();
  });
  $('#aiColors').addEventListener('click', (e) => {
    const b = e.target.closest('.swatch[data-c]'); if (!b) return;
    ai.color = b.dataset.c;
    $('#aiColors').querySelectorAll('.swatch').forEach((x) => x.classList.toggle('is-active', x === b));
    $('#aiColor').value = ai.color;
    renderAiPreview();
  });
  $('#aiColor').addEventListener('input', (e) => {
    ai.color = e.target.value;
    $('#aiColors').querySelectorAll('.swatch').forEach((x) => x.classList.remove('is-active'));
    renderAiPreview();
  });
  $('#aiGenBtn').addEventListener('click', genBackground);
  $('#aiSize').addEventListener('change', renderAiPreview);
  $('#aiUploadBtn').addEventListener('click', aiUpload);
}

/* ---------------- 初始化 ---------------- */
function init() {
  renderToken();
  bindDropzone();
  bindPaste();
  bindAi();
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
