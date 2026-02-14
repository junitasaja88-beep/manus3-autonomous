/**
 * Memory System — Per-chat conversation history
 *
 * Stores recent messages in /tmp (Vercel) so AI has context of previous chats.
 * File-based, no external DB needed. Works same as queue system.
 *
 * Each chat gets last N messages stored. Old messages auto-pruned.
 */
const fs = require('fs');

const MEMORY_FILE = '/tmp/manus3_memory.json';
const MAX_MESSAGES_PER_CHAT = 20;  // Keep last 20 messages per chat
const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour memory window

// === Load/Save ===
function loadMemory() {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')) || {};
    }
  } catch {}
  return {};
}

function saveMemory(data) {
  try {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(data), 'utf8');
  } catch (e) {
    console.error('Memory save error:', e.message);
  }
}

/**
 * Add a message to chat history
 * @param {string|number} chatId
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - message text
 */
function addMessage(chatId, role, content) {
  const mem = loadMemory();
  const key = String(chatId);

  if (!mem[key]) mem[key] = [];

  mem[key].push({
    role,
    content: content.slice(0, 500), // Limit per message
    ts: Date.now(),
  });

  // Prune old messages
  const cutoff = Date.now() - MAX_AGE_MS;
  mem[key] = mem[key].filter(m => m.ts > cutoff);

  // Keep only last N
  while (mem[key].length > MAX_MESSAGES_PER_CHAT) mem[key].shift();

  saveMemory(mem);
}

/**
 * Get conversation history as messages array for AI API
 * Returns array of { role, content } ready for chat completion
 * @param {string|number} chatId
 * @param {number} limit - max messages to return (default 10)
 */
function getHistory(chatId, limit = 10) {
  const mem = loadMemory();
  const key = String(chatId);
  const messages = mem[key] || [];

  // Prune expired
  const cutoff = Date.now() - MAX_AGE_MS;
  const valid = messages.filter(m => m.ts > cutoff);

  return valid.slice(-limit).map(m => ({
    role: m.role,
    content: m.content,
  }));
}

/**
 * Get history as text block for injection into prompts
 * @param {string|number} chatId
 * @param {number} limit
 */
function getHistoryText(chatId, limit = 10) {
  const msgs = getHistory(chatId, limit);
  if (msgs.length === 0) return '';

  return msgs.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n');
}

/**
 * Clear memory for a chat
 * @param {string|number} chatId
 */
function clearMemory(chatId) {
  const mem = loadMemory();
  delete mem[String(chatId)];
  saveMemory(mem);
}

module.exports = { addMessage, getHistory, getHistoryText, clearMemory };
