/**
 * Skill: Window Management
 * Inspired by ClawHub: windows-control, desktop-control-win
 * Manage windows — focus, minimize, maximize, close, list, resize
 */
module.exports = {
  name: 'Window Management',
  hints: `
WINDOW MANAGEMENT (gunakan PowerShell):

List semua window yang terbuka:
{"action":"shell","command":"powershell -c \\"Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object ProcessName,MainWindowTitle | Format-Table -AutoSize\\"","reply":"Melihat window yang terbuka..."}

Minimize semua window (show desktop):
{"action":"shell","command":"powershell -c \\"(New-Object -ComObject Shell.Application).MinimizeAll()\\"","reply":"Semua window diminimize!"}

Restore semua window:
{"action":"shell","command":"powershell -c \\"(New-Object -ComObject Shell.Application).UndoMinimizeAll()\\"","reply":"Window di-restore!"}

Tutup aplikasi (ganti APPNAME dengan nama process, misal chrome, notepad, code):
{"action":"shell","command":"taskkill /IM <APPNAME>.exe /F","reply":"Menutup <APPNAME>..."}

Tutup semua browser:
{"action":"shell","command":"taskkill /IM chrome.exe /F 2>nul & taskkill /IM msedge.exe /F 2>nul & taskkill /IM firefox.exe /F 2>nul","reply":"Semua browser ditutup!"}

Focus/aktivkan window tertentu (ganti TITLE dengan bagian judul window):
{"action":"shell","command":"powershell -c \\"$w = Get-Process | Where-Object {$_.MainWindowTitle -like '*<TITLE>*'} | Select-Object -First 1; if($w){(New-Object -ComObject WScript.Shell).AppActivate($w.Id)}\\"","reply":"Mengaktifkan window..."}
`.trim(),
};
