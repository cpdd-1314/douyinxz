'use strict';

/**
 * 抖音解析核心。
 *
 * 流程：
 *   分享链接/短链  ->  还原出 aweme_id  ->  请求抖音接口  ->  归一化成统一结构
 *
 * 说明：
 * - 抖音 web 接口现在需要 a_bogus 签名，纯 Node 手写不现实。
 *   因此这里的策略是：先自己请求一次拿 aweme_detail，
 *   拿到就用我们自己解析（图集支持好）；
 *   拿不到（被风控/签名失效）就回退到 yt-dlp（见 ytdlp.js）。
 * - 无水印视频取 video.play_addr.url_list[0]；带水印的是 download_addr。
 */

const { randomUA, limiter } = require('./limiter');
const { getCookieHeader } = require('../utils/cookies');

const DOUYIN_HEADERS_BASE = {
  'Referer': 'https://www.douyin.com/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

/** 常见分享文案里的 URL 列表可能是纯文本，先抽出所有链接 */
function extractUrls(text) {
  if (!text) return [];
  const re = /https?:\/\/[^\s"'<>，,、；;]+/g;
  const found = text.match(re) || [];
  return found.map((u) => u.replace(/[.,，。]+$/, ''));
}

/** 判断是不是抖音域名（防 SSRF，只允许抖音自家域） */
function isDouyinUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return (
      host === 'douyin.com' ||
      host.endsWith('.douyin.com') ||
      host === 'iesdouyin.com' ||
      host.endsWith('.iesdouyin.com')
    );
  } catch (_) {
    return false;
  }
}

/** 从任意链接里尝试取 aweme_id */
function pickAwemeId(url) {
  if (!url) return null;
  const patterns = [
    /\/video\/(\d{6,})/,
    /\/note\/(\d{6,})/,
    /modal_id=(\d{6,})/,
    /\/share\/video\/(\d{6,})/,
    /\/share\/note\/(\d{6,})/,
    /(\d{15,25})/, // 兜底：长数字串
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

/** 跟随重定向，把短链还原成最终链接 */
async function resolveShortUrl(url) {
  const ua = randomUA();
  const res = await limiter.schedule(() =>
    fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml',
        ...DOUYIN_HEADERS_BASE,
      },
    })
  );
  // fetch 会自动跟随重定向，res.url 即最终地址
  return res.url || url;
}

/**
 * 请求抖音 detail 接口拿原始 aweme_detail。
 * @param {string} awemeId
 * @returns {Promise<object|null>}
 */
async function fetchAwemeDetail(awemeId) {
  const ua = randomUA();
  const api = `https://www.douyin.com/aweme/v1/web/aweme/detail/?device_platform=webapp&aid=6383&channel=channel_pc_web&aweme_id=${awemeId}&pc_client_type=1&version_code=170400&version_name=17.4.0&cookie_enabled=true&platform=PC&downlink=10`;

  const headers = {
    'User-Agent': ua,
    'Referer': `https://www.douyin.com/video/${awemeId}`,
    ...DOUYIN_HEADERS_BASE,
  };
  const cookie = getCookieHeader();
  if (cookie) headers['Cookie'] = cookie;

  const res = await limiter.schedule(() =>
    fetch(api, { headers, redirect: 'follow' })
  );
  if (!res.ok) return null;
  const text = await res.text();
  if (!text || text[0] !== '{') return null; // 常见于返回验证页
  let json;
  try {
    json = JSON.parse(text);
  } catch (_) {
    return null;
  }
  return json && json.aweme_detail ? json.aweme_detail : null;
}

/** 首选项取值 */
function firstUrl(list) {
  if (Array.isArray(list) && list.length) {
    const item = list[0];
    if (typeof item === 'string') return item;
    if (item && Array.isArray(item.url_list)) return item.url_list[0];
  }
  return null;
}

/** 把抖音原生结构归一化成我们前端要的格式 */
function normalizeDetail(detail, fallbackId) {
  if (!detail) return null;

  const awemeId = String(detail.aweme_id || fallbackId || '');
  const desc = detail.desc || '抖音作品';
  const author = (detail.author && (detail.author.nickname || detail.author.unique_id)) || '未知作者';
  const cover =
    firstUrl(detail.video && detail.video.cover && detail.video.cover.url_list) ||
    firstUrl(detail.video && detail.video.origin_cover && detail.video.origin_cover.url_list) ||
    null;

  const isImages = Array.isArray(detail.images) && detail.images.length > 0;

  const result = {
    awemeId,
    pageUrl: `https://www.douyin.com/video/${awemeId}`,
    type: isImages ? 'images' : 'video',
    title: desc,
    author,
    cover,
    images: [],
    videoUrl: null,
    musicUrl: null,
    duration: detail.duration || null,
    stats: {
      digg: detail.statistics ? detail.statistics.digg_count : null,
      comment: detail.statistics ? detail.statistics.comment_count : null,
      collect: detail.statistics ? detail.statistics.collect_count : null,
    },
  };

  if (isImages) {
    result.images = detail.images
      .map((img) => firstUrl(img.url_list))
      .filter(Boolean);
  } else if (detail.video) {
    // 无水印：play_addr（路径含 /tos/cn/）；download_addr 是带水印的
    result.videoUrl =
      firstUrl(detail.video.play_addr && detail.video.play_addr.url_list) ||
      firstUrl(detail.video.play_addr_h264 && detail.video.play_addr_h264.url_list) ||
      null;
  }

  // 原生音乐直链（可能本身是 mp3）
  const music = detail.music || (detail.video && detail.video.music);
  if (music && music.play_url) {
    result.musicUrl = firstUrl(music.play_url.url_list);
  }

  return result;
}

/**
 * 主入口：给一个链接或分享文案，返回归一化作品信息。
 * @param {string} input
 * @param {function} ytdlpFallback  (url) => Promise<normalized|null>
 */
async function parse(input, ytdlpFallback) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('链接为空');

  // 从分享文案里抽链接
  const urls = extractUrls(raw);
  const target = urls.length ? urls[0] : raw;

  if (!isDouyinUrl(target)) {
    throw new Error('仅支持抖音链接（douyin.com / v.douyin.com）');
  }

  // 先试着直接取 id
  let awemeId = pickAwemeId(target);
  let finalUrl = target;

  // 短链需要跟随重定向
  if (!awemeId) {
    finalUrl = await resolveShortUrl(target);
    awemeId = pickAwemeId(finalUrl);
  }

  // 优先走自研接口（图集支持好）
  if (awemeId) {
    try {
      const detail = await fetchAwemeDetail(awemeId);
      const normalized = normalizeDetail(detail, awemeId);
      if (normalized && (normalized.videoUrl || normalized.images.length)) {
        return normalized;
      }
    } catch (_) {
      /* 落到 yt-dlp 回退 */
    }
  }

  // 回退：yt-dlp
  if (typeof ytdlpFallback === 'function') {
    const fb = await ytdlpFallback(finalUrl || target);
    if (fb) return fb;
  }

  throw new Error(
    '解析失败：接口返回空。可能需要提供 cookies.txt（见 README），或该作品为私密/已删除。'
  );
}

module.exports = {
  parse,
  extractUrls,
  isDouyinUrl,
  pickAwemeId,
  resolveShortUrl,
  fetchAwemeDetail,
  normalizeDetail,
};
