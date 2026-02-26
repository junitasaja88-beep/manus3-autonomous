/**
 * Skill: Social Media Posting
 * Post ke X/Twitter, Facebook, Instagram, LinkedIn
 *
 * Cara setup API keys di .env atau environment Vercel:
 *   TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET
 *   FACEBOOK_ACCESS_TOKEN, FACEBOOK_PAGE_ID
 *   LINKEDIN_ACCESS_TOKEN
 *   INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD  (Puppeteer)
 */

const { execSync } = require('child_process');
const path = require('path');

// ─── Twitter/X ────────────────────────────────────────────────────────────────
async function postToTwitter(text) {
  try {
    const { TwitterApi } = require('twitter-api-v2');
    const client = new TwitterApi({
      appKey:           process.env.TWITTER_API_KEY,
      appSecret:        process.env.TWITTER_API_SECRET,
      accessToken:      process.env.TWITTER_ACCESS_TOKEN,
      accessSecret:     process.env.TWITTER_ACCESS_SECRET,
    });
    const rwClient = client.readWrite;
    const { data } = await rwClient.v2.tweet(text);
    return { ok: true, platform: 'Twitter/X', id: data.id, url: `https://x.com/i/web/status/${data.id}` };
  } catch (e) {
    return { ok: false, platform: 'Twitter/X', error: e.message };
  }
}

// ─── Facebook Page ─────────────────────────────────────────────────────────────
async function postToFacebook(text) {
  try {
    const axios = require('axios');
    const pageId    = process.env.FACEBOOK_PAGE_ID;
    const pageToken = process.env.FACEBOOK_ACCESS_TOKEN;
    const res = await axios.post(
      `https://graph.facebook.com/v19.0/${pageId}/feed`,
      { message: text, access_token: pageToken }
    );
    return { ok: true, platform: 'Facebook', id: res.data.id };
  } catch (e) {
    return { ok: false, platform: 'Facebook', error: e.response?.data?.error?.message || e.message };
  }
}

// ─── LinkedIn ──────────────────────────────────────────────────────────────────
async function postToLinkedIn(text) {
  try {
    const axios = require('axios');
    const token = process.env.LINKEDIN_ACCESS_TOKEN;
    // Get profile URN first
    const profile = await axios.get('https://api.linkedin.com/v2/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const urn = `urn:li:person:${profile.data.id}`;
    const res = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      {
        author: urn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
      },
      { headers: { Authorization: `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' } }
    );
    return { ok: true, platform: 'LinkedIn', id: res.data.id };
  } catch (e) {
    return { ok: false, platform: 'LinkedIn', error: e.response?.data?.message || e.message };
  }
}

// ─── Instagram (Puppeteer - personal/headless) ─────────────────────────────────
async function postToInstagram(text, imageUrl) {
  // Instagram Basic Display API tidak support posting.
  // Untuk business account: gunakan Instagram Graph API + Facebook Business
  // Untuk personal: pakai puppeteer (rawan TOS, hanya untuk personal use)
  try {
    const igToken  = process.env.INSTAGRAM_GRAPH_TOKEN;
    const igUserId = process.env.INSTAGRAM_USER_ID;
    if (!igToken || !igUserId) throw new Error('INSTAGRAM_GRAPH_TOKEN atau INSTAGRAM_USER_ID belum diset');
    if (!imageUrl) throw new Error('Instagram wajib ada imageUrl untuk posting');

    const axios = require('axios');
    // Step 1: Create container
    const container = await axios.post(
      `https://graph.facebook.com/v19.0/${igUserId}/media`,
      { image_url: imageUrl, caption: text, access_token: igToken }
    );
    // Step 2: Publish
    const publish = await axios.post(
      `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
      { creation_id: container.data.id, access_token: igToken }
    );
    return { ok: true, platform: 'Instagram', id: publish.data.id };
  } catch (e) {
    return { ok: false, platform: 'Instagram', error: e.response?.data?.error?.message || e.message };
  }
}

// ─── Master: post ke semua platform ───────────────────────────────────────────
async function postToAll({ text, imageUrl, platforms }) {
  const targets = platforms || ['twitter', 'facebook', 'linkedin', 'instagram'];
  const results = [];

  if (targets.includes('twitter'))   results.push(await postToTwitter(text));
  if (targets.includes('facebook'))  results.push(await postToFacebook(text));
  if (targets.includes('linkedin'))  results.push(await postToLinkedIn(text));
  if (targets.includes('instagram')) results.push(await postToInstagram(text, imageUrl));

  return results;
}

module.exports = {
  name: 'SocialMedia',

  // ── Fungsi yang bisa dipanggil langsung oleh agent ──
  postToTwitter,
  postToFacebook,
  postToLinkedIn,
  postToInstagram,
  postToAll,

  hints: `
SOCIAL MEDIA POSTING:

Post ke Twitter/X saja:
{"action":"social","platform":"twitter","text":"Halo dunia dari Manus! #AI #Agent"}

Post ke Facebook Page saja:
{"action":"social","platform":"facebook","text":"Update dari Manus Agent 🚀"}

Post ke LinkedIn saja:
{"action":"social","platform":"linkedin","text":"Excited to share this update from my AI agent!"}

Post ke Instagram (butuh imageUrl, perlu business account):
{"action":"social","platform":"instagram","text":"Caption keren 📸 #AI","imageUrl":"https://example.com/foto.jpg"}

Post ke SEMUA platform sekaligus:
{"action":"social","platform":"all","text":"Halo dari Manus di semua platform! 🌍"}

Post ke beberapa platform tertentu:
{"action":"social","platform":"twitter,linkedin","text":"Big news! AI agent is live."}

CATATAN ENV VARS yang diperlukan:
  Twitter:   TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET
  Facebook:  FACEBOOK_PAGE_ID, FACEBOOK_ACCESS_TOKEN
  LinkedIn:  LINKEDIN_ACCESS_TOKEN
  Instagram: INSTAGRAM_USER_ID, INSTAGRAM_GRAPH_TOKEN (butuh FB Business/Creator account)
`.trim(),
};
