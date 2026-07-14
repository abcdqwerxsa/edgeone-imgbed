# EdgeOne 图床（EdgeOne Makers + Bitiful S3）

基于腾讯云 **EdgeOne Makers** 边缘函数 + **Bitiful**（S3 兼容对象存储）的图床服务。
私有桶 + 预签名直传 + 边缘函数代理下载，得到**永久外链**。

## 工作原理

```
上传（绕过边缘函数 1MB 请求体限制）：
  浏览器 --POST /api/upload (Token)--> 边缘函数
  边缘函数(aws4fetch 签名) --> 返回 presigned PUT URL
  浏览器 --PUT 文件(直传)--> s3.bitiful.net   ← 需配 Bitiful CORS

下载（私有桶永久外链）：
  任意访客 --GET https://你的域名/i/<key>--> 边缘函数
  边缘函数(签名GET) --> s3.bitiful.net --> 流式返回 + 边缘缓存
```

- **上传**：边缘函数只签发预签名 URL，文件字节不经边缘函数 → 支持任意大小图片。
- **下载**：边缘函数用密钥签名拉取私有桶对象再返回，`/i/<key>` 即永久外链。
- **鉴权**：上传/列表/删除需 `UPLOAD_TOKEN`；外链下载开放。
- 无数据库：bucket 即数据源。

## 目录结构

```
edgeone-imgbed/
├── edgeone.json               # Makers 配置（outputDirectory=./public）
├── package.json               # 依赖 aws4fetch
├── .env / .env.example        # 环境变量（.env 已 gitignore）
├── edge-functions/
│   ├── api/{upload,list,delete}.js
│   └── i/[[key]].js           # 下载代理（永久外链）
├── src/lib/{s3,auth,utils}.js # 共享：aws4fetch 客户端 / token 鉴权 / 工具
└── public/{index.html,app.js,style.css}  # 上传网页 UI
```

## 第 0 步：配置 Bitiful 桶 CORS（必需）

浏览器直传 `s3.bitiful.net` 必须配 CORS，否则 PUT 会被浏览器拦截。

在 Bitiful 控制台 → bucket `demo13234` → CORS 配置，加入以下规则
（`AllowedOrigin` 用你自己的域名 + 本地开发地址）：

**JSON 形式（控制台常见）：**
```json
[
  {
    "AllowedOrigins": [
      "https://你的项目域名.edgeone.app",
      "http://localhost:8088"
    ],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD", "DELETE"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

**XML 形式（S3 标准）：**
```xml
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>https://你的项目域名.edgeone.app</AllowedOrigin>
    <AllowedOrigin>http://localhost:8088</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedMethod>DELETE</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>
```

> 桶保持**私有**（不要开公开读）。部署拿到正式域名后，记得把它补进 `AllowedOrigins`。

## 第 1 步：本地开发

```bash
# 1. 安装依赖
npm install

# 2. 填写 .env（仓库已带一份含真实值的 .env，请务必修改 UPLOAD_TOKEN）
#    或用模板：cp .env.example .env 后填写
#    ⚠️ .env 已在 .gitignore，不要提交

# 3. 登录 EdgeOne（选 Global 或 China）
npx edgeone login

# 4. 本地开发（默认 http://localhost:8088）
npx edgeone makers dev
```

打开 `http://localhost:8088`：
1. 点「设置 Token」输入你的 `UPLOAD_TOKEN`。
2. 拖拽图片上传，复制外链。

> 注意：本地 dev 时浏览器直传 Bitiful 需 CORS 含 `http://localhost:8088`（见第 0 步）。

## 第 2 步：部署到 EdgeOne Makers

```bash
# 关联/创建 Makers 项目（首次）
npx edgeone makers init      # 或在控制台新建项目后 npx edgeone makers link

# 配置环境变量（线上，推荐用控制台或下面的命令逐个设置）
# ⚠️ 用你自己的真实值替换下面的 <...>，不要把密钥提交到仓库
npx edgeone makers env set BITIFUL_ACCESS_KEY <your_access_key>
npx edgeone makers env set BITIFUL_SECRET_KEY <your_secret_key>
npx edgeone makers env set BITIFUL_BUCKET     demo13234
npx edgeone makers env set BITIFUL_ENDPOINT   s3.bitiful.net
npx edgeone makers env set BITIFUL_REGION     cn-east-1
npx edgeone makers env set UPLOAD_TOKEN       你的随机串

# 部署
npx edgeone makers deploy
```

部署成功后会得到正式域名（如 `https://edgeone-imgbed-xxx.edgeone.app`）。

## 第 3 步：收尾（部署后）

1. 把正式域名补进 Bitiful CORS 的 `AllowedOrigins`。
2. （建议）在 Bitiful 为图床单独建子账号/Token，仅授予 `demo13234/img/*` 的读写权限（最小权限）。
3. **安全**：AK/SK 曾在对话/`.env` 中明文出现，验证可用后建议在 Bitiful **轮换**一次并更新环境变量。

## API 参考

所有 `/api/*` 接口需 `Authorization: Bearer <UPLOAD_TOKEN>`。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/upload` | body `{filename, contentType}` → 返回 `{uploadUrl, viewUrl, key}`；客户端再 PUT 文件到 `uploadUrl` |
| GET | `/api/list?prefix=img/` | 返回 `{items:[{key,size,time,viewUrl}]}`（按时间倒序） |
| DELETE | `/api/delete?key=img/...` | 删除对象（仅允许 `img/` 前缀） |
| GET | `/i/<key>` | **下载代理（外链，无需鉴权）**，返回图片，边缘缓存 1 天 |

### curl 示例

```bash
# 取上传签名
curl -X POST https://你的域名/api/upload \
  -H "Authorization: Bearer $UPLOAD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filename":"cat.jpg","contentType":"image/jpeg"}'
# => {"uploadUrl":"https://s3.bitiful.net/...?X-Amz-...", "viewUrl":"https://你的域名/i/img/..."}

# 直传文件到 uploadUrl
curl -X PUT "$UPLOAD_URL" -H "Content-Type: image/jpeg" --data-binary @cat.jpg
```

## 常见问题

- **上传报 CORS 错**：Bitiful 桶未配 CORS，或当前域名不在 `AllowedOrigins` 里（见第 0 步）。
- **下载 403/404**：检查 AK/SK 是否正确、对象 key 是否存在；下载用的是签名 GET，需 AK/SK 有读权限。
- **签名失败**：确认 `BITIFUL_REGION`（cn-east-1）、`BITIFUL_ENDPOINT`（s3.bitiful.net）正确。
- **大图下载慢/超时**：边缘函数 fetch 默认超时 15s，超大文件可在函数内通过 `eo.timeoutSetting` 调大；正常图片无影响。

## 参考文档

- EdgeOne Makers Edge Functions：https://pages.edgeone.ai/document/edge-functions
- edgeone.json 配置：https://pages.edgeone.ai/document/edgeone-json
- 边缘函数限制（1MB/200ms）：https://cloud.tencent.com/document/product/1552/81344
- aws4fetch：https://github.com/mhart/aws4fetch
- Bitiful：https://www.bitiful.com/ ｜ 文档 https://docs.bitiful.com/
