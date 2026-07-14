import { signV4 } from './sigv4.js';

/**
 * Bitiful S3 操作。签名用自实现 SigV4（见 sigv4.js），不依赖 aws4fetch。
 */

function endpointHost(env) {
  return (env.BITIFUL_ENDPOINT || 's3.bitiful.net').replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

function creds(env) {
  return {
    accessKeyId: env.BITIFUL_ACCESS_KEY,
    secretAccessKey: env.BITIFUL_SECRET_KEY,
    region: env.BITIFUL_REGION || 'cn-east-1',
    service: 's3',
  };
}

/** 对象 URL（path-style）：https://s3.bitiful.net/<bucket>/<key> */
export function objectUrl(env, key) {
  return `https://${endpointHost(env)}/${env.BITIFUL_BUCKET}/${encodeURI(key)}`;
}

/** 签发 presigned PUT URL（浏览器直传）。 */
export async function signPresignedPut(env, key, expires = 3600) {
  const signed = await signV4({ method: 'PUT', url: objectUrl(env, key), expires, ...creds(env) });
  return signed.url;
}

/** 签名 GET 并拉取对象（下载代理用）。 */
export async function fetchObject(env, key) {
  const signed = await signV4({ method: 'GET', url: objectUrl(env, key), ...creds(env) });
  return fetch(signed.url, { method: 'GET', headers: signed.headers });
}

/** 列出对象（ListObjectsV2）。返回 [{ key, size, lastModified }]。 */
export async function listObjects(env, prefix = 'img/') {
  const url = `https://${endpointHost(env)}/${env.BITIFUL_BUCKET}?list-type=2&prefix=${encodeURIComponent(prefix)}`;
  const signed = await signV4({ method: 'GET', url, ...creds(env) });
  const res = await fetch(signed.url, { method: 'GET', headers: signed.headers });
  if (!res.ok) {
    throw new Error(`list failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
  return parseListXml(await res.text());
}

/** 删除对象。 */
export async function deleteObject(env, key) {
  const signed = await signV4({ method: 'DELETE', url: objectUrl(env, key), ...creds(env) });
  return fetch(signed.url, { method: 'DELETE', headers: signed.headers });
}

/** 轻量解析 ListObjectsV2 XML（边缘运行时无 DOMParser，用正则）。 */
function parseListXml(xml) {
  const items = [];
  const re = /<Contents>([\s\S]*?)<\/Contents>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    items.push({
      key: pick(m[1], 'Key'),
      size: Number(pick(m[1], 'Size') || 0),
      lastModified: pick(m[1], 'LastModified'),
    });
  }
  return items;
}

function pick(block, tag) {
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(block);
  return m ? m[1] : '';
}
