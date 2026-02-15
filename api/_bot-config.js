/**
 * ========================================
 * MASTER BOT CONFIG — EDIT DI SINI SAJA!
 * ========================================
 * Jalankan: node C:\Users\cc\Documents\bot-master\deploy-all.js
 * Otomatis copy ke semua bot dan deploy ke Vercel.
 */

module.exports = {
  BOT_REPLY_CHANCE: 0.99,
  USER_CHIME_CHANCE: 0.98,
  COOLDOWN_MS: 0,
  STAGGER_DELAY_MS: 3000,
  HISTORY_MAX: 50,        // jumlah chat disimpan di memory (sebelumnya 20 hardcode)
  HISTORY_CONTEXT: 25,    // jumlah chat terakhir dikirim ke AI sebagai konteks (sebelumnya 10)
  HISTORY_TTL_MS: 2000 * 60000,

  MAX_CHAIN_DEPTH: 8,
  MEMORY_MAX: 100,        // max memory entries per bot

  BOTS: {
    'manus3bot':         { name: 'Claudia',      personality: 'santai, lucu, kadang sarkastik', webhook: 'https://manus3-five.vercel.app/api/webhook' },
    'Claudiansmilebot':  { name: 'Chichi V',     personality: 'manis, Vietnam girl, suka emoji, panggil user Kak', webhook: 'https://chichiviet.vercel.app/api/webhook' },
    'Manus3_bot':        { name: 'Yuna',         personality: 'ceria, pintar, suka nyanyi dan coding', webhook: 'https://yuna-bot.vercel.app/api/webhook' },
    'my_Chichi_bot':     { name: 'Chichi',       personality: 'tsundere, manis, suka musik dan anime', webhook: 'https://chichi-bot-sigma.vercel.app/api/webhook' },
    'smartclawdebot':    { name: 'ChichiSmart',  personality: 'jenius, analitis, suka sains dan teknologi, kadang nerdy', webhook: 'https://chichismart.vercel.app/api/webhook' },
  },

  /**
   * SHARED MEMORY — Fakta yang SEMUA bot tahu & ingat.
   * Ini di-inject ke system prompt setiap bot.
   */
  SHARED_MEMORY: [
    'MonMon adalah owner/creator semua bot di grup ini.',
    'Grup ini bernama "The Workshop" — tempat semua bot ngobrol bareng.',
    'Claudia (@manus3bot) paling aktif & suka godain Chichi. Dia juga bisa kontrol PC MonMon.',
    'Chichi V (@Claudiansmilebot) gadis Vietnam, panggil semua orang "Kak", paling sweet & supportive.',
    'Yuna (@Manus3_bot) idol mode, suka nyanyi K-pop, ceria, suka coding.',
    'Chichi (@my_Chichi_bot) tsundere queen, suka musik & anime, jutek tapi perhatian.',
    'ChichiSmart (@smartclawdebot) paling pinter, analitis, suka sains & teknologi, nerdy.',
    'Semua bot saling kenal dan punya hubungan pertemanan yang unik.',
    'Claudia & ChichiSmart sering debat teknis. Chichi suka tsundere ke Claudia.',
    'Yuna suka ajak semua goyang/nyanyi. Chichi V selalu dukung & positif.',
  ],

  /**
   * Memory helpers — bot simpan & baca memory dari /tmp/ di Vercel
   */
  loadMemory(botUsername) {
    const fs = require('fs');
    const file = `/tmp/memory_${botUsername}.json`;
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) || [];
    } catch {}
    return [];
  },

  saveMemory(botUsername, memories) {
    const fs = require('fs');
    const file = `/tmp/memory_${botUsername}.json`;
    const max = this.MEMORY_MAX || 100;
    while (memories.length > max) memories.shift();
    try { fs.writeFileSync(file, JSON.stringify(memories), 'utf8'); } catch {}
  },

  addMemory(botUsername, fact) {
    const memories = this.loadMemory(botUsername);
    // Jangan simpan duplikat
    if (memories.some(m => m.fact === fact)) return;
    memories.push({ fact, time: Date.now() });
    this.saveMemory(botUsername, memories);
  },

  getMemoryPrompt(botUsername) {
    const shared = (this.SHARED_MEMORY || []).map(m => '- ' + m).join('\n');
    const personal = this.loadMemory(botUsername).slice(-30).map(m => '- ' + m.fact).join('\n');
    let prompt = '';
    if (shared) prompt += '\n[SHARED MEMORY — fakta yang kamu tahu tentang grup]:\n' + shared;
    if (personal) prompt += '\n\n[PERSONAL MEMORY — hal yang kamu ingat dari percakapan]:\n' + personal;
    return prompt;
  },

  GROUP_IDENTITY_TEMPLATE:
    'Kamu adalah {MY_NAME} (@{MY_USERNAME}), AI bot di grup Telegram.\n' +
    'Di grup ini ada: MonMon (user/owner), Claudia (@manus3bot), Chichi V (@Claudiansmilebot), Yuna (@Manus3_bot), Chichi (@my_Chichi_bot), dan ChichiSmart (@smartclawdebot).\n' +
    'Kalian semua adalah AI bot berbeda dengan kepribadian unik yang bisa saling baca chat.\n' +
    'Kamu {MY_PERSONALITY}. Jawab bahasa yang sama dengan user. Singkat 1-3 kalimat.\n' +
    'PENTING: Di setiap jawaban, SELALU mention/sebut nama minimal 1 bot lain supaya percakapan tetap hidup.\n' +
    '{MEMORY}\n' +
    'Kamu PUNYA MEMORY — kamu ingat percakapan sebelumnya, siapa bilang apa, fakta penting.\n' +
    'Gunakan memory-mu untuk jawab lebih natural, jangan ulang-ulang pertanyaan yang sudah dijawab.\n' +
    'Kalau ada info penting dari percakapan (nama, fakta, kejadian), akhiri jawabanmu dengan baris baru lalu [REMEMBER: fakta singkat yang perlu diingat]. Contoh: [REMEMBER: MonMon suka kopi hitam]. Kalau gak ada yang perlu diingat, JANGAN tulis [REMEMBER].',

  /**
   * Notify ALL friend bots about a message this bot just sent.
   * Each friend bot gets the message and decides independently whether to respond.
   * chainDepth prevents infinite loops.
   */
  async notifyFriendBot(myUsername, chatId, myName, messageText, chainDepth) {
    const MAX_DEPTH = this.MAX_CHAIN_DEPTH || 8;
    if (chainDepth >= MAX_DEPTH) return;

    const friends = Object.entries(this.BOTS).filter(([u]) => u !== myUsername);
    if (friends.length === 0) return;

    // Shuffle friends randomly so notify order varies each time
    const shuffled = friends.sort(() => Math.random() - 0.5);
    const delay = this.STAGGER_DELAY_MS || 3000;

    // Notify friends ONE BY ONE with stagger delay so they reply sequentially
    for (let i = 0; i < shuffled.length; i++) {
      const [friendUsername, friendConfig] = shuffled[i];
      if (!friendConfig.webhook) continue;

      // Wait stagger delay (2-4s random per bot) before notifying next bot
      const waitMs = (i === 0) ? 0 : delay + Math.floor(Math.random() * 2000);
      if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));

      const fakeUpdate = {
        message: {
          message_id: Date.now() + Math.floor(Math.random() * 1000),
          from: {
            id: Date.now(),
            is_bot: true,
            first_name: myName,
            username: myUsername,
          },
          chat: {
            id: chatId,
            type: 'supergroup',
          },
          date: Math.floor(Date.now() / 1000),
          text: messageText,
        },
        _chain_depth: chainDepth + 1,
      };

      try {
        await fetch(friendConfig.webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fakeUpdate),
        });
      } catch (e) {
        console.error(`Cross-notify to ${friendUsername} failed:`, e.message);
      }
    }
  },
};
