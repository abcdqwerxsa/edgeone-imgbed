const TOKEN_KEY = 'edgeone_imgbed_token';

const $ = (sel) => document.querySelector(sel);
const el = {
  dropzone: $('#dropzone'),
  fileInput: $('#file-input'),
  results: $('#results'),
  gallery: $('#gallery'),
  btnToken: $('#btn-token'),
  btnGallery: $('#btn-gallery'),
  btnRefresh: $('#btn-refresh'),
  tokenState: $('#token-state'),
  uploadSection: $('#upload-section'),
  gallerySection: $('#gallery-section'),
  toast: $('#toast'),
};

/* ---------------- Token 管理 ---------------- */
const getToken = () => localStorage.getItem(TOKEN_KEY);
const setToken = (t) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
  renderTokenState();
};
function renderTokenState() {
  if (getToken()) {
    el.tokenState.textContent = 'Token 已设置';
    el.tokenState.classList.replace('badge-warn', 'badge-ok');
  } else {
    el.tokenState.textContent = '未设置 Token';
    el.tokenState.classList.replace('badge-ok', 'badge-warn');
  }
}
function promptToken() {
  const cur = getToken() || '';
  const t = prompt('请输入上传 Token（UPLOAD_TOKEN）：', cur);
  if (t !== null) setToken(t.trim());
}
function ensureToken() {
  if (getToken()) return true;
  promptToken();
  return !!getToken();
}
function authHeaders(extra = {}) {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}`, ...extra } : extra;
}

/* ---------------- 提示 ---------------- */
let toastTimer = null;
function toast(msg, kind = 'info') {
  el.toast.textContent = msg;
  el.toast.className = `toast show toast-${kind}`;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.classList.remove('show');
    el.toast.hidden = true;
  }, 2600);
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制');
    if (btn) {
      const old = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => (btn.textContent = old), 1000);
    }
  } catch {
    toast('复制失败，请手动复制', 'error');
  }
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
    throw new Error(
      `上传失败 ${putRes.status}（若为 CORS 错误，请检查 Bitiful 桶是否已配置允许本域名）`
    );
  }
  return { viewUrl, name: file.name, size: file.size };
}

function addResultCard({ viewUrl, name }) {
  const node = $('#tpl-result').content.firstElementChild.cloneNode(true);
  node.querySelector('img').src = viewUrl;
  node.querySelector('.rc-name').textContent = name;
  const md = `![${name}](${viewUrl})`;
  const html = `<img src="${viewUrl}" alt="${name}" />`;
  node.querySelector('.link-url').value = viewUrl;
  node.querySelector('.link-md').value = md;
  node.querySelector('.link-html').value = html;
  node.querySelector('.rc-open').href = viewUrl;
  node.querySelectorAll('.btn-copy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      copyText(input.value, btn);
      input.focus();
      input.select();
    });
  });
  el.results.prepend(node);
}

async function handleFiles(files) {
  const imgs = [...files].filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) {
    toast('请选择图片文件', 'error');
    return;
  }
  if (!ensureToken()) {
    toast('需要先设置 Token 才能上传', 'error');
    return;
  }
  for (const file of imgs) {
    try {
      const r = await uploadFile(file);
      addResultCard(r);
      toast('上传成功');
    } catch (e) {
      toast(e.message, 'error');
    }
  }
}

/* ---------------- 拖拽 & 选择 ---------------- */
function bindDropzone() {
  el.dropzone.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', () => {
    handleFiles(el.fileInput.files);
    el.fileInput.value = '';
  });
  ['dragenter', 'dragover'].forEach((ev) =>
    el.dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      el.dropzone.classList.add('drag');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    el.dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      el.dropzone.classList.remove('drag');
    })
  );
  el.dropzone.addEventListener('drop', (e) => {
    handleFiles(e.dataTransfer.files);
  });
}

/* ---------------- 图库 ---------------- */
async function loadGallery() {
  el.gallery.innerHTML = '<p class="muted">加载中…</p>';
  let data;
  try {
    const res = await fetch('/api/list', { headers: authHeaders() });
    if (res.status === 401) {
      el.gallery.innerHTML = '<p class="muted">请先设置 Token</p>';
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    el.gallery.innerHTML = `<p class="muted">加载失败：${e.message}</p>`;
    return;
  }
  if (!data.items?.length) {
    el.gallery.innerHTML = '<p class="muted">还没有图片，去上传一张吧～</p>';
    return;
  }
  el.gallery.innerHTML = '';
  for (const it of data.items) {
    const node = $('#tpl-gallery-item').content.firstElementChild.cloneNode(true);
    node.querySelector('img').src = it.viewUrl;
    node.querySelector('.g-name').textContent = it.key.split('/').pop();
    const copyBtn = node.querySelector('.btn-copy');
    const delBtn = node.querySelector('.btn-del');
    copyBtn.addEventListener('click', () => copyText(it.viewUrl, copyBtn));
    delBtn.addEventListener('click', async () => {
      if (!confirm(`删除 ${it.key} ？`)) return;
      const r = await fetch(`/api/delete?key=${encodeURIComponent(it.key)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (r.ok) {
        node.remove();
        toast('已删除');
      } else {
        toast('删除失败', 'error');
      }
    });
    el.gallery.appendChild(node);
  }
}

/* ---------------- 导航 ---------------- */
function showGallery(show) {
  el.uploadSection.hidden = show;
  el.gallerySection.hidden = !show;
  if (show) loadGallery();
}

/* ---------------- 初始化 ---------------- */
function init() {
  renderTokenState();
  bindDropzone();
  el.btnToken.addEventListener('click', promptToken);
  el.tokenState.addEventListener('click', promptToken);
  el.btnGallery.addEventListener('click', () => showGallery(true));
  el.btnRefresh.addEventListener('click', loadGallery);
}
init();
