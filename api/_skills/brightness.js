/**
 * Skill: Brightness Control
 * Inspired by ClawHub: iyeque-device-control
 * Kontrol kecerahan layar via PowerShell WMI
 */
module.exports = {
  name: 'Brightness Control',
  hints: `
BRIGHTNESS / KECERAHAN LAYAR (gunakan PowerShell WMI):

Set brightness ke persentase (ganti <PERSEN> dengan angka 0-100):
{"action":"shell","command":"powershell -c \\"(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, <PERSEN>)\\"","reply":"Kecerahan diset ke <PERSEN>%!"}

Cek brightness saat ini:
{"action":"shell","command":"powershell -c \\"(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness).CurrentBrightness\\"","reply":"Mengecek kecerahan layar..."}

Contoh:
- "brightness 50%" → set ke 50
- "terangin layar" → set ke 80
- "gelapin layar" → set ke 20
- "brightness max" → set ke 100
- "brightness min" → set ke 10

CATATAN: WMI brightness hanya work di laptop. Untuk desktop monitor, biasanya tidak bisa dikontrol via software.
`.trim(),
};
