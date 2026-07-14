import { deleteObject } from '../../src/lib/s3.js';
import { requireToken } from '../../src/lib/auth.js';
import { jsonResponse } from '../../src/lib/utils.js';

/**
 * DELETE /api/delete?key=img/20260714/xxx.png
 * Header: Authorization: Bearer <UPLOAD_TOKEN>
 */
export async function onRequestDelete(context) {
  const { request, env } = context;

  const auth = await requireToken(request, env);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  if (!key) {
    return jsonResponse({ error: 'key is required' }, 400);
  }
  // 只允许删除 img/ 前缀下的对象，最小化误删风险
  if (!key.startsWith('img/')) {
    return jsonResponse({ error: 'forbidden key prefix' }, 403);
  }

  let res;
  try {
    res = await deleteObject(env, key);
  } catch (e) {
    return jsonResponse({ error: e?.message || 'delete failed' }, 502);
  }

  if (!res.ok) {
    return jsonResponse({ error: `delete failed: ${res.status}` }, 502);
  }
  return jsonResponse({ ok: true, key });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
