import { requireToken } from '../../src/lib/auth.js';
import { jsonResponse } from '../../src/lib/utils.js';

// Workers AI 文生图模型（速度快、文档成熟）
const FLUX_MODEL = '@cf/black-forest-labs/flux-1-schnell';

/**
 * POST /api/gen-bg   body: { prompt, engine?, width?, height? }
 *  - engine=flux（默认）: context.env.AI 调 Flux 生背景图
 *  - engine=agnes: 调外部 AGNES_API_URL（通用适配器，需配 AGNES_API_URL，可选 AGNES_API_KEY）
 * 返回 { image: "data:image/png;base64,..." }
 */
export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireToken(request, env);
  if (!auth.ok) return auth.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  const { prompt, engine = 'flux', width = 1024, height = 1024 } = body || {};
  if (!prompt || typeof prompt !== 'string') {
    return jsonResponse({ error: 'prompt is required' }, 400);
  }

  try {
    if (engine === 'flux') {
      if (!env.AI) return jsonResponse({ error: 'AI binding 未配置（需在 Pages 加 Workers AI 绑定）' }, 500);
      const result = await env.AI.run(FLUX_MODEL, { prompt, width, height });
      const dd = await toDataUrl(result);
      if (!dd) return jsonResponse({ error: '生图失败：返回内容无法识别为图片' }, 502);
      return jsonResponse({ image: dd, engine: 'flux' });
    }

    if (engine === 'agnes') {
      if (!env.AGNES_API_URL) {
        return jsonResponse({ error: 'agnes 未配置（需设 AGNES_API_URL，可选 AGNES_API_KEY）' }, 400);
      }
      const headers = { 'Content-Type': 'application/json' };
      if (env.AGNES_API_KEY) headers['Authorization'] = `Bearer ${env.AGNES_API_KEY}`;
      const res = await fetch(env.AGNES_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt, width, height }),
      });
      if (!res.ok) return jsonResponse({ error: `agnes 请求失败: ${res.status}` }, 502);
      const dd = await agnesToDataUrl(res, env);
      if (!dd) return jsonResponse({ error: 'agnes 返回格式无法识别为图片（需对齐接口）' }, 502);
      return jsonResponse({ image: dd, engine: 'agnes' });
    }

    return jsonResponse({ error: `unknown engine: ${engine}` }, 400);
  } catch (e) {
    return jsonResponse({ error: e?.message || 'gen failed' }, 500);
  }
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/** 把 Workers AI 的生图结果（Response / ArrayBuffer / Uint8Array / ReadableStream / {image:base64}）统一转 dataURL。 */
async function toDataUrl(result) {
  if (!result) return null;
  // { image: <base64 字符串> }
  if (typeof result.image === 'string') {
    return result.image.startsWith('data:') ? result.image : `data:image/png;base64,${result.image}`;
  }
  const src = result.image !== undefined ? result.image : result;
  return bytesToDataUrl(await toBytes(src));
}

async function toBytes(src) {
  if (src instanceof ArrayBuffer) return new Uint8Array(src);
  if (src instanceof Uint8Array) return src;
  if (src instanceof ReadableStream) return new Uint8Array(await new Response(src).arrayBuffer());
  if (src instanceof Response) return new Uint8Array(await src.arrayBuffer());
  if (src && typeof src.arrayBuffer === 'function') return new Uint8Array(await src.arrayBuffer()); // Blob 等
  return null;
}

function bytesToDataUrl(bytes) {
  if (!bytes || bytes.length === 0) return null;
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:image/png;base64,${btoa(bin)}`;
}

/** agnes 通用适配器：兼容直接返回图片、{image:base64/url}、{data:[{url}]}、{url} 几种常见形态。 */
async function agnesToDataUrl(res, env) {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('image/')) {
    return bytesToDataUrl(new Uint8Array(await res.arrayBuffer()));
  }
  const j = await res.json().catch(() => null);
  if (!j) return null;
  if (typeof j.image === 'string') {
    if (j.image.startsWith('http')) return await fetchUrlToDataUrl(j.image, env);
    return j.image.startsWith('data:') ? j.image : `data:image/png;base64,${j.image}`;
  }
  const url = j.url || j.data?.[0]?.url || j.output?.[0] || j.result;
  if (typeof url === 'string' && url.startsWith('http')) return await fetchUrlToDataUrl(url, env);
  if (j.image && typeof j.image !== 'string') return bytesToDataUrl(await toBytes(j.image));
  return null;
}

async function fetchUrlToDataUrl(url, env) {
  const headers = {};
  if (env.AGNES_API_KEY) headers['Authorization'] = `Bearer ${env.AGNES_API_KEY}`;
  const r = await fetch(url, { headers });
  if (!r.ok) return null;
  return bytesToDataUrl(new Uint8Array(await r.arrayBuffer()));
}
