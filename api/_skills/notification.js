/**
 * Skill: Desktop Notification & Message
 * Tampilkan notifikasi/popup di PC
 */
module.exports = {
  name: 'Desktop Notification',
  hints: `
NOTIFIKASI / POPUP DI PC:

Tampilkan popup message box:
{"action":"shell","command":"powershell -c \\"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('<PESAN>', '<JUDUL>')\\"","reply":"Menampilkan pesan di PC..."}

Tampilkan toast notification (Windows 10):
{"action":"shell","command":"powershell -c \\"[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; $xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); $texts = $xml.GetElementsByTagName('text'); $texts[0].AppendChild($xml.CreateTextNode('<JUDUL>')) > $null; $texts[1].AppendChild($xml.CreateTextNode('<PESAN>')) > $null; $toast = [Windows.UI.Notifications.ToastNotification]::new($xml); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Manus3').Show($toast)\\"","reply":"Notifikasi dikirim ke PC!"}

Text-to-speech (PC ngomong):
{"action":"shell","command":"powershell -c \\"Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak('<TEXT>')\\"","reply":"PC ngomong..."}
`.trim(),
};
