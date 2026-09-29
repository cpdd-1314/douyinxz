'use strict';

const express = require('express');
const douyin = require('../services/douyin');
const ytdlp = require('../services/ytdlp');

const router = express.Router();

/** 校验直链是不是抖音 CDN（防 SSRF / 被当代理） */
function isDouyinCdn(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.endsWith('.douyin.com') ||
      host.endsWith('.douyinvod.com') ||
      host.endsWith('.byteimg.com') ||
      host.endsWith('.bytecdn.cn') ||
      host.endsWith('.zjcdn.com') ||
      host.endsWith('.ixigua.com') ||
      host.endsWith('.pstatp.com') ||
      host.endsWith('.snssdk.com') ||
      host.endsWith('.amemv.com') ||
      host.endsWith('.douyinpic.com') ||
      host.endsWith('.feelgood.cn') ||
      host.endsWith('.bytegoofy.com') ||
      host.endsWith('.douyinstatic.com')
    );
  } catch (_) {
    return false;
  }
}

/**
 * GET /api/proxy?url=xxx&name=xxx
 * 传输直链（加 Referer，绕过防盗链），并作为附件下载。
 */
router.get('/proxy', async (req, res) => {
  const url = req.query.url;
  const name = req.query.name || 'download';
  if (!url || !isDouyinCdn(url)) {
    return res.status(400).json({ error: '无效或不被允许的资源地址' });
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        'Referer': 'https://www.douyin.com/',
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      },
    });
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: '上游资源获取失败' });
    }
    const ctype = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', ctype);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(name)}`
    );
    if (upstream.headers.get('content-length')) {
      res.setHeader('Content-Length', upstream.headers.get('content-length'));
    }

    const reader = upstream.body.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) return res.end();
      res.write(Buffer.from(value));
      await pump();
    };
    await pump();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: '转发失败：' + e.message });
    else res.end();
  }
});

/**
 * GET /api/media?url=xxx&format=video|mp3
 * 服务端用 yt-dlp 处理（当直链拿不到 / 需要转码时走这里）。
 */
router.get('/media', async (req, res) => {
  const url = req.query.url;
  const format = req.query.format || 'video';
  if (!url || !douyin.isDouyinUrl(url)) {
    return res.status(400).json({ error: '无效的抖音链接' });
  }

  let file = null;
  try {
    file = format === 'mp3' ? await ytdlp.downloadMp3(url) : await ytdlp.downloadVideo(url);
    const fname =
      format === 'mp3'
        ? `douyin_${Date.now()}.mp3`
        : `douyin_${Date.now()}.mp4`;
    res.download(file, fname, () => {
      ytdlp.cleanup(file);
    });
  } catch (e) {
    if (file) ytdlp.cleanup(file);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

module.exports = router;
