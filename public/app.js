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

function addResultCard({ viewUrl, name, size }) {
  const node = $('#tpl-result').content.firstElementChild.cloneNode(true);
  node.querySelector('img').src = viewUrl;
  node.querySelector('.rc-name').textContent = name;
  node.querySelector('.rc-meta').textContent = fmtSize(size);
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
  for (const file of imgs) {
    try {
      addResultCard(await uploadFile(file));
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
