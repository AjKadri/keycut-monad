import assert from 'node:assert/strict';
import test from 'node:test';
import { createIpRateLimiter } from '../src/server/rate-limit.mjs';

test('IP limiter allows the configured requests, blocks excess, then resets', () => {
  let now = 1000;
  const check = createIpRateLimiter({ limit: 2, windowMs: 60_000, now: () => now });
  assert.deepEqual(check('198.51.100.1'), { allowed: true, remaining: 1, retryAfterSeconds: 60 });
  assert.deepEqual(check('198.51.100.1'), { allowed: true, remaining: 0, retryAfterSeconds: 60 });
  assert.deepEqual(check('198.51.100.1'), { allowed: false, remaining: 0, retryAfterSeconds: 60 });
  assert.equal(check('198.51.100.2').allowed, true);
  now += 60_000;
  assert.equal(check('198.51.100.1').allowed, true);
});
