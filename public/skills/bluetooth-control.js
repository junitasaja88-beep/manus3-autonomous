const { exec } = require('child_process');

module.exports = {
  async toggleBluetooth(adapter = 'Bluetooth') {
    return new Promise((resolve, reject) => {
      exec(
        `powershell -Command "Add-Type -AssemblyName System.ServiceProcess;(Get-Service bthserv).Status -eq 'Running' ? 'stop-service bthserv' : 'start-service bthserv'"`,
        (error, stdout) => {
          if (error) reject(error);
          else resolve({ ok: true, out: stdout.trim() || 'Bluetooth toggled' });
        }
      );
    });
  },

  async listPairedDevices() {
    return new Promise((resolve, reject) => {
      exec(
        `powershell -Command "Get-PnpDevice -Class Bluetooth | Where-Object { $_.FriendlyName -ne '' } | Select-Object FriendlyName, InstanceId | Format-Table -AutoSize"`,
        (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout.trim());
        }
      );
    });
  }
};