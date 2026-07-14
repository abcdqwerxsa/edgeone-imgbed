import { AwsClient } from 'aws4fetch';

/**
 * 规范化 endpoint：去掉协议前缀，返回纯 host（如 s3.bitiful.net）。
 */
function endpointHost(env) {
  return (env.BITIFUL_ENDPOINT || 's3.bitiful.net').replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/** 对象 URL（path-style）：https://s3.bitiful.net/<bucket>/<key> */
export function objectUrl(env, key) {
  return `https://${endpointHost(env)}/${env.BITIFUL_BUCKET}/${encodeURI(key)}`;
}

/** ListObjectsV2 URL：https://s3.bitiful.net/<bucket>?list-type=2&prefix=... */
function listUrl(env, prefix) {
  const qs = new URLSearchParams();
  qs.set('list-type', '2');
  if (prefix) qs.set('prefix', prefix);
  return `https://${endpointHost(env)}/${env.BITIFUL_BUCKET}?${qs.toString()}`;
}

/** 创建 aws4fetch 客户端（每次请求新建，凭证来自 env）。 */
export function createClient(env) {
  return new AwsClient({
    accessKeyId: env.BITIFUL_ACCESS_KEY,
    secretAccessKey: env.BITIFUL_SECRET_KEY,
    service: 's3',
    region: env.BITIFUL_REGION || 'cn-east-1',
    retries: 3,
  });
}

/**
 * 签发 presigned PUT URL（浏览器直传）。
 * 仅签名 host（不把 Content-Type 放进 SignedHeaders），
 * 这样客户端 PUT 时可自由携带 Content-Type，不会造成签名不匹配。
 */
export async function signPresignedPut(env, key, expires = 3600) {
  const aws = createClient(env);
  const url = `${objectUrl(env, key)}?X-Amz-Expires=${expires}`;
  const signed = await aws.sign(new Request(url, { method: 'PUT' }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

/** 签名 GET 并拉取对象（下载代理用）。 */
export async function fetchObject(env, key) {
  const aws = createClient(env);
  return aws.fetch(objectUrl(env, key), { method: 'GET' });
}

/** 列出对象（ListObjectsV2）。返回 [{ key, size, lastModified }]。 */
export async function listObjects(env, prefix = 'img/') {
  const aws = createClient(env);
  const res = await aws.fetch(listUrl(env, prefix), { method: 'GET' });
  if (!res.ok) {
    throw new Error(`list failed: ${res.status} ${await res.text().catch(() => '')}`);
  }
  return parseListXml(await res.text());
}

/** 删除对象。 */
export async function deleteObject(env, key) {
  const aws = createClient(env);
  return aws.fetch(objectUrl(env, key), { method: 'DELETE' });
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
