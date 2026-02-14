/**
 * Skill: File Management
 * Buat, hapus, rename, copy, move file/folder
 */
module.exports = {
  name: 'File Management',
  hints: `
FILE & FOLDER MANAGEMENT:

Buat folder baru:
{"action":"shell","command":"mkdir \\"<PATH>\\"","reply":"Folder dibuat!"}

Buat file teks baru (ganti ISI dengan konten):
{"action":"shell","command":"powershell -c \\"Set-Content -Path '<PATH>' -Value '<ISI>' -Encoding UTF8\\"","reply":"File dibuat!"}

Hapus file:
{"action":"shell","command":"del \\"<PATH>\\"","reply":"File dihapus!"}

Hapus folder (beserta isinya):
{"action":"shell","command":"rmdir /S /Q \\"<PATH>\\"","reply":"Folder dihapus!"}

Rename file/folder:
{"action":"shell","command":"ren \\"<PATH_LAMA>\\" \\"<NAMA_BARU>\\"","reply":"Renamed!"}

Copy file:
{"action":"shell","command":"copy \\"<SUMBER>\\" \\"<TUJUAN>\\"","reply":"File dicopy!"}

Move file:
{"action":"shell","command":"move \\"<SUMBER>\\" \\"<TUJUAN>\\"","reply":"File dipindah!"}

Lihat isi folder:
{"action":"shell","command":"dir \\"<PATH>\\" /B","reply":"Melihat isi folder..."}

Cari file di user folder (ganti KEYWORD):
{"action":"shell","command":"dir \\"C:\\\\Users\\\\cc\\" /S /B | findstr /I \\"<KEYWORD>\\"","reply":"Mencari file..."}

SAFETY: Jangan pernah hapus folder system (C:\\\\Windows, C:\\\\Program Files, dll). Selalu konfirmasi sebelum hapus.
`.trim(),
};
