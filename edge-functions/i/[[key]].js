import { fetchObject } from '../../src/lib/s3.js';
import { guessMime } from '../../src/lib/utils.js';

/**
 * GET /i/<key>  ——  下载代理（私有桶永久外链）。
 * 边缘函数用密钥签名 GET 从 Bitiful 拉取，流式返回并交给边缘节点缓存。
 * 不需要鉴权：图床外链要能被任何人/任何站点访问。
 *
 * 从 URL path 解析 key，避免依赖 catch-all 参数的数组形态差异：
 *   /i/img/20260714/abc.png  →  img/20260714/abc.png
 */
export async function onRequestGet(context) {
  const { request, env } = context;

  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.replace(/^\/i\/?/, ''));
  if (!key || key.includes('..')) {
    return new Response('Not Found', { status: 404 });
  }

  let upstream;
  try {
    upstream = await fetchObject(env, key);
  } catch {
    return new Response('Bad Gateway', { status: 502 });
  }

  if (upstream.status === 404 || upstream.status === 403) {
    return new Response('Not Found', { status: 404 });
  }
  if (!upstream.ok) {
    return new Response(`Upstream error: ${upstream.status}`, { status: 502 });
  }

  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('Content-Type') || guessMime(key));
  const len = upstream.headers.get('Content-Length');
  if (len) headers.set('Content-Length', len);
  const etag = upstream.headers.get('ETag');
  if (etag) headers.set('ETag', etag);
  headers.set('Cache-Control', 'public, max-age=86400, immutable');
  headers.set('Access-Control-Allow-Origin', '*');

  // 流式透传（ReadableStream），大图不受请求体 1MB 限制（下载无请求体）
  return new Response(upstream.body, { status: 200, headers });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
  });
}
