/**
 * 自实现 AWS SigV4 签名。
 *
 * 为什么自实现（不用 aws4fetch）：
 *   aws4fetch 内部 `[...url.searchParams]` 依赖 URLSearchParams 可迭代，
 *   而 EdgeOne 边缘运行时的 URL.searchParams 不可迭代/缺失。
 *
 * 为什么 header 用普通 Map 而非 Headers 对象：
 *   EdgeOne 运行时的 Headers 迭代/forEach 行为不完整，会导致 Authorization 头
 *   签名的 SignedHeaders 算错（GET/列表/删除签名失效）。用 Map + 普通 object 完全规避。
 *
 * 只用 crypto.subtle + 基本字符串/URL 属性（host/pathname/search/protocol 已验证可用）。
 * 返回可直接用于 fetch 的 { method, url, headers }（headers 为普通对象）。
 * 提供 expires → presigned（签名进 query）；否则 → Authorization 头。
 */

const enc = new TextEncoder();

async function hmac(key, data) {
  const k = typeof key === 'string' ? enc.encode(key) : key;
  const ck = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', ck, enc.encode(data));
}

async function sha256Hex(input) {
  const buf = typeof input === 'string' ? enc.encode(input) : input;
  return hex(await crypto.subtle.digest('SHA-256', buf));
}

function hex(ab) {
  const b = new Uint8Array(ab);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

// RFC3986 编码：encodeURIComponent 后再编码 !'()*
function pct(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// 手动解析 query 字符串为 [k,v] 对（不依赖 URLSearchParams 迭代）
function parseQuery(qs) {
  const out = [];
  if (!qs) return out;
  for (const part of qs.split('&')) {
    if (part === '') continue;
    const eq = part.indexOf('=');
    const k = eq === -1 ? part : part.slice(0, eq);
    const v = eq === -1 ? '' : part.slice(eq + 1);
    out.push([decodeURIComponent(k.replace(/\+/g, ' ')), decodeURIComponent(v.replace(/\+/g, ' '))]);
  }
  return out;
}

function buildCanonicalQuery(pairs) {
  return pairs
    .map(([k, v]) => [pct(k), pct(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map((p) => p.join('='))
    .join('&');
}

const UNSIGNABLE = new Set([
  'authorization', 'content-length', 'content-type', 'user-agent',
  'expect', 'x-amzn-trace-id', 'range', 'connection',
]);

export async function signV4({ method, url, headers = {}, expires, accessKeyId, secretAccessKey, region, service = 's3' }) {
  if (accessKeyId == null) throw new TypeError('accessKeyId required');
  if (secretAccessKey == null) throw new TypeError('secretAccessKey required');

  const u = new URL(url);
  const host = u.host;
  const origin = `${u.protocol}//${host}`;

  // canonical URI（S3：decode→encode→保留斜杠→rfc3986）
  let rawPath;
  try {
    rawPath = decodeURIComponent(u.pathname.replace(/\+/g, ' '));
  } catch {
    rawPath = u.pathname;
  }
  const canonicalUri = pct(rawPath).replace(/%2F/gi, '/');

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  // 用普通 Map 管理 header（小写 name），避免依赖 Headers 迭代
  const hm = new Map();
  if (headers && typeof headers === 'object') {
    for (const k of Object.keys(headers)) hm.set(k.toLowerCase(), String(headers[k]));
  }
  hm.delete('host');
  if (!expires) {
    hm.set('x-amz-date', amzDate);
    if (!hm.has('x-amz-content-sha256')) hm.set('x-amz-content-sha256', 'UNSIGNED-PAYLOAD');
  }

  // 要签名的 header 名（去掉 UNSIGNABLE），加 host，排序
  const signNames = ['host'];
  for (const name of hm.keys()) {
    if (!UNSIGNABLE.has(name)) signNames.push(name);
  }
  signNames.sort();
  const signedHeaders = signNames.join(';');
  const canonicalHeaders = signNames
    .map((n) => {
      const val = n === 'host' ? host : (hm.get(n) || '').trim().replace(/\s+/g, ' ');
      return n + ':' + val;
    })
    .join('\n');

  let queryPairs = parseQuery(u.search.slice(1));
  if (expires) {
    queryPairs = queryPairs.filter(([k]) => k.toLowerCase() !== 'x-amz-signature');
    queryPairs.push(['X-Amz-Algorithm', 'AWS4-HMAC-SHA256']);
    queryPairs.push(['X-Amz-Credential', `${accessKeyId}/${credentialScope}`]);
    queryPairs.push(['X-Amz-Date', amzDate]);
    queryPairs.push(['X-Amz-Expires', String(expires)]);
    queryPairs.push(['X-Amz-SignedHeaders', signedHeaders]);
  }

  const cQuery = buildCanonicalQuery(queryPairs);
  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    cQuery,
    canonicalHeaders + '\n',
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');

  const kDate = await hmac('AWS4' + secretAccessKey, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = hex(await hmac(kSigning, stringToSign));

  if (expires) {
    return { method, url: `${origin}${canonicalUri}?${cQuery}&X-Amz-Signature=${signature}`, headers: {} };
  }

  const outHeaders = {};
  for (const [name, val] of hm) outHeaders[name] = val;
  outHeaders.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const finalQuery = cQuery ? `?${cQuery}` : '';
  return { method, url: `${origin}${canonicalUri}${finalQuery}`, headers: outHeaders };
}
