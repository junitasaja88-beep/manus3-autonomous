/**
 * Skill: Search & File Safety
 * Aturan aman untuk pencarian file di PC
 */
module.exports = {
  name: 'Search Safety',
  hints: `
PENCARIAN FILE (SAFETY):
- JANGAN PERNAH scan seluruh drive C:\\\\ (dir C:\\\\ /S /B) — akan timeout!
- "cari di pc" / "cari di komputer" → scope ke C:\\\\Users\\\\cc (BUKAN C:\\\\)
- "cari di Downloads" → scope ke C:\\\\Users\\\\cc\\\\Downloads
- Gunakan findstr untuk filter: dir "C:\\\\Users\\\\cc" /S /B | findstr /I ".mp3$"
`.trim(),
};
