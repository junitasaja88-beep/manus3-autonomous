/**
 * Skill: Volume Control
 * WAJIB pakai SendKeys. Get-AudioDevice & nircmd TIDAK ADA di PC ini.
 */
module.exports = {
  name: 'Volume Control',
  hints: `
⚠️ VOLUME CONTROL — WAJIB BACA:
- PC ini TIDAK punya Get-AudioDevice, nircmd, atau AudioDeviceCmdlets. JANGAN PERNAH gunakan itu — PASTI ERROR.
- SATU-SATUNYA cara kontrol volume: SendKeys via WScript.Shell.
- WAJIB copy-paste PERSIS command di bawah ini. Jangan improvisasi.

KECILKAN volume (user bilang: kecilkan, turunin, pelanin, kurangi):
{"action":"shell","command":"powershell -c \\"$wsh = New-Object -ComObject WScript.Shell; for($i=0;$i -lt 10;$i++){$wsh.SendKeys([char]174); Start-Sleep -m 50}\\"","reply":"Volume dikecilkan!"}

BESARKAN volume (user bilang: besarkan, naikin, kerasin, tambah):
{"action":"shell","command":"powershell -c \\"$wsh = New-Object -ComObject WScript.Shell; for($i=0;$i -lt 10;$i++){$wsh.SendKeys([char]175); Start-Sleep -m 50}\\"","reply":"Volume dibesarkan!"}

VOLUME NAIK 1x:
{"action":"shell","command":"powershell -c \\"(New-Object -ComObject WScript.Shell).SendKeys([char]175)\\"","reply":"Volume up!"}

VOLUME TURUN 1x:
{"action":"shell","command":"powershell -c \\"(New-Object -ComObject WScript.Shell).SendKeys([char]174)\\"","reply":"Volume down!"}

MUTE / UNMUTE:
{"action":"shell","command":"powershell -c \\"(New-Object -ComObject WScript.Shell).SendKeys([char]173)\\"","reply":"Mute toggled!"}

SET VOLUME KE PERSENTASE (misal 20%, 50%, dll — 1 step = ~2%):
Volume 20% = 10 step, 50% = 25 step, 80% = 40 step, 100% = 50 step.
{"action":"shell","command":"powershell -c \\"$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]173); Start-Sleep -m 300; for($i=0;$i -lt <STEP>;$i++){$wsh.SendKeys([char]175); Start-Sleep -m 50}\\"","reply":"Volume diset ke <PERSEN>%!"}

"kecilkan lagi" / "turunin lagi" = sama seperti KECILKAN (turun 10 step dari posisi sekarang, BUKAN reset ke angka tertentu).
`.trim(),
};
