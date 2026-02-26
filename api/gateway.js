/**
 * Gateway API — Vercel Serverless Endpoint
 * Handles communication between local gateway client and Telegram bot
 *
 * GET  ?action=poll&secret=xxx    — poll pending tasks
 * GET  ?action=status&secret=xxx  — check gateway status
 * POST {action:"result", taskId, result, secret}  — receive results, send to Telegram
 * POST {action:"heartbeat", secret} — update gateway heartbeat
 */

const redis = require('./_lib/redis');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GATEWAY_SECRET = process.env.GATEWAY_SECRET;
const TASK_TTL = 300;
const HEARTBEAT_TTL = 30;

function verifySecret(secret) {
  if (!GATEWAY_SECRET) return true;
  return secret === GATEWAY_SECRET;
}

async function sendTelegram(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    if (!resp.ok) {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    }
  } catch (e) {
    console.error('Telegram send error:', e.message);
  }
}

async function handlePoll(secret) {
  if (!verifySecret(secret)) return { status: 401, body: { error: 'Invalid secret' } };

  const raw = await redis.rpop('tasks:pending');
  if (!raw) return { status: 200, body: { task: null } };

  let task;
  try { task = JSON.parse(raw); } catch { return { status: 200, body: { task: null } }; }

  await redis.set(`task:${task.id}:status`, 'in_progress', TASK_TTL);
  return { status: 200, body: { task } };
}

async function handleStatus(secret) {
  if (!verifySecret(secret)) return { status: 401, body: { error: 'Invalid secret' } };

  const heartbeat = await redis.get('gateway:heartbeat');
  const pendingCount = await redis.llen('tasks:pending') || 0;

  return {
    status: 200,
    body: {
      gateway: heartbeat ? 'online' : 'offline',
      lastHeartbeat: heartbeat || null,
      pendingTasks: pendingCount,
    },
  };
}

async function handleResult(body) {
  if (!verifySecret(body.secret)) return { status: 401, body: { error: 'Invalid secret' } };

  const { taskId, result } = body;
  if (!taskId || result === undefined) return { status: 400, body: { error: 'taskId and result required' } };

  const taskRaw = await redis.get(`task:${taskId}`);
  if (!taskRaw) return { status: 404, body: { error: 'Task not found or expired' } };

  let task;
  try { task = JSON.parse(taskRaw); } catch { return { status: 500, body: { error: 'Corrupted task data' } }; }

  const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  const maxLen = 4000;

  // Special: Grok response marker
  let header;
  const grokMarkerIdx = resultText.indexOf('__GROK__:');
  if (grokMarkerIdx !== -1) {
    const grokResponse = resultText.substring(grokMarkerIdx + '__GROK__:'.length).split('\n')[0].trim();
    header = `*🤖 Grok AI:*\n${grokResponse.length > maxLen ? grokResponse.substring(0, maxLen) + '...' : grokResponse}`;
  } else {
    const truncated = resultText.length > maxLen
      ? resultText.substring(0, maxLen) + '\n\n... (truncated)'
      : resultText;
    header = task.type === 'command'
      ? `*Terminal Output:*\n\`\`\`\n${truncated}\n\`\`\``
      : `*Agent Response:*\n${truncated}`;
  }

  await sendTelegram(task.chatId, header);
  await redis.del(`task:${taskId}`);
  await redis.del(`task:${taskId}:status`);

  return { status: 200, body: { ok: true } };
}

async function handleHeartbeat(body) {
  if (!verifySecret(body.secret)) return { status: 401, body: { error: 'Invalid secret' } };
  await redis.set('gateway:heartbeat', new Date().toISOString(), HEARTBEAT_TTL);
  return { status: 200, body: { ok: true } };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { action, secret } = req.query;
      if (action === 'poll') { const r = await handlePoll(secret); return res.status(r.status).json(r.body); }
      if (action === 'status') { const r = await handleStatus(secret); return res.status(r.status).json(r.body); }
      return res.status(400).json({ error: 'Unknown action. Use: poll, status' });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (body.action === 'result') { const r = await handleResult(body); return res.status(r.status).json(r.body); }
      if (body.action === 'heartbeat') { const r = await handleHeartbeat(body); return res.status(r.status).json(r.body); }
      return res.status(400).json({ error: 'Unknown action. Use: result, heartbeat' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Gateway error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
