/**
 * Skill: Power Management
 * Shutdown, restart, lock, sleep
 */
module.exports = {
  name: 'Power Management',
  hints: `
POWER MANAGEMENT:
- Shutdown: shutdown /s /t 60 /c "Shutdown dari Telegram. Ketik shutdown /a untuk batal."
- Restart: shutdown /r /t 60 /c "Restart dari Telegram."
- Batal shutdown: shutdown /a
- Lock: rundll32.exe user32.dll,LockWorkStation
- Sleep: rundll32.exe powrprof.dll,SetSuspendState 0,1,0
- SELALU beri delay minimal 60 detik untuk shutdown/restart agar bisa dibatalkan.
`.trim(),
};
