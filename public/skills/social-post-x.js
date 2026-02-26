/**
 * Skill: X/Twitter Full Interaction via Chrome CDP
 * Post, reply, like, baca komentar, baca mentions
 * Tanpa API key — pakai Chrome yang sudah login!
 */

const { exec } = require('child_process');
const path = require('path');

const SKILL_DIR = 'D:\\.agents\\skills\\baoyu-post-to-x\\scripts';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ENV = { ...process.env, X_BROWSER_CHROME_PATH: CHROME_PATH };

function runScript(scriptName, args = [], timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SKILL_DIR, scriptName);
    const argsStr = args.map(a => `"${String(a).replace(/"/g, '\\"')}"`).join(' ');
    const cmd = `npx -y bun "${scriptPath}" ${argsStr}`;
    console.log('[social-x] Running:', cmd);
    exec(cmd, { timeout: timeoutMs, env: ENV }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

/** Post tweet baru */
function postTweet(text, images = [], submit = true) {
  const imgArgs = images.flatMap(p => ['--image', p]);
  const args = [text, ...imgArgs, ...(submit ? ['--submit'] : [])];
  return runScript('x-browser.ts', args);
}

/** Balas tweet orang */
function replyToTweet(tweetUrl, text, submit = true) {
  const args = [tweetUrl, text, ...(submit ? ['--submit'] : [])];
  return runScript('x-reply.ts', args);
}

/** Quote tweet dengan komentar */
function quoteTweet(tweetUrl, comment = '', submit = true) {
  const args = [tweetUrl, ...(comment ? [comment] : []), ...(submit ? ['--submit'] : [])];
  return runScript('x-quote.ts', args);
}

/** Like/unlike tweet */
function likeTweet(tweetUrl, unlike = false) {
  const args = [tweetUrl, ...(unlike ? ['--unlike'] : [])];
  return runScript('x-like.ts', args, 30_000);
}

/** Baca replies/komentar dari sebuah tweet */
function readReplies(tweetUrl, limit = 10) {
  return runScript('x-read-replies.ts', [tweetUrl, '--limit', limit], 60_000);
}

/** Baca mentions (@username) dari notifikasi */
function readMentions(limit = 10) {
  return runScript('x-mentions.ts', ['--limit', limit], 60_000);
}

module.exports = {
  name: 'SocialX',
  postTweet,
  replyToTweet,
  quoteTweet,
  likeTweet,
  readReplies,
  readMentions,

  hints: `
X/TWITTER — WAJIB gunakan action berikut, JANGAN generate shell command sendiri:

Post tweet baru → GUNAKAN action "post_x":
{"action":"post_x","text":"<isi tweet>","reply":"Posting ke X..."}

Balas tweet → GUNAKAN action "reply_x":
{"action":"reply_x","tweetUrl":"<url>","text":"<balasan>","reply":"Membalas tweet..."}

Like tweet → GUNAKAN action "like_x":
{"action":"like_x","tweetUrl":"<url>","reply":"Menyukai tweet..."}

Unlike tweet → GUNAKAN action "unlike_x":
{"action":"unlike_x","tweetUrl":"<url>","reply":"Unlike tweet..."}

Baca komentar tweet → GUNAKAN action "read_replies":
{"action":"read_replies","tweetUrl":"<url>","limit":10,"reply":"Membaca komentar..."}

Baca mentions → GUNAKAN action "read_mentions":
{"action":"read_mentions","limit":10,"reply":"Membaca mentions..."}

Auto baca + komentar AI → GUNAKAN action "engage_tweet":
{"action":"engage_tweet","tweetUrl":"<url>","persona":"witty","lang":"en","autoLike":true,"reply":"Auto komentari tweet..."}

⚠️ PENTING: Untuk semua aksi Twitter/X, SELALU gunakan action di atas. JANGAN pernah generate shell/npx command manual untuk Twitter.
`.trim(),
};
