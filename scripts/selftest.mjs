/**
 * 端到端自测：用真实凭证验证 Bitiful 的 SigV4 签名链路。
 * 直接 import src/lib/s3.js 里的函数（即边缘函数将使用的同一套代码）。
 * 用法： node scripts/selftest.mjs   （读取项目根 .env）
 */
import { readFileSync } from 'node:fs';
import { signPresignedPut, fetchObject, listObjects, deleteObject, objectUrl } from '../src/lib/s3.js';

function loadEnv() {
  try {
    const text = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    for (const line of text.split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* 无 .env 则依赖已存在的环境变量 */
  }
}
loadEnv();

const env = {
  BITIFUL_ACCESS_KEY: process.env.BITIFUL_ACCESS_KEY,
  BITIFUL_SECRET_KEY: process.env.BITIFUL_SECRET_KEY,
  BITIFUL_BUCKET: process.env.BITIFUL_BUCKET,
  BITIFUL_ENDPOINT: process.env.BITIFUL_ENDPOINT,
  BITIFUL_REGION: process.env.BITIFUL_REGION,
};

for (const [k, v] of Object.entries(env)) {
  if (!v) {
    console.error(`❌ 缺少环境变量 ${k}`);
    process.exit(1);
  }
}
console.log(`桶: ${env.BITIFUL_BUCKET}  endpoint: ${env.BITIFUL_ENDPOINT}  region: ${env.BITIFUL_REGION}\n`);

const key = `img/_selftest/${Date.now()}.txt`;
const payload = `edgeone-imgbed selftest ${Date.now()}`;
let failed = false;

async function step(name, fn) {
  process.stdout.write(`${name} ... `);
  try {
    await fn();
  } catch (e) {
    failed = true;
    console.log('✗');
    console.error('   ', e?.message || e);
  }
}

await step('1) ListObjectsV2 (prefix=img/)', async () => {
  const list = await listObjects(env, 'img/');
  console.log(`✓ 共 ${list.length} 个条目`);
});

await step('2) presigned PUT 直传', async () => {
  const uploadUrl = await signPresignedPut(env, key, 600);
  const put = await fetch(uploadUrl, { method: 'PUT', body: payload });
  if (!put.ok) throw new Error(`PUT ${put.status}: ${await put.text()}`);
  console.log(`✓ ${put.status}`);
});

await step('3) 签名 GET 读回校验', async () => {
  const res = await fetchObject(env, key);
  const text = await res.text();
  if (text !== payload) throw new Error(`内容不一致: ${text}`);
  console.log(`✓ ${res.status} 内容一致`);
});

await step('4) DELETE 清理', async () => {
  const res = await deleteObject(env, key);
  if (!(res.ok || res.status === 204)) throw new Error(`DELETE ${res.status}`);
  console.log(`✓ ${res.status}`);
});

console.log(`\nobjectUrl 示例: ${objectUrl(env, 'img/20260714/abc.png')}`);

if (failed) {
  console.log('\n❌ 自测未全部通过，请按上面的错误排查。');
  process.exit(1);
}
console.log('\n✅ 全部通过：凭证、桶、SigV4 签名（列表/上传/下载/删除）均正常。');
