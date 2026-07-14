/**
 * HuggingFace 模型文件代理：/hf/<owner>/<repo>/resolve/<rev>/<file>
 *
 * 为什么需要它：transformers.js 默认从 huggingface.co 拉模型（几十 MB），
 * 国内常被墙/超时。本函数把模型请求转到本站域名，Cloudflare 边缘可访问 HF、
 * 并在边缘缓存，浏览器/transformers.js 只需连你的可靠域名。
 * （app.js 里设置 env.remoteHost = origin + '/hf' 指向本代理）
 *
 * 仅放行 /resolve/ 与 /raw/（模型文件下载），防止被当成开放代理滥用。
 */
const HF = 'https://huggingface.co';

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = decodeURIComponent(url.pathname.replace(/^\/hf\/?/, ''));
  if (!path || path.includes('..') || (path.indexOf('/resolve/') === -1 && path.indexOf('/raw/') === -1)) {
    return new Response('Forbidden', { status: 403 });
  }

  // 边缘缓存命中直接返回
  const cache = caches.default;
  const cacheKey = new Request(new URL('/hf/' + path, url.origin).toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let upstream;
  try {
    upstream = await fetch(`${HF}/${path}`, {
      redirect: 'follow',
      headers: { 'User-Agent': 'transformers.js-hf-proxy', Accept: '*/*' },
    });
  } catch {
    return new Response('Upstream fetch failed', { status: 502 });
  }
  if (!upstream.ok) return new Response(`Upstream ${upstream.status}`, { status: upstream.status });

  const headers = new Headers(upstream.headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Access-Control-Allow-Origin', '*');
  const resp = new Response(upstream.body, { status: 200, headers });
  context.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
  });
}
