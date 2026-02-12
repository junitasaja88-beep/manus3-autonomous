/**
 * Telegram Webhook Handler — Vercel Serverless Function
 *
 * Endpoint: POST /api/webhook
 * Set webhook via: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<domain>/api/webhook
 *
 * AI-powered: sends user messages to NVIDIA NIM API (Kimi K2) and returns AI response.
 * Password-protected: user harus /login <password> dulu sebelum bisa chat.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_PASSWORD = process.env.BOT_PASSWORD || '';

// Session store — authenticated chat IDs (persist selama instance hidup)
const authenticatedChats = new Set();

// API key rotation
const NVIDIA_KEYS = (process.env.NVIDIA_API_KEYS || process.env.NVIDIA_API_KEY || '').split(',').filter(Boolean);

function getRandomKey() {
  return NVIDIA_KEYS[Math.floor(Math.random() * NVIDIA_KEYS.length)] || null;
}

const SYSTEM_PROMPT =
  'Anda adalah Manus3, AI agent yang berjalan 24/7 di Vercel. ' +
  'Anda cerdas, santai, dan membantu. Jawab dalam bahasa yang sama dengan user. ' +
  'Kalau user pakai Bahasa Indonesia, jawab dalam Bahasa Indonesia. ' +
  'Kalau user pakai English, jawab dalam English. ' +
  'Jaga jawaban tetap ringkas dan berguna.';

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
      parse_mode: 'Markdown',
    }),
  });
}

async function sendChatAction(chatId, action) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
}

async function callAI(userMessage) {
  const tried = new Set();
  for (let attempt = 0; attempt < 3; attempt++) {
    let key = getRandomKey();
    while (key && tried.has(key) && tried.size < NVIDIA_KEYS.length) {
      key = getRandomKey();
    }
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
          model: 'moonshotai/kimi-k2-instruct-0905',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 1024,
        }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        console.log(`Key ${key.slice(0, 12)}... rate limited, trying next`);
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

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, endpoint: 'telegram-webhook' });
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  if (!BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN not set');
    return res.status(500).send('Bot token not configured');
  }

  const update = req.body;

  if (update.message) {
    const chatId = update.message.chat.id;
    const text = (update.message.text || '').trim();

    // /myid — selalu bisa
    if (text === '/myid') {
      await sendMessage(chatId, `Chat ID kamu: \`${chatId}\``);
      return res.status(200).send('OK');
    }

    // /start — selalu bisa, kasih info login
    if (text === '/start') {
      const loggedIn = authenticatedChats.has(chatId);
      await sendMessage(
        chatId,
        '*Halo! Manus3 AI Agent di sini!*\n\n' +
          (loggedIn
            ? 'Kamu sudah login. Langsung chat aja!\n\n'
            : 'Kirim `/login <password>` untuk mulai.\n\n') +
          '/login — Login dengan password\n' +
          '/logout — Logout\n' +
          '/status — Cek kondisi\n' +
          '/help — Lihat commands'
      );
      return res.status(200).send('OK');
    }

    // /login <password> — authenticate
    if (text === '/login' || text.startsWith('/login ') || text.startsWith('/login@')) {
      if (!BOT_PASSWORD) {
        authenticatedChats.add(chatId);
        await sendMessage(chatId, 'Login berhasil! Langsung chat aja.');
        return res.status(200).send('OK');
      }

      // Parse password: handle /login pw, /login@botname pw
      const inputPassword = text.replace(/^\/login(@\S+)?\s*/, '').trim();
      if (!inputPassword) {
        await sendMessage(chatId, 'Kirim: `/login password`');
        return res.status(200).send('OK');
      }

      if (inputPassword === BOT_PASSWORD.trim()) {
        authenticatedChats.add(chatId);
        await sendMessage(chatId, 'Login berhasil! Sekarang kamu bisa chat dengan AI.');
        return res.status(200).send('OK');
      } else {
        console.log(`Login failed for ${chatId}: got "${inputPassword}" expected "${BOT_PASSWORD.trim()}"`);
        await sendMessage(chatId, 'Password salah.');
        return res.status(200).send('OK');
      }
    }

    // /logout
    if (text === '/logout') {
      authenticatedChats.delete(chatId);
      await sendMessage(chatId, 'Logout berhasil. Kirim `/login <password>` untuk masuk lagi.');
      return res.status(200).send('OK');
    }

    // Cek authentication — kalau BOT_PASSWORD di-set, harus login dulu
    if (BOT_PASSWORD && !authenticatedChats.has(chatId)) {
      await sendMessage(chatId, 'Kirim `/login <password>` dulu untuk mulai.');
      return res.status(200).send('OK');
    }

    // Handle commands (authenticated)
    if (text === '/status') {
      await sendMessage(
        chatId,
        '*Manus3 — Status*\n\n' +
          'Platform: Vercel Serverless\n' +
          'Telegram: Connected\n' +
          'AI: NVIDIA NIM (Kimi K2)\n' +
          'Mode: Autonomous 24/7\n' +
          'Auth: Logged in'
      );
    } else if (text === '/help') {
      await sendMessage(
        chatId,
        '*Manus3 — Commands*\n\n' +
          '/start — Intro\n' +
          '/login — Login\n' +
          '/logout — Logout\n' +
          '/status — Cek kondisi\n' +
          '/myid — Lihat chat ID\n' +
          '/help — Commands ini\n\n' +
          'Atau langsung chat biasa, saya jawab pakai AI!'
      );
    } else if (text) {
      // AI-powered reply
      try {
        await sendChatAction(chatId, 'typing');

        if (NVIDIA_KEYS.length === 0) {
          await sendMessage(chatId, 'AI belum dikonfigurasi. Hubungi admin.');
          return res.status(200).send('OK');
        }

        const aiResponse = await callAI(text);

        if (aiResponse) {
          await sendMessage(chatId, aiResponse);
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
