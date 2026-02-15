/**
 * Skill: Clipboard
 * Baca dan tulis clipboard
 */
module.exports = {
  name: 'Clipboard',
  hints: `
CLIPBOARD:

Baca isi clipboard (paste):
{"action":"shell","command":"powershell -c \\"Get-Clipboard\\"","reply":"Membaca clipboard..."}

Copy text ke clipboard:
{"action":"shell","command":"powershell -c \\"Set-Clipboard -Value '<TEXT>'\\"","reply":"Text dicopy ke clipboard!"}

Clear clipboard:
{"action":"shell","command":"powershell -c \\"Set-Clipboard -Value $null\\"","reply":"Clipboard dikosongkan!"}
`.trim(),
};
