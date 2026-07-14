import { listObjects } from '../../src/lib/s3.js';
import { requireToken } from '../../src/lib/auth.js';
import { jsonResponse } from '../../src/lib/utils.js';

/**
 * GET /api/list?prefix=img/
 * Header: Authorization: Bearer <UPLOAD_TOKEN>
 * 返回已上传图片列表（按时间倒序）。
 */
export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await requireToken(request, env);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix') || 'img/';

  let objects;
  try {
    objects = await listObjects(env, prefix);
  } catch (e) {
    return jsonResponse({ error: e?.message || 'list failed' }, 502);
  }

  const origin = `${url.protocol}//${url.host}`;
  const items = objects
    .filter((o) => o.key && !o.key.endsWith('/'))
    .map((o) => ({
      key: o.key,
      size: o.size,
      time: o.lastModified,
      viewUrl: `${origin}/i/${o.key}`,
    }))
    .sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : 0));

  return jsonResponse({ items });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
