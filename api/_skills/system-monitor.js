/**
 * Skill: System Monitor
 * CPU, RAM, disk, battery, proses, temperature
 */
module.exports = {
  name: 'System Monitor',
  hints: `
SYSTEM MONITORING:

Cek penggunaan CPU:
{"action":"shell","command":"powershell -c \\"Get-WmiObject Win32_Processor | Select-Object -ExpandProperty LoadPercentage\\"","reply":"Mengecek CPU usage..."}

Cek RAM usage:
{"action":"shell","command":"powershell -c \\"$os = Get-WmiObject Win32_OperatingSystem; $total = [math]::Round($os.TotalVisibleMemorySize/1MB,1); $free = [math]::Round($os.FreePhysicalMemory/1MB,1); $used = $total - $free; Write-Host \\\\\\"RAM: $used GB / $total GB (Free: $free GB)\\\\\\"\\"","reply":"Mengecek RAM..."}

Cek disk space:
{"action":"shell","command":"wmic logicaldisk get caption,size,freespace /format:table","reply":"Mengecek disk space..."}

Cek battery (laptop):
{"action":"shell","command":"powershell -c \\"(Get-WmiObject Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus | Format-List)\\"","reply":"Mengecek battery..."}

Top proses (paling banyak pakai CPU/RAM):
{"action":"shell","command":"powershell -c \\"Get-Process | Sort-Object -Property WorkingSet64 -Descending | Select-Object -First 10 ProcessName,@{N='RAM_MB';E={[math]::Round($_.WorkingSet64/1MB,0)}},CPU | Format-Table -AutoSize\\"","reply":"Mengecek top proses..."}

Cek uptime:
{"action":"shell","command":"powershell -c \\"$boot = (Get-WmiObject Win32_OperatingSystem).LastBootUpTime; $up = (Get-Date) - [System.Management.ManagementDateTimeConverter]::ToDateTime($boot); Write-Host \\\\\\"Uptime: $($up.Days)d $($up.Hours)h $($up.Minutes)m\\\\\\"\\"","reply":"Mengecek uptime..."}

Kill proses (ganti NAMA):
{"action":"shell","command":"taskkill /IM <NAMA>.exe /F","reply":"Menghentikan <NAMA>..."}
`.trim(),
};
