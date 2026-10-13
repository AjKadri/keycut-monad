import assert from 'node:assert/strict';
import test from 'node:test';
import { createIpRateLimiter, getClientIp } from '../src/server/rate-limit.mjs';

test('client IP prefers Vercel x-forwarded-for', () => {
  const request = new Request('https://example.test', {
    headers: {
      'x-forwarded-for': '198.51.100.7, 10.0.0.1',
      'x-real-ip': '203.0.113.9',
    },
  });
  assert.equal(getClientIp(request), '198.51.100.7');
});

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
