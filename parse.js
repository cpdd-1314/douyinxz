'use strict';

const express = require('express');
const douyin = require('../services/douyin');
const ytdlp = require('../services/ytdlp');
const { hasCookies } = require('../utils/cookies');

const router = express.Router();

/**
 * POST /api/parse
 * body: { input: string }   // 单链接 / 分享文案 / 多行多条
 * 返回: { items: [...], cookies: boolean }
 */
router.post('/parse', async (req, res) => {
  const input = (req.body && req.body.input) || '';
  const urls = douyin.extractUrls(input);
  const list = urls.length ? urls : input.split(/[\n\r\s]+/).filter(Boolean);

  if (!list.length) {
    return res.status(400).json({ error: '请输入抖音链接' });
  }
  if (list.length > 20) {
    return res.status(400).json({ error: '单次最多解析 20 条链接' });
  }

  const items = [];
  const errors = [];

  for (const url of list) {
    try {
      const item = await douyin.parse(url, (u) => ytdlp.dumpInfo(u).catch(() => null));
      items.push(item);
    } catch (e) {
      errors.push({ url, error: e.message });
    }
  }

  res.json({ items, errors, cookies: hasCookies() });
});

module.exports = router;
