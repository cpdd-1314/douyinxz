'use strict';

/**
 * 抖音下载器 - 前端逻辑（原生 JS）
 */

const $ = (sel) => document.querySelector(sel);

const inputEl = $('#input');
const parseBtn = $('#parseBtn');
const clearBtn = $('#clearBtn');
const statusEl = $('#status');
const resultsEl = $('#results');
const emptyEl = $('#empty');
const envHintEl = $('#envHint');

/* ---------- 首次访问：声明确认弹窗 ---------- */
const CONSENT_KEY = 'douyinxz_consent_v1'; // 修改声明内容时，改版本号可强制重新确认

(function initConsent() {
  const mask = $('#consentMask');
  if (!mask) return;
  const check = $('#consentCheck');
  const btn = $('#consentBtn');

  const accepted = (() => {
    try {
      return localStorage.getItem(CONSENT_KEY) === '1';
    } catch (_) {
      return false; // 隐私模式等场景下 localStorage 不可用 -> 每次都提示
    }
  })();

  if (accepted) {
    mask.hidden = true;
    return;
  }

  // 首次访问：显示弹窗并锁定页面滚动
  mask.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => check && check.focus(), 320);

  check.addEventListener('change', () => {
    btn.disabled = !check.checked;
  });

  btn.addEventListener('click', () => {
    if (!check.checked) return;
    try {
      localStorage.setItem(CONSENT_KEY, '1');
    } catch (_) {
      /* 忽略：无法持久化时本次会话仍放行 */
    }
    mask.hidden = true;
    document.body.style.overflow = '';
  });
})();

/** 简单 HTML 转义 */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setStatus(msg, type) {
  statusEl.textContent = msg || '';
  statusEl.className = 'status' + (type ? ' ' + type : '');
}

function setLoading(on) {
  parseBtn.disabled = on;
  parseBtn.querySelector('.btn-label').textContent = on ? '解析中…' : '开始解析';
  parseBtn.querySelector('.spinner').hidden = !on;
}

/** 触发浏览器下载（走后端代理，绕防盗链） */
function downloadViaProxy(url, name) {
  const a = document.createElement('a');
  a.href = `/api/proxy?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** 生成一个卡片 */
function renderCard(item) {
  const card = document.createElement('div');
  card.className = 'card';

  const isImages = item.type === 'images';
  const cover = item.cover
    ? `<img class="card-cover" src="${esc(item.cover)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=\\'card-cover ph\\'>▢</div>'"/>`
    : `<div class="card-cover ph">▢</div>`;

  const stats = [];
  if (item.stats && item.stats.digg != null) stats.push(`赞 ${item.stats.digg}`);
  if (item.stats && item.stats.comment != null) stats.push(`评论 ${item.stats.comment}`);
  if (isImages) stats.push(`${item.images.length} 张图`);

  let btns = '';
  if (isImages) {
    btns += `<button class="mini" data-act="images">下载全部图片 (${item.images.length})</button>`;
  } else if (item.videoUrl) {
    btns += `<button class="mini" data-act="video">下载无水印视频</button>`;
    btns += `<button class="mini mp3" data-act="mp3">转 MP3</button>`;
  }

  const thumbs = isImages
    ? `<div class="thumbs">${item.images
        .slice(0, 8)
        .map((u) => `<img class="thumb" src="${esc(u)}" loading="lazy" referrerpolicy="no-referrer"/>`)
        .join('')}${item.images.length > 8 ? `<span class="card-meta" style="align-self:center">+${item.images.length - 8}</span>` : ''}</div>`
    : '';

  card.innerHTML = `
    ${cover}
    <div class="card-body">
      <span class="tag ${isImages ? 'images' : 'video'}">${isImages ? '图集' : '视频'}</span>
      <div class="card-title">${esc(item.title)}</div>
      <div class="card-meta"><span>@${esc(item.author)}</span>${stats.map((s) => `<span>${esc(s)}</span>`).join('')}</div>
      ${thumbs}
      <div class="card-btns">${btns}</div>
    </div>
  `;

  card.querySelectorAll('.mini').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      const base = (item.title || 'douyin').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 48);
      if (act === 'video') {
        downloadViaProxy(item.videoUrl, `${base}.mp4`);
      } else if (act === 'mp3') {
        // 优先用原始音乐直链；没有则走 yt-dlp 从视频提取
        if (item.musicUrl) {
          downloadViaProxy(item.musicUrl, `${base}.mp3`);
          setStatus('正在下载音频…', 'ok');
        } else {
          const a = document.createElement('a');
          a.href = `/api/media?url=${encodeURIComponent(item.pageUrl)}&format=mp3`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setStatus('MP3 转码中，请稍候…（首次可能较慢）', '');
        }
      } else if (act === 'images') {
        item.images.forEach((u, i) => {
          setTimeout(() => downloadViaProxy(u, `${base}_${i + 1}.jpg`), i * 260);
        });
        setStatus(`开始下载 ${item.images.length} 张图片…`, 'ok');
      }
    });
  });

  return card;
}

function renderError(url, msg) {
  const card = document.createElement('div');
  card.className = 'card error';
  card.innerHTML = `
    <span class="tag video">解析失败</span>
    <div class="card-title">${esc(msg)}</div>
    <div class="card-meta"><span style="word-break:break-all">${esc(url)}</span></div>
  `;
  return card;
}

async function doParse() {
  const input = inputEl.value.trim();
  if (!input) return setStatus('请先粘贴抖音链接', 'err');

  setLoading(true);
  setStatus('正在解析…');
  resultsEl.innerHTML = '';
  emptyEl.hidden = true;

  try {
    const res = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || '解析失败');

    const { items = [], errors = [], cookies } = data;

    items.forEach((it) => resultsEl.appendChild(renderCard(it)));
    errors.forEach((e) => resultsEl.appendChild(renderError(e.url, e.error)));

    if (!items.length && !errors.length) {
      emptyEl.hidden = false;
      setStatus('没有解析到有效链接', 'err');
    } else {
      const okMsg = `成功 ${items.length} 条${errors.length ? `，失败 ${errors.length} 条` : ''}`;
      setStatus(okMsg, items.length ? 'ok' : 'err');
      if (!cookies) {
        envHintEl.hidden = false;
        envHintEl.textContent =
          '提示：未配置 cookies.txt。若部分链接解析失败或被提示需要登录，请参考 README 导出 cookies.txt 放入项目根目录。';
      }
    }
  } catch (e) {
    setStatus(e.message, 'err');
    resultsEl.appendChild(renderError('', e.message));
  } finally {
    setLoading(false);
  }
}

parseBtn.addEventListener('click', doParse);
clearBtn.addEventListener('click', () => {
  inputEl.value = '';
  resultsEl.innerHTML = '';
  emptyEl.hidden = false;
  setStatus('');
  inputEl.focus();
});
inputEl.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') doParse();
});

// 启动时自检环境
(async () => {
  try {
    const r = await fetch('/api/health');
    const d = await r.json();
    if (d.ytdlp === '未安装') {
      envHintEl.hidden = false;
      envHintEl.textContent = '警告：服务器未检测到 yt-dlp，MP3 转码与部分解析将不可用。请运行 pip3 install yt-dlp';
    }
  } catch (_) {
    /* 忽略 */
  }
})();
