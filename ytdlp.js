'use strict';

/**
 * yt-dlp 子进程封装。
 *
 * 用途：
 *  1) 作为 douyin.js 的兜底解析器（-J dump-json）
 *  2) 视频下载 / 提取 MP3
 *
 * 依赖系统已安装 `yt-dlp` 与 `ffmpeg`。
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUA } = require('./limiter');
const { getCookiesPath } = require('../utils/cookies');

const TMP_DIR = process.env.TMP_DIR
  ? path.resolve(process.cwd(), process.env.TMP_DIR)
  : path.resolve(process.cwd(), 'tmp');

function ensureTmp() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  return TMP_DIR;
}

/** 公共参数：UA + Referer + 可选 cookies */
function commonArgs() {
  const args = [
    '--no-playlist',
    '--no-warnings',
    '--add-header',
    'Referer:https://www.douyin.com/',
    '--user-agent',
    randomUA(),
  ];
  const cookies = getCookiesPath();
  if (cookies) args.push('--cookies', cookies);
  return args;
}

/** 执行 yt-dlp，返回 {stdout, stderr} */
function run(args, { timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile('yt-dlp', args, { timeout, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || err.message || '').toString();
        if (/command not found|ENOENT/i.test(msg)) {
          reject(new Error('未检测到 yt-dlp，请先安装：pip3 install yt-dlp'));
          return;
        }
        // 把常见英文报错翻译成可操作的中文提示
        if (/Fresh cookies|Sign in|login required|cookies/i.test(msg)) {
          reject(
            new Error(
              '服务器 IP 被抖音风控，需要 cookies。请按 README 导出 cookies.txt 放到项目根目录后重启服务。'
            )
          );
          return;
        }
        if (/Private|not available|deleted|404/i.test(msg)) {
          reject(new Error('该作品不可访问（可能是私密、已删除或地区限制）。'));
          return;
        }
        if (/timed out|timeout/i.test(msg) || err.killed) {
          reject(new Error('处理超时，请稍后重试或降低 RATE_LIMIT。'));
          return;
        }
        reject(new Error(msg.split('\n').filter(Boolean).slice(-3).join(' | ') || 'yt-dlp 执行失败'));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

/** 用 yt-dlp 抓取元信息，作为解析兜底 */
async function dumpInfo(url) {
  const args = ['-J', ...commonArgs(), url];
  const { stdout } = await run(args, { timeout: 60000 });
  const info = JSON.parse(stdout);

  const images = [];
  if (Array.isArray(info.entries) && info.entries.length) {
    // 图集/多条目
    for (const e of info.entries) {
      if (e.url) images.push(e.url);
      else if (Array.isArray(e.thumbnails) && e.thumbnails.length)
        images.push(e.thumbnails[e.thumbnails.length - 1].url);
    }
  }

  const thumbnail =
    info.thumbnail ||
    (Array.isArray(info.thumbnails) && info.thumbnails.length
      ? info.thumbnails[info.thumbnails.length - 1].url
      : null);

  const isImages = images.length > 0 || /image|photo|album/i.test(info.extractor || '');

  return {
    awemeId: info.id || '',
    pageUrl: info.webpage_url || url,
    type: isImages ? 'images' : 'video',
    title: info.title || info.description || '抖音作品',
    author: info.uploader || info.creator || '未知作者',
    cover: thumbnail,
    images,
    videoUrl: isImages ? null : info.url || null,
    musicUrl: null,
    duration: info.duration ? Math.round(info.duration * 1000) : null,
    stats: {},
    source: 'yt-dlp',
  };
}

/**
 * 下载视频到临时文件。
 * @returns {Promise<string>} 生成的文件绝对路径
 */
async function downloadVideo(url) {
  const dir = ensureTmp();
  const out = path.join(dir, `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp4`);
  const args = ['-f', 'best', '-o', out, ...commonArgs(), url];
  await run(args, { timeout: 300000 });
  if (!fs.existsSync(out)) throw new Error('视频下载失败，未生成文件');
  return out;
}

/**
 * 下载并转 MP3。
 * @returns {Promise<string>} mp3 文件绝对路径
 */
async function downloadMp3(url) {
  const dir = ensureTmp();
  const base = path.join(dir, `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const args = [
    '-x',
    '--audio-format',
    'mp3',
    '--audio-quality',
    '0',
    '-o',
    `${base}.%(ext)s`,
    ...commonArgs(),
    url,
  ];
  await run(args, { timeout: 300000 });
  const file = `${base}.mp3`;
  if (!fs.existsSync(file)) throw new Error('音频转换失败，未生成 MP3');
  return file;
}

/** 删除临时文件（忽略错误） */
function cleanup(file) {
  try {
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  } catch (_) {
    /* ignore */
  }
}

module.exports = { dumpInfo, downloadVideo, downloadMp3, cleanup, ensureTmp, run, TMP_DIR };
