# douyinxz · 抖音下载器

无水印下载抖音 **视频 / 图集照片 / MP3 音频** 的自托管工具。前端原生 HTML/CSS/JS，后端 Node.js + yt-dlp + ffmpeg。

> ⚠️ **免责声明**：本项目仅供个人学习与研究使用。请勿用于商业用途或大规模抓取；请尊重创作者版权，不要传播他人作品；不绕过登录、付费等访问限制。使用产生的任何法律风险由使用者自行承担。

---

## 功能

| 功能 | 说明 |
|---|---|
| 📹 视频下载 | 获取无水印原片（取 `play_addr`，非带水印的 `download_addr`） |
| 🖼️ 图集下载 | 解析 `images[].url_list`，一键批量下载全部原图 |
| 🎵 MP3 音频 | 优先取原生音乐直链；否则用 ffmpeg 从视频提取转码 |
| 📋 批量解析 | 一次粘贴多条链接（每行一条 / 或直接粘贴分享文案） |
| ⚠️ 声明弹窗 | 首次访问强制阅读并同意免责声明后才能使用 |
| 🛡️ 防风控 | 内置令牌桶限流 + 移动端 UA 轮换 |
| 🍪 cookies 支持 | 服务器被风控时可注入浏览器 cookies 恢复解析 |

---

## 环境要求

- **Node.js** ≥ 18
- **yt-dlp** —— 解析与音视频处理核心
- **ffmpeg** —— MP3 转码

```bash
# 安装 yt-dlp
pip3 install -U yt-dlp

# 安装 ffmpeg（Ubuntu/Debian）
sudo apt install -y ffmpeg
# macOS: brew install ffmpeg
```

---

## 快速开始

```bash
# 1. 安装依赖
pnpm install      # 或 npm install

# 2. 配置环境变量（可选）
cp .env.example .env

# 3. 启动
pnpm start        # 或 npm start

# 4. 打开浏览器
#    http://localhost:3000
```

在输入框粘贴抖音链接（支持分享文案），点击「开始解析」。

> **首次访问会弹出声明确认框**，勾选「我已阅读并同意」并点击按钮后才能进入主界面。
> 同意状态记录在浏览器 `localStorage`（键名 `douyinxz_consent_v1`），后续访问不再打扰。
> 若修改了声明内容并希望所有用户重新确认，把 `public/js/app.js` 中的 `CONSENT_KEY` 版本号递增即可（如 `v2`）。

---

## cookies 配置（重要）

抖音对**服务器 IP** 有严格风控，直接解析常返回：

```
Fresh cookies (not necessarily logged in) are needed
```

此时需要提供浏览器 cookies：

1. 浏览器安装扩展 **Get cookies.txt LOCALLY**（Chrome / Edge 商店可搜）
2. 打开 https://www.douyin.com 并**登录**
3. 点击扩展图标 → **Export** → 保存为 `cookies.txt`
4. 把 `cookies.txt` 放到**项目根目录**
5. 重启服务

> `cookies.txt` 已在 `.gitignore` 中排除，**不会**被提交到 GitHub。
> cookies 等同于你的登录态，切勿分享。

可在浏览器访问 `/api/health` 查看当前 cookies 状态：

```json
{ "ok": true, "ytdlp": "2026.08.19", "cookies": true, "rateLimit": "1" }
```

---

## API 说明

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/health` | 环境自检（yt-dlp 版本 / cookies / 限流） |
| `POST` | `/api/parse` | 解析链接，body: `{ "input": "链接或分享文案" }` |
| `GET` | `/api/proxy?url=&name=` | 转发抖音 CDN 直链（加 Referer 绕防盗链），作为附件下载 |
| `GET` | `/api/media?url=&format=` | 服务端 yt-dlp 处理，`format=video\|mp3` |

```bash
# 示例：解析
curl -X POST http://localhost:3000/api/parse \
  -H 'Content-Type: application/json' \
  -d '{"input":"https://v.douyin.com/xxxxxxx/"}'
```

---

## 项目结构

```
douyinxz/
├── server/
│   ├── index.js              # Express 入口（静态托管 + 路由 + /api/health）
│   ├── routes/
│   │   ├── parse.js          # POST /api/parse  批量解析
│   │   └── download.js       # /api/proxy 转发 + /api/media 转码
│   ├── services/
│   │   ├── douyin.js         # 短链还原 + 视频/图集解析（自研图集逻辑）
│   │   ├── ytdlp.js          # yt-dlp 子进程封装（下载 / MP3 / 兜底解析）
│   │   └── limiter.js        # 令牌桶限流 + UA 池
│   └── utils/cookies.js      # cookies.txt 读取与注入
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── cookies.txt.example
├── .env.example
└── package.json
```

---

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | 服务端口 |
| `RATE_LIMIT` | `1` | 每秒请求数上限，过高会触发风控，建议 0.5~1 |
| `COOKIES_PATH` | `./cookies.txt` | cookies 文件路径 |
| `TMP_DIR` | `./tmp` | 临时文件目录（自动清理） |

---

## 常见问题

**Q：解析返回「接口返回空」/「Fresh cookies needed」？**
A：服务器 IP 被风控。按上面「cookies 配置」提供 `cookies.txt` 后重启即可。

**Q：下载的视频带水印？**
A：本工具取的是 `video.play_addr`（无水印）。若仍带水印，可能是该作品只提供带水印源。

**Q：MP3 转码很慢？**
A：首次需下载完整视频再转码，取决于视频大小与网络。

**Q：解析经常失败？**
A：把 `RATE_LIMIT` 调低（如 `0.5`），并确保 `yt-dlp -U` 保持最新——抖音接口变动频繁。

---

## 部署到 GitHub

本仓库已包含完整可运行代码。**推荐用一键脚本推送**：

### 方式一：一键脚本（推荐）

```bash
# 1. 解压
tar -xzf douyinxz-full.tar.gz
cd douyinxz

# 2. 一键推送（Token 已内置，无需粘贴）
bash git-push.sh

# 3. 打开验证
#    https://github.com/cpdd-1314/douyinxz
```

脚本会自动完成 `git add` → `commit` → `push`，失败时会分类提示原因
（网络不通 / Token 失效 / 分支保护）。

> 若之后要替换 Token：`GITHUB_TOKEN=新token bash git-push.sh`
> 或先 `export GITHUB_TOKEN=新token` 再执行。

### 方式二：手动命令

```bash
git init
git add .
git commit -m "feat: 抖音下载器（视频/图集/MP3）"
git remote add origin https://github.com/cpdd-1314/douyinxz.git
git branch -M main
git push -u origin main
```

### 方式三：网页上传（无需命令行）

1. 打开 https://github.com/cpdd-1314/douyinxz
2. 点击 **Add file → Upload files**
3. 把项目文件（**不含** `node_modules`）拖进去
4. 填写提交信息 → **Commit changes**

> 注意：GitHub Pages **只能托管静态文件**，无法运行本项目的 Node 后端。
> 若要在线使用，需把后端部署到可运行 Node 的环境（如自己的服务器、Render、Railway 等），前端再指向该后端地址。

---

## 后续可扩展

- 图集后端 ZIP 打包（`archiver`）
- 解析结果缓存，减少重复请求
- 下载历史 / 收藏（localStorage）
- 合集、用户主页批量下载（风控与合规风险更高，需谨慎）

---

## License

MIT（仅供学习研究）

---

## 关于本包（简单版）

本包只包含**运行必需**的文件，方便直接上传/分发。相比完整版少了 3 个可选文件：

| 缺失文件 | 作用 | 是否需要 |
|---|---|---|
| `.gitignore` | 告诉 git 忽略哪些文件 | **不需要**，代码零引用 |
| `.env.example` | 配置模板 | **不需要**，端口等有默认值 |
| `cookies.txt.example` | cookies 说明 | **不需要**，见下方 cookies 章节 |

> 以上三个文件对运行**完全没有影响**（已实测验证）。
> 如需 `.gitignore`，可自行新建一个同名文件（内容写 `node_modules/`、`tmp/`、`cookies.txt` 即可）。

**快速开始：**

```bash
pnpm install    # 或 npm install
pnpm start      # 或 npm start
# 打开 http://localhost:3000
```
