/** 允许上传的图片类型 → 扩展名。 */
export const ALLOWED_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/x-icon': 'ico',
  'image/heic': 'heic',
  'image/tiff': 'tiff',
};

/** 扩展名 → MIME（下载代理兜底用）。 */
const MIME_FROM_EXT = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif',
  ico: 'image/x-icon', heic: 'image/heic', tiff: 'image/tiff', tif: 'image/tiff',
};

export function extFromName(filename) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(filename || '');
  return m ? m[1].toLowerCase() : '';
}

export function extFromType(contentType) {
  return ALLOWED_TYPES[(contentType || '').toLowerCase()] || '';
}

export function guessMime(key) {
  return MIME_FROM_EXT[extFromName(key)] || 'application/octet-stream';
}

/** 生成存储 key：img/YYYYMMDD/<base36时间戳>-<6位随机>.<ext> */
export function generateKey(filename, contentType) {
  const ext = extFromName(filename) || extFromType(contentType) || 'bin';
  const now = new Date();
  const y = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const ts = now.getTime().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `img/${y}${mo}${d}/${ts}-${rand}.${ext}`;
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    },
  });
}

export function textResponse(text, status = 200, headers = {}) {
  return new Response(text, { status, headers });
}
