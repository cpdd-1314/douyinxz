'use strict';

/**
 * 抖音下载站 - 服务入口
 * 前端静态托管 + 解析/下载 API
 */

const path = require('path');
const fs = require('fs');
const express = require('express');

// 轻量加载 .env（不引入 dotenv 依赖）
(function loadEnv() {
  const p = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(p)) return;
  try {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch (_) {
    /* ignore */
  }
})();

const parseRouter = require('./routes/parse');
const downloadRouter = require('./routes/download');
const { hasCookies } = require('./utils/cookies');
const { ensureTmp, run } = require('./services/ytdlp');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// 健康检查 & 环境自检
app.get('/api/health', async (_req, res) => {
  let ytdlpVersion = null;
  try {
    const { stdout } = await run(['--version'], { timeout: 15000 });
    ytdlpVersion = stdout.trim();
  } catch (_) {
    ytdlpVersion = null;
  }
  res.json({
    ok: true,
    ytdlp: ytdlpVersion || '未安装',
    cookies: hasCookies(),
    rateLimit: process.env.RATE_LIMIT || '1',
  });
});

app.use('/api', parseRouter);
app.use('/api', downloadRouter);

// 兜底：前端 SPA
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  ensureTmp();
  console.log(`\n  抖音下载站已启动  ->  http://localhost:${PORT}\n`);
  console.log(`  yt-dlp cookies: ${hasCookies() ? '已配置' : '未配置（如解析失败请见 README）'}\n`);
});
