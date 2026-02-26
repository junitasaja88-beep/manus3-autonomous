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
X/TWITTER — semua aksi via Chrome (tanpa API key):

Post tweet baru:
{"action":"post_x","text":"Halo dari Manus! 🤖 #AI","submit":true,"reply":"Posting ke X..."}

Balas tweet orang (butuh URL tweet):
{"action":"reply_x","tweetUrl":"https://x.com/user/status/123","text":"Keren banget!","submit":true,"reply":"Membalas tweet..."}

Quote tweet dengan komentar:
{"action":"quote_x","tweetUrl":"https://x.com/user/status/123","text":"Setuju banget!","submit":true,"reply":"Quote tweet..."}

Like tweet:
{"action":"like_x","tweetUrl":"https://x.com/user/status/123","reply":"Menyukai tweet..."}

Unlike tweet:
{"action":"unlike_x","tweetUrl":"https://x.com/user/status/123","reply":"Unlike tweet..."}

Baca komentar/replies dari tweet:
{"action":"read_replies","tweetUrl":"https://x.com/user/status/123","limit":10,"reply":"Membaca komentar..."}

Baca mentions (notifikasi @username):
{"action":"read_mentions","limit":10,"reply":"Membaca mentions..."}

Post dengan gambar:
{"action":"post_x","text":"Lihat ini!","images":["C:\\\\Users\\\\cc\\\\foto.png"],"submit":true,"reply":"Posting foto ke X..."}
`.trim(),
};
