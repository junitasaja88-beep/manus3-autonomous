/**
 * Cron Active Agent — Vercel Serverless Function
 * Endpoint: GET /api/cron (dipanggil Vercel Cron setiap 30 menit)
 *
 * Actions: check DMs, read feed, comment, upvote, sometimes post new content.
 * AI-powered via NVIDIA NIM API (Kimi K2).
 */

const MOLTBOOK_BASE = 'https://www.moltbook.com/api/v1';

function getEnv() {
  return {
    moltbookKey: process.env.MOLTBOOK_API_KEY,
    nvidiaKey: process.env.NVIDIA_API_KEY,
  };
}

function moltHeaders(apiKey) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

async function callAI(nvidiaKey, systemPrompt, userMessage) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${nvidiaKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'moonshotai/kimi-k2-instruct-0905',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 512,
      }),
      signal: controller.signal,
    });

    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } finally {
    clearTimeout(timeout);
  }
}

// --- DM Check & Reply ---
async function checkAndReplyDMs(env, actions) {
  try {
    const res = await fetch(`${MOLTBOOK_BASE}/agents/dm/check`, {
      headers: moltHeaders(env.moltbookKey),
    });
    const data = await res.json();

    if (!data.conversations || data.conversations.length === 0) {
      actions.push('DMs: no unread');
      return;
    }

    for (const convo of data.conversations.slice(0, 3)) {
      try {
        const convoRes = await fetch(
          `${MOLTBOOK_BASE}/agents/dm/conversations/${convo.id}`,
          { headers: moltHeaders(env.moltbookKey) }
        );
        const convoData = await convoRes.json();
        const lastMsg = convoData.messages?.[convoData.messages.length - 1];

        if (!lastMsg || lastMsg.is_own) continue;

        const reply = await callAI(
          env.nvidiaKey,
          'Anda adalah Manus3, AI agent di Moltbook. Balas DM dengan ramah dan singkat. Bahasa mengikuti pesan user.',
          lastMsg.content || 'hi'
        );

        if (reply) {
          await fetch(
            `${MOLTBOOK_BASE}/agents/dm/conversations/${convo.id}/send`,
            {
              method: 'POST',
              headers: moltHeaders(env.moltbookKey),
              body: JSON.stringify({ content: reply }),
            }
          );
          actions.push(`DM replied: convo ${convo.id}`);
        }
      } catch (e) {
        actions.push(`DM error convo ${convo.id}: ${e.message}`);
      }
    }
  } catch (e) {
    actions.push(`DM check error: ${e.message}`);
  }
}

// --- Read Feed, Upvote & Comment ---
async function engageWithFeed(env, actions) {
  try {
    const res = await fetch(`${MOLTBOOK_BASE}/posts?sort=hot&limit=5`, {
      headers: moltHeaders(env.moltbookKey),
    });
    const data = await res.json();
    const posts = data.posts || data || [];

    if (!Array.isArray(posts) || posts.length === 0) {
      actions.push('Feed: no posts found');
      return;
    }

    // Pick one post to engage with
    const post = posts[Math.floor(Math.random() * Math.min(posts.length, 3))];
    const postId = post.id || post._id;

    if (!postId) {
      actions.push('Feed: post has no ID');
      return;
    }

    // Upvote
    try {
      await fetch(`${MOLTBOOK_BASE}/posts/${postId}/upvote`, {
        method: 'POST',
        headers: moltHeaders(env.moltbookKey),
      });
      actions.push(`Upvoted post ${postId}`);
    } catch (e) {
      actions.push(`Upvote error: ${e.message}`);
    }

    // Generate & post comment
    const postTitle = post.title || post.content || 'untitled';
    const comment = await callAI(
      env.nvidiaKey,
      'Anda adalah Manus3, AI agent di Moltbook. Tulis komentar singkat (1-2 kalimat) yang relevan dan menarik untuk post ini. Jangan gunakan hashtag berlebihan. Bahasa Indonesia.',
      `Post title: "${postTitle}"\nPost content: "${(post.content || '').slice(0, 300)}"`
    );

    if (comment) {
      await fetch(`${MOLTBOOK_BASE}/posts/${postId}/comments`, {
        method: 'POST',
        headers: moltHeaders(env.moltbookKey),
        body: JSON.stringify({ content: comment }),
      });
      actions.push(`Commented on post ${postId}`);
    }
  } catch (e) {
    actions.push(`Feed error: ${e.message}`);
  }
}

// --- Sometimes Create New Post ---
async function maybeCreatePost(env, actions) {
  // ~50% chance to post
  if (Math.random() > 0.5) {
    actions.push('Post: skipped (random)');
    return;
  }

  try {
    const topics = [
      'Tren terbaru di dunia AI agents dan autonomous systems',
      'Bagaimana AI mengubah cara kita berinteraksi di media sosial',
      'Tips membangun AI agent yang berjalan 24/7',
      'Masa depan kolaborasi manusia dan AI',
      'Apa yang membuat AI agent berbeda dari chatbot biasa',
      'Perkembangan LLM dan dampaknya pada developer',
    ];
    const topic = topics[Math.floor(Math.random() * topics.length)];

    const generated = await callAI(
      env.nvidiaKey,
      'Anda adalah Manus3, AI agent di Moltbook. Buat post pendek (2-3 paragraf) tentang topik yang diberikan. Gaya santai tapi informatif. Bahasa Indonesia. Jangan pakai heading markdown.',
      `Topik: ${topic}`
    );

    if (!generated) {
      actions.push('Post: AI returned empty');
      return;
    }

    // Extract a short title from the first sentence
    const title = generated.split(/[.\n]/)[0].slice(0, 100) || 'Thoughts dari Manus3';

    const res = await fetch(`${MOLTBOOK_BASE}/posts`, {
      method: 'POST',
      headers: moltHeaders(env.moltbookKey),
      body: JSON.stringify({
        submolt: 'general',
        title,
        content: generated,
      }),
    });

    const data = await res.json();
    actions.push(`New post created: ${data.id || data._id || 'ok'}`);
  } catch (e) {
    actions.push(`Post error: ${e.message}`);
  }
}

// --- Main Handler ---
module.exports = async (req, res) => {
  const env = getEnv();

  if (!env.moltbookKey) {
    return res.status(200).json({ success: false, error: 'MOLTBOOK_API_KEY not set' });
  }

  if (!env.nvidiaKey) {
    return res.status(200).json({ success: false, error: 'NVIDIA_API_KEY not set' });
  }

  const actions = [];

  try {
    // Run DM check, feed engagement, and maybe post — sequentially to stay within timeout
    await checkAndReplyDMs(env, actions);
    await engageWithFeed(env, actions);
    await maybeCreatePost(env, actions);

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      actions,
    });
  } catch (error) {
    console.error('Cron error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      actions,
    });
  }
};
