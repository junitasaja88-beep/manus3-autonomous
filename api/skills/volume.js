/**
 * Skill: Volume Control
 * PC ini TIDAK punya nircmd/Get-AudioDevice. Gunakan SendKeys bawaan Windows.
 */
module.exports = {
  name: 'Volume Control',
  hints: `
VOLUME CONTROL (gunakan SendKeys bawaan Windows, JANGAN nircmd/Get-AudioDevice):
- Volume naik: powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]175)"
- Volume turun: powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]174)"
- Mute/unmute toggle: powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"
- Kecilkan/turunin/pelanin volume (tanpa angka): loop SendKeys [char]174 sebanyak 10x:
  powershell -c "$wsh = New-Object -ComObject WScript.Shell; for($i=0;$i -lt 10;$i++){$wsh.SendKeys([char]174); Start-Sleep -m 50}"
- Besarkan/naikin/kerasin volume (tanpa angka): loop SendKeys [char]175 sebanyak 10x:
  powershell -c "$wsh = New-Object -ComObject WScript.Shell; for($i=0;$i -lt 10;$i++){$wsh.SendKeys([char]175); Start-Sleep -m 50}"
- Set volume ke persentase: mute dulu lalu naikin sejumlah step. 1 step = ~2%. Volume 50% = 25 step, 20% = 10 step:
  powershell -c "$wsh = New-Object -ComObject WScript.Shell; $wsh.SendKeys([char]173); Start-Sleep -m 300; for($i=0;$i -lt <STEP>;$i++){$wsh.SendKeys([char]175); Start-Sleep -m 50}"
`.trim(),
};
