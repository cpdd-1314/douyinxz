'use strict';

const fs = require('fs');
const path = require('path');

/**
 * cookies 读写工具。
 *
 * 抖音在服务器 IP 上经常返回 "Fresh cookies needed"（需要登录态），
 * 此时把浏览器导出的 cookies.txt 放到项目根目录即可。
 * 文件不会进入 git（见 .gitignore）。
 */

const DEFAULT_PATH = path.resolve(process.cwd(), 'cookies.txt');

/** 返回 cookies 文件绝对路径（不存在则返回 null） */
function getCookiesPath() {
  const p = process.env.COOKIES_PATH
    ? path.resolve(process.cwd(), process.env.COOKIES_PATH)
    : DEFAULT_PATH;
  try {
    if (fs.existsSync(p) && fs.statSync(p).size > 0) return p;
  } catch (_) {
    /* ignore */
  }
  return null;
}

/** 是否已配置 cookies */
function hasCookies() {
  return getCookiesPath() !== null;
}

/**
 * 把 Netscape 格式的 cookies.txt 解析成键值对，
 * 便于用 fetch 请求时手动带上 Cookie 头。
 */
function readCookiesMap() {
  const file = getCookiesPath();
  if (!file) return {};
  const map = {};
  try {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.startsWith('#')) continue;
      const parts = line.split('\t');
      if (parts.length >= 7) {
        const [, , , , , name, value] = parts;
        if (name) map[name] = value;
      }
    }
  } catch (_) {
    /* ignore */
  }
  return map;
}

/** 拼接成 Cookie 请求头字符串 */
function getCookieHeader() {
  const map = readCookiesMap();
  const keys = Object.keys(map);
  if (!keys.length) return '';
  return keys.map((k) => `${k}=${map[k]}`).join('; ');
}

module.exports = { getCookiesPath, hasCookies, readCookiesMap, getCookieHeader };
