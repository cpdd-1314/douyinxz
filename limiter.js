'use strict';

/**
 * 令牌桶限流器 + 移动端 UA 池。
 *
 * 抖音对单 IP 有频率风控（约 >10 次/分 触发限流），
 * 所以所有对外解析请求都要经过这里排队，并轮换 UA。
 */

const UA_POOL = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; PGT-AN00) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
];

/** 随机取一个移动端 UA */
function randomUA() {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

/**
 * 简易令牌桶（按固定间隔放行）。
 * 默认 RATE_LIMIT=1 → 每秒最多 1 个请求。
 */
class RateLimiter {
  constructor(ratePerSec) {
    const rate = Number(ratePerSec);
    this.interval = 1000 / (rate > 0 ? rate : 1);
    this.lastRun = 0;
    this.queue = Promise.resolve();
  }

  /** 排队执行 fn，返回 fn 的 Promise */
  schedule(fn) {
    const run = async () => {
      const now = Date.now();
      const wait = Math.max(0, this.lastRun + this.interval - now);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastRun = Date.now();
      return fn();
    };
    // 串行化，保证顺序执行
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }
}

const limiter = new RateLimiter(process.env.RATE_LIMIT || 1);

module.exports = { randomUA, limiter, RateLimiter, UA_POOL };
