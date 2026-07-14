# imgbed — Cloudflare Pages + Bitiful S3 图床

基于 **Cloudflare Pages（Pages Functions）** + **Bitiful**（S3 兼容对象存储）的图床服务。
私有桶 + 预签名直传 + 边缘函数代理下载，得到**永久外链**。

> 已从 EdgeOne 迁移至 Cloudflare（Cloudflare 运行时 `URL.searchParams` 可迭代，自实现签名器照样兼容）。

## 工作原理

```
上传（绕过边缘函数请求体限制）：
  浏览器 --POST /api/upload (Token)--> Pages Function
  函数(自实现 SigV4 签名) --> 返回 presigned PUT URL
  浏览器 --PUT 文件(直传)--> s3.bitiful.net   ← 需配 Bitiful CORS

下载（私有桶永久外链）：
  任意访客 --GET https://你的域名/i/<key>--> Pages Function
  函数(签名GET) --> s3.bitiful.net --> 流式返回 + 边缘缓存
```

- **上传**：函数只签发预签名 URL，文件字节不经函数 → 支持任意大小图片。
- **下载**：函数用密钥签名拉取私有桶对象再返回，`/i/<key>` 即永久外链。
- **鉴权**：上传/列表/删除需 `UPLOAD_TOKEN`；外链下载开放。
- 无数据库：bucket 即数据源。
- 签名用 `src/lib/sigv4.js` 自实现 SigV4（纯 `crypto.subtle`，不依赖 `URL.searchParams` 迭代）。

## 目录结构

```
imgbed/
├── wrangler.jsonc             # Cloudflare Pages 配置（pages_build_output_dir=./public）
├── package.json               # 无外部依赖
├── .env / .env.example        # 本地凭证（.env 已 gitignore）
├── functions/                 # Pages Functions（onRequestPost / context.env）
│   ├── api/{upload,list,delete}.js
│   └── i/[[key]].js           # 下载代理（永久外链）
├── src/lib/{sigv4,s3,auth,utils}.js  # 自实现 SigV4 / S3 操作 / token 鉴权 / 工具
└── public/{index.html,app.js,style.css}  # 上传网页 UI（浅色画廊风）
```

## 第 0 步：配置 Bitiful 桶 CORS（必需）

浏览器直传 `s3.bitiful.net` 必须配 CORS，否则 PUT 被浏览器拦截。
在 Bitiful 控制台 → bucket → CORS 加入（`AllowedOrigins` 换成你的域名）：

```json
[
  {
    "AllowedOrigins": ["https://imgbed-36x.pages.dev", "http://localhost:8788"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

> 桶保持**私有**。自定义域名时把域名补进 `AllowedOrigins`。

## 第 1 步：本地开发

```bash
npm install              # 实际无运行时依赖
cp .env.example .env     # 填入 Bitiful 凭证与自定义 UPLOAD_TOKEN
npx wrangler login       # 首次登录
npx wrangler pages dev ./public --compatibility-date=2025-07-01   # 本地 dev（默认 8788）
```

打开 `http://localhost:8788`：点右上「未设置 Token」填入 `UPLOAD_TOKEN`，拖图上传。
（本地直传 Bitiful 需 CORS 含 `http://localhost:8788`。）

## 第 2 步：部署到 Cloudflare Pages

```bash
# 1) 创建项目（一次性；pages.dev 名字全局唯一）
npx wrangler pages project create imgbed --production-branch main

# 2) 注入密钥（每个独立执行，会提示输入值；或用 printf 管道传入）
npx wrangler pages secret put BITIFUL_ACCESS_KEY   --project-name imgbed
npx wrangler pages secret put BITIFUL_SECRET_KEY   --project-name imgbed
npx wrangler pages secret put BITIFUL_BUCKET       --project-name imgbed   # demo13234
npx wrangler pages secret put BITIFUL_ENDPOINT     --project-name imgbed   # s3.bitiful.net
npx wrangler pages secret put BITIFUL_REGION       --project-name imgbed   # cn-east-1
npx wrangler pages secret put UPLOAD_TOKEN         --project-name imgbed   # 你的随机串

# 3) 部署（静态资源 + Functions）
npx wrangler pages deploy ./public --project-name imgbed --branch main
```

部署后得到 `https://<name>.pages.dev`，**对任何人公开可访问**（Cloudflare 无 EdgeOne 那套预览域名限制）。

> 后续代码更新后重跑第 3 步即可。或关联 GitHub 仓库实现 push 自动部署。

## 第 3 步：收尾

1. 把 `.pages.dev` 域名（或自定义域名）补进 Bitiful CORS。
2. （建议）在 Bitiful 为图床单独建子账号，仅授予 `demo13234/img/*` 读写权限。
3. **安全**：AK/SK 曾明文出现过，建议在 Bitiful 轮换并更新密钥。

## API 参考

所有 `/api/*` 需 `Authorization: Bearer <UPLOAD_TOKEN>`。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/upload` | body `{filename, contentType}` → `{uploadUrl, viewUrl, key}`；客户端再 PUT 文件到 `uploadUrl` |
| GET | `/api/list?prefix=img/` | `{items:[{key,size,time,viewUrl}]}`（按时间倒序） |
| DELETE | `/api/delete?key=img/...` | 删除（仅允许 `img/` 前缀） |
| GET | `/i/<key>` | **下载代理（外链，无需鉴权）**，边缘缓存 1 天 |

## 自测

```bash
node scripts/selftest.mjs   # 用 .env 凭证验证 签名/上传/下载/列表/删除
```

## 参考文档

- Cloudflare Pages Functions：https://developers.cloudflare.com/pages/functions/
- wrangler 配置：https://developers.cloudflare.com/workers/wrangler/configuration/
- AWS SigV4（本项目自实现于 `src/lib/sigv4.js`）：https://github.com/mhart/aws4fetch
- Bitiful：https://www.bitiful.com/ ｜ 文档 https://docs.bitiful.com/
