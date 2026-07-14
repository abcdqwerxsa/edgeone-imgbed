import { signPresignedPut } from '../../src/lib/s3.js';
import { requireToken, unauthorized } from '../../src/lib/auth.js';
import { generateKey, ALLOWED_TYPES, jsonResponse } from '../../src/lib/utils.js';

/**
 * POST /api/upload
 * Body: { "filename": string, "contentType": string }
 * Header: Authorization: Bearer <UPLOAD_TOKEN>
 * 返回 presigned PUT URL，浏览器拿到后直接 PUT 文件到 Bitiful（绕过 1MB 限制）。
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

  const filename = typeof body?.filename === 'string' ? body.filename : '';
  const contentType = typeof body?.contentType === 'string' ? body.contentType.toLowerCase() : '';

  if (!filename) {
    return jsonResponse({ error: 'filename is required' }, 400);
  }

  // 校验/推导类型：若客户端给了 contentType 必须在白名单内
  let type = contentType;
  if (!type) {
    // 未提供则不强制（允许任意扩展名），但下载时按扩展名猜 MIME
    type = '';
  } else if (!ALLOWED_TYPES[type]) {
    return jsonResponse({ error: `Unsupported content type: ${contentType}` }, 400);
  }

  const key = generateKey(filename, type);

  let uploadUrl;
  try {
    uploadUrl = await signPresignedPut(env, key, 3600);
  } catch (e) {
    return jsonResponse({ error: `sign failed: ${e?.message || e}` }, 500);
  }

  const base = new URL(request.url);
  const origin = `${base.protocol}//${base.host}`;
  const viewUrl = `${origin}/i/${key}`;

  return jsonResponse({ uploadUrl, viewUrl, key, contentType: type });
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
