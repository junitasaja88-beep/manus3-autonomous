/**
 * Upstash Redis REST API wrapper (no SDK needed)
 * Uses fetch to communicate with Upstash Redis REST endpoint
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCommand(...args) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
  }

  const response = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Redis error ${response.status}: ${text}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`Redis error: ${data.error}`);
  }
  return data.result;
}

const redis = {
  lpush: (key, value) => redisCommand('LPUSH', key, typeof value === 'string' ? value : JSON.stringify(value)),
  rpop: (key) => redisCommand('RPOP', key),
  llen: (key) => redisCommand('LLEN', key),
  set: (key, value, ttlSeconds) => {
    const val = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) return redisCommand('SET', key, val, 'EX', String(ttlSeconds));
    return redisCommand('SET', key, val);
  },
  get: (key) => redisCommand('GET', key),
  del: (key) => redisCommand('DEL', key),
  incr: (key) => redisCommand('INCR', key),
  expire: (key, ttlSeconds) => redisCommand('EXPIRE', key, String(ttlSeconds)),
};

module.exports = redis;
