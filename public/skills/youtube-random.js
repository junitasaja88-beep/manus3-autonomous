/**
 * Skill: YouTube Random Play (no API key)
 * Server-side handler to open a random watch URL and start a RD mix.
 */

const https = require('https');

function isMusicIntent(text) {
  const t = String(text || '').toLowerCase();
  return /(putar|putarkan|play|mainkan).*(musik|music|lagu|song|youtube|yt|video)|\b(musik|music|lagu|video)\b.*\b(random|acak)\b/.test(t);
}

function buildYouTubeSearchUrl(text) {
  const q = String(text || '')
    .replace(/^(putar|putarkan|play|mainkan)\s+/i, '')
    .replace(/\b(di|di\s+)?youtube\b/ig, '')
    .replace(/\b(random|acak)\b/ig, '')
    .trim();
  const query = q || 'music';
  // sp=EgIQAQ%253D%253D: filter to videos.
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query) + '&sp=EgIQAQ%253D%253D';
}

function buildYouTubeWatchUrl(videoId) {
  const vid = String(videoId || '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(vid)) return null;
  return `https://www.youtube.com/watch?v=${vid}&autoplay=1&list=RD${vid}`;
}

function extractYouTubeVideoIds(html, limit = 15) {
  const ids = [];
  const seen = new Set();
  const re = /\/watch\?v=([a-zA-Z0-9_-]{11})/g;
  let m;
  while ((m = re.exec(html)) && ids.length < limit) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function httpsGetText(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: 'GET',
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Manus3Smart/1.0',
          'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        },
        timeout: 12000,
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (d) => raw += d);
        res.on('end', () => resolve(raw));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('https timeout')));
    req.end();
  });
}

async function getRandomWatchUrl(text) {
  const searchUrl = buildYouTubeSearchUrl(text);
  try {
    const html = await httpsGetText(searchUrl);
    const ids = extractYouTubeVideoIds(html, 15);
    if (ids.length === 0) return { url: searchUrl, mode: 'search' };
    const pick = ids[Math.floor(Math.random() * ids.length)];
    return { url: buildYouTubeWatchUrl(pick) || searchUrl, mode: 'watch' };
  } catch {
    return { url: searchUrl, mode: 'search' };
  }
}

module.exports = {
  name: 'YouTube Random',
  hints: `
YOUTUBE RANDOM (tanpa API key):
- Jika user bilang "putar video X random" atau "putar lagu X random", BUKA URL watch langsung (bukan halaman search).
- Gunakan URL: https://www.youtube.com/watch?v=<VIDEO_ID>&autoplay=1&list=RD<VIDEO_ID>
`.trim(),
  server: {
    match(text) {
      return isMusicIntent(text);
    },
    async handle(ctx) {
      const yt = await getRandomWatchUrl(ctx.userMessage);
      await ctx.executeShell(`start chrome "${yt.url}"`);
      return yt.mode === 'watch'
        ? `Memutar YouTube (random): ${yt.url}`
        : `Membuka YouTube: ${yt.url}`;
    },
  },
};

