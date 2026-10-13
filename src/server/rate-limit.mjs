export function getClientIp(request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

export function createIpRateLimiter({ limit = 10, windowMs = 60_000, maxKeys = 2_048, now = Date.now } = {}) {
  const windows = new Map();
  return (ip) => {
    const time = now();
    for (const [key, value] of windows) if (value.resetAt <= time) windows.delete(key);

    const current = windows.get(ip);
    if (!current || current.resetAt <= time) {
      const value = { count: 1, resetAt: time + windowMs };
      windows.delete(ip);
      windows.set(ip, value);
      while (windows.size > maxKeys) windows.delete(windows.keys().next().value);
      return { allowed: true, remaining: limit - 1, retryAfterSeconds: Math.ceil(windowMs / 1000) };
    }

    if (current.count >= limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - time) / 1000)) };
    }

    current.count += 1;
    windows.delete(ip);
    windows.set(ip, current);
    return { allowed: true, remaining: limit - current.count, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - time) / 1000)) };
  };
}
