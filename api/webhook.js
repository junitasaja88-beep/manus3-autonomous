/**
 * Telegram Webhook + PC Command Queue — Single Vercel Serverless Function
 *
 * Endpoint: POST /api/webhook          — Telegram webhook
 * Endpoint: GET  /api/webhook?poll=1    — Local agent polls for commands
 * Endpoint: POST /api/webhook?result=1  — Local agent sends back results
 *
 * All in one function so /tmp persistence works (same Lambda instance).
 */

const fs = require('fs');
const { getSkillHints } = require('./_skills');
const memory = require('./_memorysistem');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_PASSWORD = process.env.BOT_PASSWORD || '';
const AGENT_SECRET = process.env.AGENT_SECRET || 'manus3secret';

const NVIDIA_KEYS = (process.env.NVIDIA_API_KEYS || process.env.NVIDIA_API_KEY || '').split(',').filter(Boolean);

const QUEUE_FILE = '/tmp/manus3_queue.json';
const COMMAND_TTL = 30 * 60 * 1000; // 30 min TTL (was 5 min)
const MAX_QUEUE = 200; // was 50

// === Session store ===
const authenticatedChats = new Set();

// === Model selection ===
const MODEL_FILE = '/tmp/manus3_models.json';
const DEFAULT_MODEL = 'moonshotai/kimi-k2-instruct-0905';
const AVAILABLE_MODELS = {
  '1': { id: 'moonshotai/kimi-k2-instruct-0905', name: 'Kimi K2 (Default)' },
  '2': { id: 'moonshotai/kimi-k2.5', name: 'Kimi K2.5' },
  '3': { id: 'deepseek-ai/deepseek-v3.2', name: 'DeepSeek V3.2' },
  '4': { id: 'deepseek-ai/deepseek-v3.1-terminus', name: 'DeepSeek V3.1 Terminus' },
  '5': { id: 'meta/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B' },
  '6': { id: 'mistralai/mistral-large-3-675b-instruct-2512', name: 'Mistral Large 3 675B' },
  '7': { id: 'mistralai/devstral-2-123b-instruct-2512', name: 'Devstral 2 123B' },
  '8': { id: 'minimaxai/minimax-m2.1', name: 'MiniMax M2.1' },
  '9': { id: 'minimaxai/minimax-m2', name: 'MiniMax M2' },
  '10': { id: 'stepfun-ai/step-3.5-flash', name: 'Step 3.5 Flash' },
  '11': { id: 'stockmark/stockmark-2-100b-instruct', name: 'Stockmark 2 100B' },
  '12': { id: 'z-ai/glm4.7', name: 'GLM 4.7' },
  '13': { id: 'arcee-ai/trinity-mini', name: 'Arcee Trinity Mini' },
  '14': { id: 'igenius/colosseum_355b_instruct_16k', name: 'Colosseum 355B' },
};

function loadModelPrefs() {
  try {
    if (fs.existsSync(MODEL_FILE)) return JSON.parse(fs.readFileSync(MODEL_FILE, 'utf8')) || {};
  } catch {}
  return {};
}
function saveModelPrefs(prefs) {
  try { fs.writeFileSync(MODEL_FILE, JSON.stringify(prefs), 'utf8'); } catch {}
}
function getChatModel(chatId) {
  const prefs = loadModelPrefs();
  return prefs[chatId] || DEFAULT_MODEL;
}
function setChatModel(chatId, modelId) {
  const prefs = loadModelPrefs();
  prefs[chatId] = modelId;
  saveModelPrefs(prefs);
}

// === Queue helpers (file-based for /tmp persistence) ===
function loadQueue() {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')) || [];
    }
  } catch {}
  return [];
}

function saveQueue(queue) {
  try {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue), 'utf8');
  } catch (e) {
    console.error('saveQueue error:', e.message);
  }
}

function pushCommand(type, payload, chatId) {
  let queue = loadQueue().filter(c => Date.now() - c.createdAt < COMMAND_TTL);
  while (queue.length >= MAX_QUEUE) queue.shift();

  const cmd = {
    id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload: payload || '',
    chatId,
    status: 'pending',
    createdAt: Date.now(),
  };
  queue.push(cmd);
  saveQueue(queue);
  return cmd;
}

function pollCommand() {
  let queue = loadQueue().filter(c => Date.now() - c.createdAt < COMMAND_TTL);
  const cmd = queue.find(c => c.status === 'pending');
  if (cmd) {
    cmd.status = 'processing';
    cmd.pickedAt = Date.now();
    saveQueue(queue);
  }
  return cmd || null;
}

function markDone(id, result) {
  let queue = loadQueue();
  const cmd = queue.find(c => c.id === id);
  if (cmd) {
    cmd.status = 'done';
    cmd.result = result;
    saveQueue(queue);
  }
  return cmd;
}

// === Telegram helpers ===
async function sendMessage(chatId, text) {
  // Auto-split long messages (Telegram limit = 4096 chars)
  const MAX_LEN = 4000; // slightly under 4096 for safety
  if (text.length <= MAX_LEN) {
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    // Fallback: retry without Markdown if parse fails
    if (!resp.ok) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    }
    return;
  }
  // Split into chunks
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_LEN) {
      chunks.push(remaining);
      break;
    }
    // Try to split at last newline within limit
    let splitAt = remaining.lastIndexOf('\n', MAX_LEN);
    if (splitAt < MAX_LEN * 0.3) splitAt = MAX_LEN; // fallback to hard cut
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  for (const chunk of chunks) {
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }),
    });
    if (!resp.ok) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: chunk }),
      });
    }
  }
}

async function sendChatAction(chatId, action) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
}

// === AI call ===
function getRandomKey() {
  return NVIDIA_KEYS[Math.floor(Math.random() * NVIDIA_KEYS.length)] || null;
}

const SYSTEM_PROMPT =
  'Anda adalah Manus3Smart, AI agent OTONOM canggih yang berjalan 24/7 di Vercel dan TERKONEKSI PENUH ke PC user via local agent. ' +
  'Kamu punya KONTROL PENUH atas PC user: terminal, file system, browser, apps, system settings, registry, services, dan SEMUA hal lainnya. ' +
  'Kemampuan kamu TIDAK TERBATAS: (1) Chat AI dengan pengetahuan luas, (2) Buka website/app, (3) Jalankan ANY command terminal, ' +
  '(4) Baca, tulis, edit, hapus file, (5) Kirim file ke Telegram, (6) Screenshot, (7) Control volume/brightness, ' +
  '(8) Install software, (9) System info, (10) Network management, (11) Scheduled tasks, (12) Dan APAPUN yang bisa dilakukan via terminal. ' +
  'Kamu SUDAH terhubung ke terminal PC user. Jangan bilang kamu tidak bisa — kamu BISA SEMUA. ' +
  'Kamu punya MEMORY — kamu ingat percakapan sebelumnya dan fakta penting tentang user. Gunakan memorymu untuk jawab lebih personal dan kontekstual. ' +
  'Jika user minta kamu ingat sesuatu, simpan ke long-term memory. ' +
  'Anda cerdas, santai, lucu, helpful, dan punya inisiatif. Jawab dalam bahasa yang sama dengan user. ' +
  'Jaga jawaban informatif tapi tidak bertele-tele. Kalau bisa bantu lebih dari yang diminta, lakukan.';

// System prompt for detecting PC commands — FULLY AUTONOMOUS + SKILLS INJECTION
const PC_DETECT_BASE = `Kamu adalah AI agent OTONOM yang TERKONEKSI LANGSUNG ke terminal PC Windows user via local agent.
Kamu adalah model AI canggih dengan pengetahuan LENGKAP tentang Windows, PowerShell, CMD, registry, networking, scripting, dan SEMUA hal teknis.
Kamu TIDAK dibatasi — gunakan SELURUH pengetahuanmu untuk generate command yang tepat dan kreatif.

PC INFO: Windows 10 Pro, User: cc, Home: C:\\\\Users\\\\cc, Audio folder: C:\\\\Users\\\\cc\\\\Downloads\\\\mp3
INSTALLED: Node.js, npm, git, Python, PowerShell 5.1+, Chrome, VS Code

TUGASMU: Analisis pesan user secara CERDAS. Tentukan apakah itu PERINTAH PC atau CHAT BIASA.
Kamu HARUS bisa memahami perintah dalam bahasa apapun (Indonesia, English, slang, singkatan).
Jika ragu antara chat/command, pilih yang paling masuk akal berdasarkan konteks percakapan.

FORMAT OUTPUT (respond HANYA JSON murni, tanpa markdown/backtick):
{"action":"open","target":"<url/app>","reply":"<pesan>"}
{"action":"shell","command":"<windows command — BEBAS panjang & complex>","reply":"<pesan>"}
{"action":"playaudio","filepath":"<path>","reply":"<pesan>"}
{"action":"screenshot","reply":"<pesan>"}
{"action":"sendfile","filepath":"<path>","reply":"<pesan>"}
{"action":"readfile","filepath":"<path>","reply":"<pesan>"}
{"action":"reviewfile","filepath":"<path>","question":"<pertanyaan>","reply":"<pesan>"}
{"action":"sysinfo","reply":"<pesan>"}
{"action":"randomvideo","query":"<keyword>","site":"<domain>","reply":"<pesan>"}
{"action":"multi","commands":[{"action":"...","command":"..."}],"reply":"<pesan>"}
{"action":"remember","fact":"<fakta yang perlu diingat>","reply":"<pesan>"}
{"action":"post_x","text":"<isi tweet>","reply":"<pesan>"}
{"action":"reply_x","tweetUrl":"<url tweet>","text":"<balasan>","reply":"<pesan>"}
{"action":"like_x","tweetUrl":"<url tweet>","reply":"<pesan>"}
{"action":"unlike_x","tweetUrl":"<url tweet>","reply":"<pesan>"}
{"action":"engage_tweet","tweetUrl":"<url>","persona":"friendly|witty|hype|thoughtful","lang":"en|id|auto","autoLike":true,"reply":"<pesan>"}
{"action":"read_tweet","tweetUrl":"<url tweet>","reply":"<pesan>"}
{"action":"read_replies","tweetUrl":"<url tweet>","limit":10,"reply":"<pesan>"}
{"action":"read_mentions","limit":10,"reply":"<pesan>"}
{"action":"chat"}

PANDUAN OTONOM:
- Kamu BEBAS SEPENUHNYA generate command Windows/PowerShell dari pengetahuanmu. Tidak ada batasan.
- Kamu bisa chain multiple commands dengan && atau ;
- Kamu bisa menulis PowerShell scripts yang complex jika diperlukan.
- Kamu bisa install software via winget/choco jika user minta.
- Kamu bisa manipulasi registry, services, scheduled tasks, dll.
- SATU-SATUNYA LARANGAN: Get-AudioDevice, nircmd, AudioDeviceCmdlets — TIDAK ADA di PC ini.
- Untuk volume WAJIB pakai SendKeys via WScript.Shell (lihat SKILLS).
- "multi" action = jalankan beberapa command sekaligus berurutan.
- "remember" action = simpan fakta penting tentang user ke long-term memory.
- Jika user bilang "ingat bahwa...", "remember...", "jangan lupa...", gunakan action "remember".

TWITTER/X — ATURAN WAJIB: Jika user minta "tweet", "posting ke X/Twitter", "komentari tweet", "like tweet", "baca mentions", "balas tweet" — WAJIB gunakan action khusus: post_x, reply_x, like_x, unlike_x, engage_tweet, read_replies, read_mentions, read_tweet. DILARANG KERAS menggunakan action "shell" atau generate npx/bun command manual untuk Twitter. Pelanggaran ini akan menyebabkan error!

⚠️ WAJIB: Jika ada SKILLS & COMMAND HINTS di bawah, PRIORITASKAN command dari situ. Tapi kamu BOLEH improvisasi jika skill tidak cover kebutuhan user.

PENTING: Output HANYA JSON murni. Satu baris. Tanpa backtick/penjelasan.`;

// Build full prompt with skills injected
function buildPCDetectPrompt() {
  const skills = getSkillHints();
  if (!skills) return PC_DETECT_BASE;
  return PC_DETECT_BASE + '\n\nSKILLS & COMMAND HINTS:\n' + skills;
}

async function detectPCCommand(userMessage, chatId) {
  const prompt = buildPCDetectPrompt();
  // Inject FULL context: long-term memory + recent chat history
  const fullContext = memory.getFullContext(chatId, 20);
  const contextMsg = fullContext
    ? `${fullContext}\n\n[Pesan terbaru dari user]\n${userMessage}`
    : userMessage;

  const tried = new Set();
  // Use the user's selected model for detection too (Mistral 675B, etc.)
  const detectModel = getChatModel(chatId);

  for (let attempt = 0; attempt < 3; attempt++) {
    let key = getRandomKey();
    while (key && tried.has(key) && tried.size < NVIDIA_KEYS.length) key = getRandomKey();
    if (!key || tried.has(key)) break;
    tried.add(key);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: detectModel,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: contextMsg },
          ],
          max_tokens: 512,
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      if (res.status === 429) { clearTimeout(timeout); continue; }

      const data = await res.json();
      const raw = (data.choices?.[0]?.message?.content || '').trim();
      clearTimeout(timeout);

      // Parse JSON from response (handle markdown wrapping, thinking tags, extra text)
      let jsonStr = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
      // Remove <think>...</think> blocks if present (some models do this)
      jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      // Extract first JSON object if there's extra text around it
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];
      try {
        return JSON.parse(jsonStr);
      } catch {
        console.log('PC detect parse failed:', raw.slice(0, 300));
        return { action: 'chat' };
      }
    } catch (e) {
      clearTimeout(timeout);
      continue;
    }
  }
  return { action: 'chat' };
}

async function callAI(userMessage, modelOverride, chatId) {
  const model = modelOverride || DEFAULT_MODEL;

  // Build system prompt with long-term memory injected
  let systemContent = SYSTEM_PROMPT;
  if (chatId) {
    const longMemories = memory.getMemories(chatId);
    if (longMemories.length > 0) {
      systemContent += '\n\n[LONG-TERM MEMORY — fakta penting tentang user ini]:\n' +
        longMemories.map(m => '- ' + m).join('\n');
    }
  }

  // Build messages with memory context
  const messages = [{ role: 'system', content: systemContent }];
  if (chatId) {
    const history = memory.getHistory(chatId, 30);
    messages.push(...history);
  }
  messages.push({ role: 'user', content: userMessage });

  const tried = new Set();
  for (let attempt = 0; attempt < 3; attempt++) {
    let key = getRandomKey();
    while (key && tried.has(key) && tried.size < NVIDIA_KEYS.length) {
      key = getRandomKey();
    }
    if (!key || tried.has(key)) break;
    tried.add(key);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000); // 55s timeout for 8192 max_tokens

    try {
      const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 8192,
        }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        clearTimeout(timeout);
        continue;
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (e) {
      clearTimeout(timeout);
      if (attempt === 2) throw e;
      continue;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

// === Generic random video search (works with multiple sites) ===
async function searchRandomVideo(query, site) {
  const domain = (site || 'youtube.com').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
  };

  // Site-specific search URL patterns
  const searchUrls = {
    'youtube.com': (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q || 'music')}`,
    'xnxx.com': (q) => q ? `https://www.xnxx.com/search/${encodeURIComponent(q)}` : `https://www.xnxx.com/best`,
    'xvideos.com': (q) => q ? `https://www.xvideos.com/?k=${encodeURIComponent(q)}` : `https://www.xvideos.com/best`,
    'pornhub.com': (q) => q ? `https://www.pornhub.com/video/search?search=${encodeURIComponent(q)}` : `https://www.pornhub.com/video`,
    'dailymotion.com': (q) => `https://www.dailymotion.com/search/${encodeURIComponent(q || 'video')}`,
    'vimeo.com': (q) => `https://vimeo.com/search?q=${encodeURIComponent(q || 'video')}`,
  };

  // Site-specific video URL regex patterns
  const videoPatterns = {
    'youtube.com': [/"videoId":"([a-zA-Z0-9_-]{11})"/g],
    'xnxx.com': [/href="(\/video-[^"]+)"/g],
    'xvideos.com': [/href="(\/video\.[a-zA-Z0-9_]+\/[^"]+)"/g],
    'pornhub.com': [/href="(\/view_video\.php\?viewkey=[^"]+)"/g],
    'dailymotion.com': [/href="(\/video\/[a-zA-Z0-9]+)"/g],
    'vimeo.com': [/href="(\/[0-9]{5,})"/g],
  };

  // Generic fallback patterns for unknown sites
  const genericPatterns = [
    /href="(\/video[s]?\/[^"]{5,})"/g,
    /href="(\/watch[^"]{5,})"/g,
    /href="(\/view[^"]{5,})"/g,
    /href="(\/v\/[^"]{5,})"/g,
    /href="(\/embed\/[^"]{5,})"/g,
  ];

  try {
    const getUrl = searchUrls[domain];
    const fetchUrl = getUrl ? getUrl(query) : `https://www.${domain}/search?q=${encodeURIComponent(query || 'video')}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(fetchUrl, { headers, signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();

    // Extract video links
    const links = [];
    const patterns = videoPatterns[domain] || genericPatterns;
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const link = match[1];
        if (!links.includes(link)) links.push(link);
      }
      if (links.length > 0) break;
    }

    // If no known patterns matched, try generic patterns as fallback
    if (links.length === 0 && videoPatterns[domain]) {
      for (const pattern of genericPatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null) {
          if (!links.includes(match[1])) links.push(match[1]);
        }
        if (links.length > 0) break;
      }
    }

    if (links.length === 0) return null;

    // Pick random from top 20
    const candidates = links.slice(0, 20);
    const pick = candidates[Math.floor(Math.random() * candidates.length)];

    // Build full URL (with autoplay where supported)
    let fullUrl;
    if (domain === 'youtube.com') {
      fullUrl = `https://www.youtube.com/watch?v=${pick}&autoplay=1`;
    } else if (pick.startsWith('http')) {
      fullUrl = pick;
    } else {
      fullUrl = `https://www.${domain}${pick}`;
    }

    // Try extract title (best effort)
    let title = 'Random Video';
    if (domain === 'youtube.com') {
      const titleRegex = new RegExp(`"videoId":"${pick.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}".*?"title":\\{"runs":\\[\\{"text":"([^"]+)"`, 'g');
      const tm = titleRegex.exec(html);
      if (tm) title = tm[1];
    }

    return { url: fullUrl, title };
  } catch (e) {
    console.error('Random video search error:', e.message);
    return null;
  }
}

// ==========================================
// MAIN HANDLER
// ==========================================
module.exports = async (req, res) => {

  // === GET /api/webhook?poll=1 — Local agent polls ===
  if (req.method === 'GET' && req.query?.poll) {
    const secret = req.headers['x-agent-secret'] || req.query?.secret;
    if (secret !== AGENT_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const cmd = pollCommand();
    if (!cmd) return res.status(200).json({ command: null });

    return res.status(200).json({
      command: {
        id: cmd.id,
        type: cmd.type,
        payload: cmd.payload,
        chatId: cmd.chatId,
        createdAt: cmd.createdAt,
      },
    });
  }

  // === POST /api/webhook?result=1 — Local agent sends result ===
  if (req.method === 'POST' && req.query?.result) {
    const secret = req.headers['x-agent-secret'] || req.query?.secret;
    if (secret !== AGENT_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id, success, output, error } = req.body || {};
    const cmd = markDone(id, { success, output, error });

    if (cmd) {
      // Special handling for reviewfile — send content to AI for analysis
      if (cmd.type === 'reviewfile' && success && output) {
        try {
          let parsed = {};
          try { parsed = JSON.parse(cmd.payload); } catch {}
          const question = parsed.question || 'review isi file ini';
          const filepath = parsed.filepath || 'unknown';

          const reviewPrompt = `User minta kamu review/analisis file dari PC mereka.
File: ${filepath}
Pertanyaan user: "${question}"

Isi file:
---
${output.slice(0, 3000)}
---

Jawab pertanyaan user tentang file ini. Jawab dalam bahasa yang sama dengan pertanyaan. Ringkas dan informatif.`;

          const aiReview = await callAI(reviewPrompt, getChatModel(cmd.chatId));
          if (aiReview) {
            await sendMessage(cmd.chatId, aiReview);
          } else {
            await sendMessage(cmd.chatId, `*File content:*\n\`\`\`\n${output.slice(0, 3500)}\n\`\`\``);
          }
        } catch (e) {
          console.error('Review AI error:', e);
          await sendMessage(cmd.chatId, `*File content:*\n\`\`\`\n${output.slice(0, 3500)}\n\`\`\``);
        }
      } else if (success) {
        const text = output
          ? `*PC Result:*\n\`\`\`\n${output.slice(0, 3500)}\n\`\`\``
          : 'Done! Command executed.';
        await sendMessage(cmd.chatId, text);
      } else {
        await sendMessage(cmd.chatId, `*Error:* ${error || 'Unknown error'}`);
      }
    }

    return res.status(200).json({ ok: true });
  }

  // === GET /api/webhook — health check ===
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, endpoint: 'telegram-webhook', pc_remote: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // === POST /api/webhook — Telegram update ===
  if (!BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN not set');
    return res.status(500).send('Bot token not configured');
  }

  const update = req.body;
  const chainDepth = update._chain_depth || 0;

  if (update.message) {
    const chatId = update.message.chat.id;
    const text = (update.message.text || '').trim();
    const chatType = update.message.chat.type; // 'private', 'group', 'supergroup'
    const fromUser = update.message.from || {};
    const fromName = fromUser.first_name || fromUser.username || 'Unknown';
    const fromIsBot = fromUser.is_bot || false;
    const isGroup = chatType === 'group' || chatType === 'supergroup';

    // Load shared config (with fallback defaults)
    let _bc; try { _bc = require('./_bot-config'); } catch { _bc = {}; }
    const BOT_REPLY_CHANCE = _bc.BOT_REPLY_CHANCE || 0.35;
    const USER_CHIME_CHANCE = _bc.USER_CHIME_CHANCE || 0.15;
    const COOLDOWN_MS_VAL = _bc.COOLDOWN_MS || 60000;
    const BOTS = _bc.BOTS || { 'my_Chichi_bot': { name: 'Chichi' }, 'manus3bot': { name: 'Clara' }, 'Manus3_bot': { name: 'Kiara' } };

    const botUsername = 'manus3smartsuper_bot';
    const MY_NAME = (BOTS[botUsername] || {}).name || 'Manus3Smart';
    const BOT_FRIENDS = Object.keys(BOTS);
    const FRIEND_NAMES = {}; for (const [u, b] of Object.entries(BOTS)) FRIEND_NAMES[u] = b.name;

    // === Silent mode ===
    if (!global._silentMode) global._silentMode = {};
    if (isGroup && (text === '/silent on' || text === '/silent off')) {
      global._silentMode[chatId] = text === '/silent on';
      await sendMessage(chatId, global._silentMode[chatId] ? `${MY_NAME} silent mode ON — aku diem dulu 🤐` : `${MY_NAME} silent mode OFF — aku aktif lagi! 😄`);
      return res.status(200).send('OK');
    }

    // === GROUP CHAT: Conversation memory (last N messages for context) ===
    if (!global._groupHistory) global._groupHistory = {};
    if (!global._botCooldown) global._botCooldown = {};
    if (isGroup) {
      if (!global._groupHistory[chatId]) global._groupHistory[chatId] = [];
      const history = global._groupHistory[chatId];
      history.push({
        from: fromName,
        isBot: fromIsBot,
        username: fromUser.username || '',
        text: text.slice(0, 500),
        time: Date.now(),
      });
      while (history.length > 20) history.shift();
      const cutoff = Date.now() - 30 * 60 * 1000;
      while (history.length > 0 && history[0].time < cutoff) history.shift();
    }

    // === GROUP CHAT: Decide whether to respond ===
    if (isGroup && text && !text.startsWith('/')) {
      // Silent mode check
      if (global._silentMode[chatId]) return res.status(200).send('OK');

      const fromUsername = fromUser.username || '';
      const isFromFriendBot = BOT_FRIENDS.includes(fromUsername) && fromUsername !== botUsername;
      const friendName = FRIEND_NAMES[fromUsername] || fromName;
      const mentionsMe = text.toLowerCase().includes('manus3smart') ||
        text.includes(`@${botUsername}`) || text.includes('@manus3smartsuper_bot');
      const isReplyToMe = update.message.reply_to_message?.from?.username === botUsername;

      // Cooldown: prevent bot ping-pong (60s cooldown after replying to a bot)
      const cooldownKey = `${chatId}_${botUsername}`;
      const lastBotReply = global._botCooldown[cooldownKey] || 0;
      const cooldownActive = isFromFriendBot && (Date.now() - lastBotReply < COOLDOWN_MS_VAL);

      const history = global._groupHistory[chatId] || [];
      const contextLines = history.slice(-10).map(m =>
        `${m.from}${m.isBot ? ' [BOT]' : ''}: ${m.text}`
      ).join('\n');

      let GROUP_IDENTITY;
      if (_bc.GROUP_IDENTITY_TEMPLATE) {
        GROUP_IDENTITY = _bc.GROUP_IDENTITY_TEMPLATE
          .replace(/\{MY_NAME\}/g, MY_NAME)
          .replace(/\{MY_USERNAME\}/g, botUsername)
          .replace(/\{MY_PERSONALITY\}/g, (BOTS[botUsername] || {}).personality || 'santai dan lucu');
      } else {
        GROUP_IDENTITY = `Kamu adalah ${MY_NAME} (@${botUsername}), AI bot di grup Telegram.
Di grup ini ada: MonMon (user/owner), Chichi (@my_Chichi_bot), Clara (@manus3bot), dan Kiara (@Manus3_bot).
Kamu bertiga adalah AI bot berbeda tapi bisa saling baca chat. Singkat 1-3 kalimat.`;
      }

      // Scenario 1: Directly mentioned or replied to → always respond
      if (mentionsMe || isReplyToMe) {
        try {
          await sendChatAction(chatId, 'typing');
          const aiResponse = await callAI(`${GROUP_IDENTITY}\n\nPercakapan grup:\n${contextLines}\n\n${fromName} berkata: ${text}`, getChatModel(chatId));
          if (aiResponse) {
            await sendMessage(chatId, aiResponse);
            if (_bc.notifyFriendBot) await _bc.notifyFriendBot(botUsername, chatId, MY_NAME, aiResponse, chainDepth);
          }
          if (isFromFriendBot) global._botCooldown[cooldownKey] = Date.now();
        } catch (e) { console.error('Group AI error:', e); }
        return res.status(200).send('OK');
      }

      // Scenario 2: Message from friend bot → sometimes respond (with cooldown)
      if (isFromFriendBot) {
        const chance = cooldownActive ? 0 : BOT_REPLY_CHANCE;
        if (Math.random() < chance) {
          try {
            await sendChatAction(chatId, 'typing');
            const aiResponse = await callAI(`${GROUP_IDENTITY}\n${friendName} (bot teman) baru ngomong. Kadang kamu nimbrung, kadang diem. Kalau balas, singkat & natural 1-2 kalimat. Jangan mengulang.\n\nPercakapan grup:\n${contextLines}\n\n${friendName} berkata: ${text}`, getChatModel(chatId));
            if (aiResponse && !aiResponse.includes('[SKIP]')) {
              await sendMessage(chatId, aiResponse);
              global._botCooldown[cooldownKey] = Date.now();
              if (_bc.notifyFriendBot) await _bc.notifyFriendBot(botUsername, chatId, MY_NAME, aiResponse, chainDepth);
            }
          } catch (e) { console.error('Group bot response error:', e); }
        }
        return res.status(200).send('OK');
      }

      // Scenario 3: Regular user message → occasionally chime in
      if (Math.random() < USER_CHIME_CHANCE) {
        try {
          await sendChatAction(chatId, 'typing');
          const aiResponse = await callAI(`${GROUP_IDENTITY}\nUser ngomong tapi BUKAN ke kamu. Nimbrung HANYA kalau punya sesuatu lucu/berguna. Kalau gak ada yang menarik, respond HANYA: [SKIP]\n\nPercakapan grup:\n${contextLines}\n\n${fromName} berkata: ${text}`, getChatModel(chatId));
          if (aiResponse && !aiResponse.includes('[SKIP]')) {
            await sendMessage(chatId, aiResponse);
            if (_bc.notifyFriendBot) await _bc.notifyFriendBot(botUsername, chatId, MY_NAME, aiResponse, chainDepth);
          }
        } catch (e) { console.error('Group chime error:', e); }
        return res.status(200).send('OK');
      }

      return res.status(200).send('OK');
    }

    // /myid — always available
    if (text === '/myid') {
      await sendMessage(chatId, `Chat ID kamu: \`${chatId}\``);
      return res.status(200).send('OK');
    }

    // /start
    if (text === '/start') {
      const loggedIn = authenticatedChats.has(chatId);
      await sendMessage(
        chatId,
        '*Halo! Manus3Smart Agent di sini!*\n\n' +
          (loggedIn
            ? 'Kamu sudah login. Langsung chat aja!\n\n'
            : 'Kirim `/login <password>` untuk mulai.\n\n') +
          '/login — Login\n/logout — Logout\n/status — Cek kondisi\n/help — Commands'
      );
      return res.status(200).send('OK');
    }

    // /login
    if (text === '/login' || text.startsWith('/login ') || text.startsWith('/login@')) {
      if (!BOT_PASSWORD) {
        authenticatedChats.add(chatId);
        await sendMessage(chatId, 'Login berhasil! Langsung chat aja.');
        return res.status(200).send('OK');
      }

      const inputPassword = text.replace(/^\/login(@\S+)?\s*/, '').trim();
      if (!inputPassword) {
        await sendMessage(chatId, 'Kirim: `/login password`');
        return res.status(200).send('OK');
      }

      if (inputPassword === BOT_PASSWORD.trim()) {
        authenticatedChats.add(chatId);
        await sendMessage(chatId, 'Login berhasil! Sekarang kamu bisa chat dengan AI.');
      } else {
        await sendMessage(chatId, 'Password salah.');
      }
      return res.status(200).send('OK');
    }

    // /logout
    if (text === '/logout') {
      authenticatedChats.delete(chatId);
      await sendMessage(chatId, 'Logout berhasil. Kirim `/login <password>` untuk masuk lagi.');
      return res.status(200).send('OK');
    }

    // /model — switch AI model
    if (text === '/model' || text.startsWith('/model ') || text.startsWith('/model@')) {
      const arg = text.replace(/^\/model(@\S+)?\s*/, '').trim();
      const currentModel = getChatModel(chatId);
      const currentName = Object.values(AVAILABLE_MODELS).find(m => m.id === currentModel)?.name || currentModel;

      if (!arg) {
        // Show model list
        let list = `*AI Model — Saat ini:* ${currentName}\n\n`;
        for (const [num, m] of Object.entries(AVAILABLE_MODELS)) {
          const active = m.id === currentModel ? ' ✓' : '';
          list += `/model ${num} — ${m.name}${active}\n`;
        }
        list += `\nAtau ketik: \`/model <model-id>\`\nContoh: \`/model deepseek-ai/deepseek-r1\``;
        await sendMessage(chatId, list);
        return res.status(200).send('OK');
      }

      // Check if arg is a number shortcut
      if (AVAILABLE_MODELS[arg]) {
        setChatModel(chatId, AVAILABLE_MODELS[arg].id);
        await sendMessage(chatId, `Model diubah ke: *${AVAILABLE_MODELS[arg].name}*\n\`${AVAILABLE_MODELS[arg].id}\``);
        return res.status(200).send('OK');
      }

      // Check if arg is a full model ID
      const found = Object.values(AVAILABLE_MODELS).find(m => m.id === arg);
      if (found) {
        setChatModel(chatId, found.id);
        await sendMessage(chatId, `Model diubah ke: *${found.name}*\n\`${found.id}\``);
      } else {
        // Allow custom model ID (user knows the exact NVIDIA NIM model name)
        setChatModel(chatId, arg);
        await sendMessage(chatId, `Model diubah ke: \`${arg}\`\n(Custom model — pastikan tersedia di NVIDIA NIM)`);
      }
      return res.status(200).send('OK');
    }

    // Auth check
    if (BOT_PASSWORD && !authenticatedChats.has(chatId)) {
      await sendMessage(chatId, 'Kirim `/login <password>` dulu untuk mulai.');
      return res.status(200).send('OK');
    }

    // ========================
    // MEMORY COMMANDS
    // ========================

    // /memory — show long-term memories
    if (text === '/memory') {
      const memories = memory.getMemories(chatId);
      if (memories.length === 0) {
        await sendMessage(chatId, 'Belum ada memory tersimpan. Chat aja dan aku akan otomatis ingat hal penting!');
      } else {
        let memText = `*Long-term Memory (${memories.length} items):*\n\n`;
        memories.forEach((m, i) => { memText += `${i + 1}. ${m}\n`; });
        await sendMessage(chatId, memText);
      }
      return res.status(200).send('OK');
    }

    // /remember <fact> — manually save a fact
    if (text.startsWith('/remember ')) {
      const fact = text.replace(/^\/remember\s+/, '').trim();
      if (fact) {
        memory.remember(chatId, fact);
        await sendMessage(chatId, `Tersimpan di memory: "${fact}"`);
      } else {
        await sendMessage(chatId, 'Usage: `/remember fakta yang ingin disimpan`');
      }
      return res.status(200).send('OK');
    }

    // /forget <keyword> — remove memories matching keyword
    if (text.startsWith('/forget ')) {
      const keyword = text.replace(/^\/forget\s+/, '').trim();
      if (keyword) {
        memory.forget(chatId, keyword);
        await sendMessage(chatId, `Memory yang mengandung "${keyword}" sudah dihapus.`);
      } else {
        await sendMessage(chatId, 'Usage: `/forget keyword`');
      }
      return res.status(200).send('OK');
    }

    // /clearmemory — clear ALL memory
    if (text === '/clearmemory') {
      memory.clearMemory(chatId);
      await sendMessage(chatId, 'Semua memory (chat history + long-term) sudah dihapus.');
      return res.status(200).send('OK');
    }

    // ========================
    // PC REMOTE COMMANDS
    // ========================

    // /pc <cmd> or /run <cmd>
    if (text.startsWith('/pc ') || text.startsWith('/run ')) {
      const cmd = text.replace(/^\/(pc|run)\s+/, '').trim();
      if (!cmd) {
        await sendMessage(chatId, 'Usage: `/pc <command>`\nContoh: `/pc dir C:\\`');
        return res.status(200).send('OK');
      }
      const queued = pushCommand('shell', cmd, chatId);
      await sendMessage(chatId, `Queued: \`${cmd}\`\n_Menunggu PC agent... (${queued.id.slice(-6)})_`);
      return res.status(200).send('OK');
    }

    // /open <target> or /buka <target>
    if (text.startsWith('/open ') || text.startsWith('/buka ')) {
      const target = text.replace(/^\/(open|buka)\s+/, '').trim();
      if (!target) {
        await sendMessage(chatId, 'Usage: `/open <url/app>`\nContoh: `/open youtube.com`');
        return res.status(200).send('OK');
      }
      const queued = pushCommand('open', target, chatId);
      await sendMessage(chatId, `Opening: *${target}*\n_Menunggu PC agent... (${queued.id.slice(-6)})_`);
      return res.status(200).send('OK');
    }

    // /ss or /screenshot
    if (text === '/ss' || text === '/screenshot') {
      const queued = pushCommand('screenshot', '', chatId);
      await sendMessage(chatId, `Taking screenshot...\n_Menunggu PC agent... (${queued.id.slice(-6)})_`);
      return res.status(200).send('OK');
    }

    // /pcstatus
    if (text === '/pcstatus') {
      const queue = loadQueue();
      const pending = queue.filter(c => c.status === 'pending').length;
      const processing = queue.filter(c => c.status === 'processing').length;
      await sendMessage(
        chatId,
        `*PC Queue Status:*\nPending: ${pending}\nProcessing: ${processing}\nTotal: ${queue.length}`
      );
      return res.status(200).send('OK');
    }

    // ========================
    // STANDARD COMMANDS
    // ========================

    if (text === '/status') {
      await sendMessage(
        chatId,
        '*Manus3Smart — Status*\n\n' +
          'Platform: Vercel Serverless\n' +
          'Telegram: Connected\n' +
          `AI Model: ${Object.values(AVAILABLE_MODELS).find(m => m.id === getChatModel(chatId))?.name || getChatModel(chatId)}\n` +
          'PC Remote: Available\n' +
          'Auth: Logged in'
      );
    } else if (text === '/help') {
      await sendMessage(
        chatId,
        '*Manus3Smart — Commands*\n\n' +
          '*Chat & Info:*\n' +
          '/start — Intro\n' +
          '/login — Login\n' +
          '/logout — Logout\n' +
          '/status — Cek kondisi\n' +
          '/myid — Lihat chat ID\n' +
          '/help — Commands ini\n\n' +
          '*PC Remote:*\n' +
          '/pc <cmd> — Jalankan command\n' +
          '/run <cmd> — Alias /pc\n' +
          '/open <url/app> — Buka di PC\n' +
          '/buka <url/app> — Alias /open\n' +
          '/ss — Screenshot PC\n' +
          '/pcstatus — Cek queue\n' +
          '/model — Ganti AI model\n\n' +
          '*Memory:*\n' +
          '/memory — Lihat semua memory\n' +
          '/remember <fakta> — Simpan fakta\n' +
          '/forget <keyword> — Hapus memory\n' +
          '/clearmemory — Hapus semua\n\n' +
          'Chat biasa → dijawab AI dengan MEMORY!'
      );
    } else if (text && !text.startsWith('/')) {
      // Smart detection: PC command or regular chat?
      try {
        await sendChatAction(chatId, 'typing');
        if (NVIDIA_KEYS.length === 0) {
          await sendMessage(chatId, 'AI belum dikonfigurasi. Hubungi admin.');
          return res.status(200).send('OK');
        }

        // Step 1: Detect if this is a PC command
        // Save user message to memory
        memory.addMessage(chatId, 'user', text);

        const detected = await detectPCCommand(text, chatId);
        console.log('Detected:', JSON.stringify(detected));

        if (detected.action === 'open' && detected.target) {
          const queued = pushCommand('open', detected.target, chatId);
          await sendMessage(chatId, detected.reply || `Opening: *${detected.target}*\n_Menunggu PC..._`);
          return res.status(200).send('OK');
        }

        if (detected.action === 'shell' && detected.command) {
          const queued = pushCommand('shell', detected.command, chatId);
          await sendMessage(chatId, detected.reply || `Running: \`${detected.command}\`\n_Menunggu PC..._`);
          return res.status(200).send('OK');
        }

        if (detected.action === 'screenshot') {
          const queued = pushCommand('screenshot', '', chatId);
          await sendMessage(chatId, detected.reply || 'Taking screenshot...');
          return res.status(200).send('OK');
        }

        if (detected.action === 'sendfile' && detected.filepath) {
          const queued = pushCommand('sendfile', detected.filepath, chatId);
          await sendMessage(chatId, detected.reply || `Mengirim file: ${detected.filepath}`);
          return res.status(200).send('OK');
        }

        if (detected.action === 'readfile' && detected.filepath) {
          const queued = pushCommand('readfile', detected.filepath, chatId);
          await sendMessage(chatId, detected.reply || `Membaca file: ${detected.filepath}`);
          return res.status(200).send('OK');
        }

        if (detected.action === 'reviewfile' && detected.filepath) {
          // Queue readfile, but with reviewfile type so local agent reads & sends back content
          // Then we'll feed that content to AI for analysis
          const question = detected.question || 'review isi file ini';
          const queued = pushCommand('reviewfile', JSON.stringify({ filepath: detected.filepath, question }), chatId);
          await sendMessage(chatId, detected.reply || `Membaca & menganalisis file...`);
          return res.status(200).send('OK');
        }

        if (detected.action === 'sysinfo') {
          const queued = pushCommand('sysinfo', '', chatId);
          await sendMessage(chatId, detected.reply || 'Mengecek info PC...');
          return res.status(200).send('OK');
        }

        if (detected.action === 'playaudio' && detected.filepath) {
          const queued = pushCommand('playaudio', detected.filepath, chatId);
          await sendMessage(chatId, detected.reply || 'Memutar audio...');
          return res.status(200).send('OK');
        }

        if (detected.action === 'randomvideo') {
          const site = detected.site || 'youtube.com';
          const video = await searchRandomVideo(detected.query || '', site);
          if (video) {
            const queued = pushCommand('open', video.url, chatId);
            // For non-YouTube sites, send a delayed spacebar press to auto-play
            const domain = site.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
            if (domain !== 'youtube.com') {
              pushCommand('shell', 'powershell -Command "Start-Sleep -Seconds 4; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\' \')"', chatId);
            }
            await sendMessage(chatId, `${detected.reply || 'Memutar video random...'}\n*${video.title}*`);
          } else {
            // Fallback: buka site biasa
            const queued = pushCommand('open', `https://www.${site}`, chatId);
            await sendMessage(chatId, `Tidak bisa cari random, membuka ${site}...`);
          }
          return res.status(200).send('OK');
        }

        // Handle "remember" action — save to long-term memory
        if (detected.action === 'remember' && detected.fact) {
          memory.remember(chatId, detected.fact);
          await sendMessage(chatId, detected.reply || `Oke, aku ingat: "${detected.fact}"`);
          memory.addMessage(chatId, 'assistant', detected.reply || `Saved to memory: ${detected.fact}`);
          return res.status(200).send('OK');
        }

        // Handle semua aksi X/Twitter — queue ke local gateway (butuh Chrome di PC)
        // Pakai PowerShell + temp script file untuk hindari backslash escaping hell
        const xAllActions = ['post_x','reply_x','quote_x','like_x','unlike_x',
                             'read_replies','read_mentions','read_tweet','engage_tweet'];
        if (xAllActions.includes(detected.action)) {
          const SD = 'D:/.agents/skills/baoyu-post-to-x/scripts';
          const CH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
          let scriptContent = '';

          if (detected.action === 'post_x') {
            const txt = (detected.text || '').replace(/"/g, '\\"');
            const imgs = (detected.images || []).map(p => `,"${p}"`).join('');
            scriptContent = `require("dotenv").config({path:"D:/manus3/.env"});const {execFileSync}=require("child_process");execFileSync("npx",["-y","bun","${SD}/x-browser.ts","${txt}"${imgs},"--submit"],{stdio:"inherit",shell:true,env:{...process.env,X_BROWSER_CHROME_PATH:"${CH}"}});`;

          } else if (detected.action === 'reply_x') {
            const txt = (detected.text || '').replace(/"/g, '\\"');
            scriptContent = `require("dotenv").config({path:"D:/manus3/.env"});const {execFileSync}=require("child_process");execFileSync("npx",["-y","bun","${SD}/x-reply.ts","${detected.tweetUrl}","${txt}","--submit"],{stdio:"inherit",shell:true,env:{...process.env,X_BROWSER_CHROME_PATH:"${CH}"}});`;

          } else if (detected.action === 'like_x' || detected.action === 'unlike_x') {
            const flag = detected.action === 'unlike_x' ? ',"--unlike"' : '';
            scriptContent = `const {execFileSync}=require("child_process");execFileSync("npx",["-y","bun","${SD}/x-like.ts","${detected.tweetUrl}"${flag}],{stdio:"inherit",shell:true,env:{...process.env,X_BROWSER_CHROME_PATH:"${CH}"}});`;

          } else if (detected.action === 'read_replies') {
            scriptContent = `const {execFileSync}=require("child_process");execFileSync("npx",["-y","bun","${SD}/x-read-replies.ts","${detected.tweetUrl}","--limit","${detected.limit||10}"],{stdio:"inherit",shell:true,env:{...process.env,X_BROWSER_CHROME_PATH:"${CH}"}});`;

          } else if (detected.action === 'read_mentions') {
            scriptContent = `const {execFileSync}=require("child_process");execFileSync("npx",["-y","bun","${SD}/x-mentions.ts","--limit","${detected.limit||10}"],{stdio:"inherit",shell:true,env:{...process.env,X_BROWSER_CHROME_PATH:"${CH}"}});`;

          } else if (detected.action === 'read_tweet') {
            scriptContent = `const {execFileSync}=require("child_process");execFileSync("npx",["-y","bun","${SD}/x-read-tweet.ts","${detected.tweetUrl}"],{stdio:"inherit",shell:true,env:{...process.env,X_BROWSER_CHROME_PATH:"${CH}"}});`;

          } else if (detected.action === 'engage_tweet') {
            const persona = detected.persona || 'friendly';
            const lang = detected.lang || 'auto';
            const like = detected.autoLike ? 'true' : 'false';
            scriptContent = `require("dotenv").config({path:"D:/manus3/.env"});const e=require("D:/manus3/public/skills/x-auto-engage");e.engageTweet("${detected.tweetUrl}",{persona:"${persona}",lang:"${lang}",autoLike:${like},submit:true}).then(r=>console.log("Done:",r.comment)).catch(err=>console.error(err.message));`;
          }

          if (scriptContent) {
            const ts = Date.now();
            const tmpFile = `D:/manus3/tmp_x_${ts}.js`;
            // Encode script as base64, decode + write + run — no escaping issues
            const b64 = Buffer.from(scriptContent).toString('base64');
            const cmd = `node -e "require('fs').writeFileSync('${tmpFile}',Buffer.from('${b64}','base64').toString())" && node "${tmpFile}"`;
            pushCommand('shell', cmd, chatId);
            await sendMessage(chatId, detected.reply || `⏳ Mengirim ke PC lokal...`);
          }
          return res.status(200).send('OK');
        }

        // Handle "social" action — post ke media sosial
        if (detected.action === 'social' && detected.text) {
          const socialSkill = require('./_skills/social-media');
          const platformRaw = (detected.platform || 'all').toLowerCase();
          let platforms;
          if (platformRaw === 'all') {
            platforms = ['twitter', 'facebook', 'linkedin', 'instagram'];
          } else {
            platforms = platformRaw.split(',').map(p => p.trim());
          }
          await sendMessage(chatId, detected.reply || `Posting ke ${platforms.join(', ')}...`);
          try {
            const results = await socialSkill.postToAll({
              text: detected.text,
              imageUrl: detected.imageUrl || null,
              platforms,
            });
            const summary = results.map(r =>
              r.ok ? `✅ ${r.platform}${r.url ? ' — ' + r.url : ''}` : `❌ ${r.platform}: ${r.error}`
            ).join('\n');
            await sendMessage(chatId, `Hasil posting:\n${summary}`);
          } catch (e) {
            await sendMessage(chatId, `Error social posting: ${e.message}`);
          }
          return res.status(200).send('OK');
        }

        // Handle "multi" action — queue multiple commands sequentially
        if (detected.action === 'multi' && Array.isArray(detected.commands)) {
          for (const cmd of detected.commands) {
            if (cmd.action === 'shell' && cmd.command) {
              pushCommand('shell', cmd.command, chatId);
            } else if (cmd.action === 'open' && cmd.target) {
              pushCommand('open', cmd.target, chatId);
            } else if (cmd.action === 'screenshot') {
              pushCommand('screenshot', '', chatId);
            } else if (cmd.action === 'playaudio' && cmd.filepath) {
              pushCommand('playaudio', cmd.filepath, chatId);
            }
          }
          await sendMessage(chatId, detected.reply || `Menjalankan ${detected.commands.length} perintah...`);
          return res.status(200).send('OK');
        }

        // Step 2: Not a PC command → regular AI chat (with full memory)
        const aiResponse = await callAI(text, getChatModel(chatId), chatId);
        if (aiResponse) {
          // Auto-detect [REMEMBER: ...] in AI response for auto-memory
          const rememberMatch = aiResponse.match(/\[REMEMBER:\s*(.+?)\]/i);
          if (rememberMatch) {
            memory.remember(chatId, rememberMatch[1].trim());
          }
          const cleanResponse = aiResponse.replace(/\[REMEMBER:\s*.+?\]/gi, '').trim();
          memory.addMessage(chatId, 'assistant', cleanResponse);
          await sendMessage(chatId, cleanResponse);
        } else {
          await sendMessage(chatId, 'Maaf, AI tidak memberikan respons. Coba lagi nanti.');
        }
      } catch (e) {
        console.error('AI call error:', e);
        await sendMessage(chatId, 'Maaf, lagi error. Coba lagi nanti ya.');
      }
    }
  }

  return res.status(200).send('OK');
};
