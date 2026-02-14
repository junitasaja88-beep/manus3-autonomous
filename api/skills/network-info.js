/**
 * Skill: Network & WiFi Info
 * Cek koneksi, WiFi, IP, speed test, ping
 */
module.exports = {
  name: 'Network Info',
  hints: `
NETWORK & WIFI:

Cek WiFi yang terkoneksi:
{"action":"shell","command":"netsh wlan show interfaces | findstr /I \\"SSID Signal\\"","reply":"Mengecek WiFi..."}

Cek IP address:
{"action":"shell","command":"ipconfig | findstr /I \\"IPv4 Subnet Gateway\\"","reply":"Mengecek IP..."}

Cek IP public:
{"action":"shell","command":"powershell -c \\"(Invoke-WebRequest -Uri 'https://api.ipify.org' -UseBasicParsing).Content\\"","reply":"Mengecek IP publik..."}

Ping test (ganti TARGET):
{"action":"shell","command":"ping -n 4 <TARGET>","reply":"Ping ke <TARGET>..."}

List WiFi yang tersedia:
{"action":"shell","command":"netsh wlan show networks mode=bssid | findstr /I \\"SSID Signal\\"","reply":"Melihat WiFi tersedia..."}

Cek DNS:
{"action":"shell","command":"nslookup google.com","reply":"Mengecek DNS..."}

Disconnect WiFi:
{"action":"shell","command":"netsh wlan disconnect","reply":"WiFi disconnected!"}

Connect ke WiFi (ganti SSID):
{"action":"shell","command":"netsh wlan connect name=\\"<SSID>\\"","reply":"Connecting ke <SSID>..."}
`.trim(),
};
