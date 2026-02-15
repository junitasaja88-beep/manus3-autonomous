/**
 * Command Queue API — Bridge between Telegram (Vercel) and Local PC Agent
 *
 * POST /api/commands          — Push a new command (from webhook)
 * GET  /api/commands          — Local agent polls for pending commands
 * POST /api/commands?action=result — Local agent sends back execution result
 *
 * Uses /tmp file for persistence across function invocations within same Vercel instance.
 * Falls back to globalThis for warm-start memory sharing.
 */

const fs = require('fs');
const path = require('path');

const AGENT_SECRET = process.env.AGENT_SECRET || 'manus3secret';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const QUEUE_FILE = '/tmp/manus3_commands.json';
const COMMAND_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_QUEUE = 50;

// === Queue persistence via /tmp ===
function loadQueue() {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      const data = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
      return Array.isArray(data) ? data : [];
    }
  } catch {}
  return [];
}

function saveQueue(queue) {
  try {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue), 'utf8');
  } catch (e) {
    console.error('Save queue error:', e.message);
  }
}

function cleanExpired(queue) {
  const now = Date.now();
  return queue.filter(c => now - c.createdAt < COMMAND_TTL);
}

async function sendTelegram(chatId, text) {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4096),
        parse_mode: 'Markdown',
      }),
    });
  } catch (e) {
    console.error('sendTelegram error:', e.message);
  }
}

module.exports = async (req, res) => {
  const action = req.query?.action || '';

  // === GET — Local agent polls for pending commands ===
  if (req.method === 'GET') {
    const secret = req.headers['x-agent-secret'] || req.query?.secret;
    if (secret !== AGENT_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let queue = cleanExpired(loadQueue());

    const cmd = queue.find(c => c.status === 'pending');
    if (!cmd) {
      saveQueue(queue);
      return res.status(200).json({ command: null });
    }

    cmd.status = 'processing';
    cmd.pickedAt = Date.now();
    saveQueue(queue);

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

  // === POST ?action=result — Local agent sends back result ===
  if (req.method === 'POST' && action === 'result') {
    const secret = req.headers['x-agent-secret'] || req.query?.secret;
    if (secret !== AGENT_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id, success, output, error } = req.body || {};
    let queue = loadQueue();
    const cmd = queue.find(c => c.id === id);

    if (cmd) {
      cmd.status = 'done';
      cmd.result = { success, output, error };
      saveQueue(queue);

      if (success) {
        const text = output
          ? `*PC Result:*\n\`\`\`\n${output.slice(0, 3500)}\n\`\`\``
          : 'Done! Command executed.';
        await sendTelegram(cmd.chatId, text);
      } else {
        await sendTelegram(cmd.chatId, `*Error:* ${error || 'Unknown error'}`);
      }
    }

    return res.status(200).json({ ok: true });
  }

  // === POST — Push new command ===
  if (req.method === 'POST' && !action) {
    const secret = req.headers['x-agent-secret'] || req.query?.secret;
    if (secret !== AGENT_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { type, payload, chatId } = req.body || {};
    if (!type || !chatId) {
      return res.status(400).json({ error: 'Missing type or chatId' });
    }

    let queue = cleanExpired(loadQueue());
    while (queue.length >= MAX_QUEUE) queue.shift();

    const cmd = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload: payload || '',
      chatId,
      status: 'pending',
      createdAt: Date.now(),
      result: null,
    };

    queue.push(cmd);
    saveQueue(queue);

    console.log(`Queued: ${cmd.id} type=${type} payload=${payload}`);
    return res.status(200).json({ ok: true, id: cmd.id, queueSize: queue.length });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
