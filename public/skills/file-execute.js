/**
 * Skill: File Execution
 * Untuk menjalankan .bat/.exe/.cmd/.ps1 di window terpisah
 */
module.exports = {
  name: 'File Execution',
  hints: `
JALANKAN FILE (.bat/.exe/.cmd/.ps1):
- SELALU gunakan: start "" "<full_path>" agar buka di window terpisah yang bisa diinteraksi user.
- Contoh: start "" "C:\\\\Users\\\\cc\\\\Downloads\\\\litellm-codex\\\\runall.bat"
- JANGAN jalankan .bat/.exe langsung tanpa "start" — akan timeout karena headless.
`.trim(),
};
