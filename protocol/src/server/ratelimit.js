/* ============================================================================
 * ratelimit.js — ratelimit.js — formalized from the v0.10.1 pinned contract
 * ----------------------------------------------------------------------------
 * NOTE: listed as "unchanged" from the v0.9 branch but not bundled in the
 * v0.10.1 doc. v0.10.2 ships it explicitly, formalized to the API
 * contract selfimpulse.js calls: isBanned / connAllowed / connAdd / connRemove / allow /
 * violation / close, with banThreshold + banDurationMs + maxSocketsPerIp.
 * ========================================================================== */

class TokenBucket {
  constructor(ratePerSec, capacity) {
    this.rate = ratePerSec;
    this.capacity = capacity;
    this.tokens = capacity;
    this.last = Date.now();
  }
  take(n = 1) {
    const now = Date.now();
    const refill = ((now - this.last) / 1000) * this.rate;
    this.tokens = Math.min(this.capacity, this.tokens + refill);
    this.last = now;
    if (this.tokens >= n) { this.tokens -= n; return true; }
    return false;
  }
}

export class RateLimiter {
  constructor({ banThreshold = 20, banDurationMs = 15 * 60_000, maxSocketsPerIp = 10 } = {}) {
    this.banThreshold    = banThreshold;
    this.banDurationMs   = banDurationMs;
    this.maxSocketsPerIp = maxSocketsPerIp;
    this.buckets   = new Map();
    this.violations = new Map();   /* ip -> { count, bannedUntil } */
    this.conns     = new Map();    /* ip -> count */
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref?.();
  }

  isBanned(ip) {
    const rec = this.violations.get(ip);
    if (!rec?.bannedUntil) return false;
    if (Date.now() < rec.bannedUntil) return true;
    this.violations.delete(ip);
    return false;
  }

  connAllowed(ip) { return (this.conns.get(ip) ?? 0) < this.maxSocketsPerIp; }
  connAdd(ip)    { this.conns.set(ip, (this.conns.get(ip) ?? 0) + 1); }
  connRemove(ip) {
    const n = (this.conns.get(ip) ?? 0) - 1;
    if (n <= 0) this.conns.delete(ip); else this.conns.set(ip, n);
  }

  allow(key, action, ratePerSec, windowMs = 1_000) {
    const k = `${key}:${action}`;
    if (!this.buckets.has(k)) {
      const capacity = Math.max(1, Math.round(ratePerSec * (windowMs / 1_000)));
      this.buckets.set(k, new TokenBucket(ratePerSec, capacity));
    }
    return this.buckets.get(k).take(1);
  }

  violation(ip) {
    const rec = this.violations.get(ip) ?? { count: 0, bannedUntil: 0 };
    rec.count += 1;
    if (rec.count >= this.banThreshold) rec.bannedUntil = Date.now() + this.banDurationMs;
    this.violations.set(ip, rec);
  }

  sweep() {
    const now = Date.now();
    for (const [ip, rec] of this.violations)
      if (rec.bannedUntil && now >= rec.bannedUntil) this.violations.delete(ip);
  }

  close() { clearInterval(this.sweeper); }
}
