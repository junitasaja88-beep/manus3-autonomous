/**
 * Skill: Keyboard & Mouse Simulation
 * Inspired by ClawHub: windows-ui-automation, win-mouse-native
 * Simulasi keyboard shortcuts dan input
 */
module.exports = {
  name: 'Keyboard & Mouse',
  hints: `
KEYBOARD SHORTCUTS (gunakan SendKeys via WScript.Shell atau System.Windows.Forms):

Tekan shortcut keyboard (ganti KEYS — contoh: ^c = Ctrl+C, %{F4} = Alt+F4, {ENTER}, {TAB}):
{"action":"shell","command":"powershell -c \\"(New-Object -ComObject WScript.Shell).SendKeys('<KEYS>')\\"","reply":"Shortcut dikirim!"}

REFERENSI SendKeys:
- ^ = Ctrl, + = Shift, % = Alt
- ^c = Ctrl+C, ^v = Ctrl+V, ^z = Ctrl+Undo, ^s = Ctrl+S
- ^a = Ctrl+A (select all), ^p = Ctrl+P (print)
- %{F4} = Alt+F4 (tutup window), %{TAB} = Alt+Tab (switch window)
- {ENTER} = Enter, {TAB} = Tab, {ESC} = Escape, {DELETE} = Delete
- {UP} {DOWN} {LEFT} {RIGHT} = arrow keys
- {F1}..{F12} = function keys
- ^+{ESC} = Ctrl+Shift+Esc (Task Manager)
- #{d} = Win+D (show desktop) — gunakan: powershell -c "(New-Object -ComObject Shell.Application).MinimizeAll()"

Contoh: "tekan Ctrl+S" → SendKeys('^s'), "tekan Enter" → SendKeys('{ENTER}')

Ketik text di PC (auto-type):
{"action":"shell","command":"powershell -c \\"(New-Object -ComObject WScript.Shell).SendKeys('<TEXT>')\\"","reply":"Mengetik text..."}
`.trim(),
};
