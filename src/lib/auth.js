/**
 * Token 鉴权：上传/列表/删除接口需要 Authorization: Bearer <UPLOAD_TOKEN>。
 * 兼容 ?token=xxx 查询参数（便于在地址栏测试）。
 */

/** 常量时间比较，避免时序侧信道。 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const max = Math.max(ab.length, bb.length);
  for (let i = 0; i < max; i++) {
    diff |= (ab[i] || 0) ^ (bb[i] || 0);
  }
  return diff === 0;
}

export function extractToken(request) {
  const auth = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  if (auth) return auth.trim();
  try {
    const url = new URL(request.url);
    return url.searchParams.get('token') || '';
  } catch {
    return '';
  }
}

export function unauthorized(message = 'Unauthorized', status = 401) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/**
 * @returns {{ ok: true } | { ok: false, response: Response }}
 */
export async function requireToken(request, env) {
  if (!env.UPLOAD_TOKEN) {
    return { ok: false, response: unauthorized('UPLOAD_TOKEN not configured', 500) };
  }
  const token = extractToken(request);
  if (!token || !timingSafeEqual(token, env.UPLOAD_TOKEN)) {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true };
}
