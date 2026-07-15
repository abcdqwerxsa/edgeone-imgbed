import { requireToken } from '../../src/lib/auth.js';
import { jsonResponse } from '../../src/lib/utils.js';

// Workers AI 文生图模型（速度快、文档成熟）
const FLUX_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const AGNES_MODEL = 'agnes-image-2.1-flash';

/**
 * POST /api/gen-bg   body: { prompt, engine?, width?, height? }
 *  - engine=flux（默认）: context.env.AI 调 Flux 生背景图
 *  - engine=agnes: 调 Agnes Image 2.1 Flash（需配 AGNES_API_URL / AGNES_API_KEY）
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
      if (!env.AGNES_API_URL || !env.AGNES_API_KEY) {
        return jsonResponse({ error: 'agnes 未配置（需设 AGNES_API_URL 和 AGNES_API_KEY）' }, 400);
      }
      const res = await fetch(env.AGNES_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.AGNES_API_KEY}` },
        body: JSON.stringify({
          model: env.AGNES_MODEL || AGNES_MODEL,
          prompt,
          size: `${width}x${height}`,
          return_base64: true,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        return jsonResponse({ error: `agnes ${res.status}: ${t.slice(0, 200)}` }, 502);
      }
      const j = await res.json().catch(() => null);
      const item = j && j.data && j.data[0];
      let dd = null;
      if (item && typeof item.b64_json === 'string' && item.b64_json) {
        dd = `data:image/png;base64,${item.b64_json}`;
      } else if (item && typeof item.url === 'string') {
        const r2 = await fetch(item.url);
        if (r2.ok) dd = bytesToDataUrl(new Uint8Array(await r2.arrayBuffer()));
      }
      if (!dd) return jsonResponse({ error: 'agnes 返回无图片' }, 502);
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

/** Workers AI 生图结果（Response / ArrayBuffer / Uint8Array / ReadableStream / {image:base64}）转 dataURL */
async function toDataUrl(result) {
  if (!result) return null;
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
  if (src && typeof src.arrayBuffer === 'function') return new Uint8Array(await src.arrayBuffer());
  return null;
}

function bytesToDataUrl(bytes) {
  if (!bytes || bytes.length === 0) return null;
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:image/png;base64,${btoa(bin)}`;
}
