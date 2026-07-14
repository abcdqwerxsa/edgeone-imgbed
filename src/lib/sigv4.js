/**
 * 自实现 AWS SigV4 签名。
 * 为什么不用 aws4fetch：aws4fetch 内部 `[...url.searchParams]` 依赖
 * URLSearchParams 可迭代，而 EdgeOne 边缘运行时的 URL.searchParams 不可迭代/缺失，
 * 导致 "this.url.searchParams is not iterable"。
 * 本实现只用 crypto.subtle + 基本字符串/URL 属性（host/pathname/search，均已验证可用），
 * 完全不碰 searchParams 迭代。
 *
 * 返回可直接用于 fetch 的 { method, url, headers }。
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

  const H = new Headers(headers);
  H.delete('host');

  if (!expires) {
    H.set('X-Amz-Date', amzDate);
    if (!H.has('X-Amz-Content-Sha256')) H.set('X-Amz-Content-Sha256', 'UNSIGNED-PAYLOAD');
  }

  // 用 forEach 收集 header 名（回调式，比迭代器协议更普适）
  const headerNames = [];
  H.forEach((value, name) => {
    if (!UNSIGNABLE.has(name.toLowerCase())) headerNames.push(name);
  });
  const signList = ['host', ...headerNames].sort();
  const signedHeaders = signList.join(';');
  const canonicalHeaders = signList
    .map((n) => `${n}:${n === 'host' ? host : (H.get(n) || '').trim().replace(/\s+/g, ' ')}`)
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
    return { method, url: `${origin}${canonicalUri}?${cQuery}&X-Amz-Signature=${signature}`, headers: new Headers() };
  }

  const out = new Headers(H);
  out.set(
    'Authorization',
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  );
  const finalQuery = cQuery ? `?${cQuery}` : '';
  return { method, url: `${origin}${canonicalUri}${finalQuery}`, headers: out };
}
