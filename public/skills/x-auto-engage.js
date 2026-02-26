/**
 * Skill: X Auto Engage
 * Baca tweet orang → AI generate komentar → auto reply
 * Bisa juga: baca + like + reply sekaligus
 */

const { exec } = require('child_process');
const path = require('path');
const https = require('https');

const SKILL_DIR = 'D:\\.agents\\skills\\baoyu-post-to-x\\scripts';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ENV = { ...process.env, X_BROWSER_CHROME_PATH: CHROME_PATH };

function runScript(scriptName, args = [], timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SKILL_DIR, scriptName);
    const argsStr = args.map(a => `"${String(a).replace(/"/g, '\\"')}"`).join(' ');
    const cmd = `npx -y bun "${scriptPath}" ${argsStr}`;
    exec(cmd, { timeout: timeoutMs, env: ENV }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

/** Baca konten tweet */
function readTweet(tweetUrl) {
  return runScript('x-read-tweet.ts', [tweetUrl], 60_000)
    .then(out => {
      // parse JSON dari output
      const match = out.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      return { text: out };
    });
}

/** Baca replies dari tweet */
function readReplies(tweetUrl, limit = 5) {
  return runScript('x-read-replies.ts', [tweetUrl, '--limit', String(limit)], 60_000);
}

/** Generate komentar via AI */
async function generateComment(tweetContent, persona = 'friendly', lang = 'auto') {
  const keys = [
    ...(process.env.NVIDIA_API_KEY ? [process.env.NVIDIA_API_KEY] : []),
    ...(process.env.API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean),
  ];
  if (!keys.length) throw new Error('NVIDIA_API_KEY tidak ada di env');
  // Pilih key random biar tidak selalu hit limit yang sama
  const apiKey = keys[Math.floor(Math.random() * keys.length)];

  const langNote = lang === 'en' ? 'Reply in English only.'
    : lang === 'id' ? 'Reply in Indonesian only.'
    : 'Detect the tweet language and reply in the same language.';

  const personas = {
    friendly:  `You are warm, supportive, and lightly humorous. ${langNote}`,
    witty:     `You are witty and sharp. Clever comments, never offensive. ${langNote}`,
    hype:      `You are super excited and always hyped. Use emojis. ${langNote}`,
    thoughtful:`You are thoughtful and analytical. Meaningful, insightful comments. ${langNote}`,
    degen:     `You are a crypto/tech degen. Use slang, memes, internet language. ${langNote}`,
  };

  const systemPrompt = personas[persona] || personas.friendly;
  const userPrompt = `Read this tweet and write 1 short natural comment (max 2 sentences, not over the top):\n\nTweet: "${tweetContent}"\n\nReply with only the comment text, no explanation.`;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'moonshotai/kimi-k2-instruct-0905',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 100,
      temperature: 0.8,
    });

    const req = https.request({
      hostname: 'integrate.api.nvidia.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.choices?.[0]?.message?.content?.trim() || 'Keren!');
        } catch { reject(new Error('AI response parse error: ' + data)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Main: baca tweet → AI generate komentar → reply
 * @param {string} tweetUrl
 * @param {object} options - { persona, autoLike, submit, customComment }
 */
async function engageTweet(tweetUrl, options = {}) {
  const { persona = 'friendly', autoLike = false, submit = true, customComment = null, lang = 'auto' } = options;
  const results = { tweetUrl, tweet: null, comment: null, liked: false, replied: false };

  // Step 1: Baca isi tweet
  console.log('[x-engage] Reading tweet...');
  results.tweet = await readTweet(tweetUrl);
  const tweetText = results.tweet?.text || results.tweet?.error || tweetUrl;
  console.log('[x-engage] Tweet:', tweetText.substring(0, 80));

  // Step 2: Generate komentar via AI (atau pakai custom)
  results.comment = customComment || await generateComment(tweetText, persona, lang);
  console.log('[x-engage] AI comment:', results.comment);

  // Step 3: Like (opsional)
  if (autoLike) {
    try {
      await runScript('x-like.ts', [tweetUrl], 30_000);
      results.liked = true;
      console.log('[x-engage] Liked!');
    } catch (e) { console.warn('[x-engage] Like failed:', e.message); }
  }

  // Step 4: Reply
  const replyArgs = [tweetUrl, results.comment, ...(submit ? ['--submit'] : [])];
  await runScript('x-reply.ts', replyArgs);
  results.replied = submit;

  return results;
}

module.exports = {
  name: 'XAutoEngage',
  readTweet,
  readReplies,
  generateComment,
  engageTweet,

  hints: `
X AUTO ENGAGE — baca tweet + AI komentar + auto reply:

Baca isi tweet:
{"action":"read_tweet","tweetUrl":"https://x.com/user/status/123","reply":"Membaca tweet..."}

Auto engage (baca → AI generate komentar → reply):
{"action":"engage_tweet","tweetUrl":"https://x.com/user/status/123","persona":"friendly","submit":true,"reply":"Membaca dan auto komentari tweet..."}

Auto engage + like sekaligus:
{"action":"engage_tweet","tweetUrl":"https://x.com/user/status/123","persona":"witty","autoLike":true,"submit":true,"reply":"Like dan komentari tweet..."}

Baca komentar orang lain di sebuah tweet:
{"action":"read_replies","tweetUrl":"https://x.com/user/status/123","limit":10,"reply":"Membaca komentar..."}

Persona tersedia:
- friendly  : hangat, santai, supportif
- witty     : cerdas, tajam, tidak menyinggung
- hype      : excited, banyak emoji
- thoughtful: analitis, berisi
- degen     : crypto/tech slang, mix Indo-English
`.trim(),
};
