/**
 * Telegram Webhook Handler — Vercel Serverless Function
 *
 * Endpoint: POST /api/webhook
 * Set webhook via: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<domain>/api/webhook
 *
 * AI-powered: sends user messages to NVIDIA NIM API (Kimi K2) and returns AI response.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// API key rotation — kalau satu kena rate limit, coba key lain
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
  // Coba sampai 3 key berbeda kalau kena rate limit
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

    // Handle commands
    if (text === '/start') {
      await sendMessage(
        chatId,
        '*Halo bro! Manus3 AI Agent di sini!*\n\n' +
          'Saya AI-powered, jalan di Vercel 24/7.\n' +
          'Langsung chat aja, saya jawab pakai AI.\n\n' +
          '/status — Cek kondisi\n' +
          '/help — Lihat commands'
      );
    } else if (text === '/status') {
      await sendMessage(
        chatId,
        '*Manus3 — Status*\n\n' +
          'Platform: Vercel Serverless\n' +
          'Telegram: Connected\n' +
          'AI: NVIDIA NIM (Kimi K2)\n' +
          'Mode: Autonomous 24/7'
      );
    } else if (text === '/help') {
      await sendMessage(
        chatId,
        '*Manus3 — Commands*\n\n' +
          '/start — Intro\n' +
          '/status — Cek kondisi\n' +
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
