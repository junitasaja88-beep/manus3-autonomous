const { exec } = require('child_process');
const path = require('path');

// Helper: run elevated via pre-created Scheduled Task
async function runElevated(command, taskName = 'Manus3Elevated') {
  return new Promise((resolve) => {
    // Wrap command in base64 to avoid escaping hell
    const b64 = Buffer.from(command, 'utf16le').toString('base64');
    const ps = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "` +
      `$dec = [System.Text.Encoding]::Unicode.GetString([System.Convert]::FromBase64String('${b64}')); ` +
      `Invoke-Expression $dec"`;
    exec(`schtasks /run /tn "${taskName}" /tr "${ps}"`, (e, stdout, stderr) => {
      resolve({
        success: !e,
        output: (stdout || '').trim(),
        error: (stderr || e?.message || '').trim()
      });
    });
  });
}

// Create one-time elevated task (requires UAC once)
async function createElevatedTask(taskName = 'Manus3Elevated') {
  return new Promise((resolve) => {
    const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Manus3 elevated bridge</Description>
  </RegistrationInfo>
  <Triggers />
  <Settings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
  </Settings>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Actions>
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>-NoProfile -Command "Start-Sleep -Seconds 86400"</Arguments>
    </Exec>
  </Actions>
</Task>`;
    const tmp = path.join(require('os').tmpdir(), 'manus3-elevated.xml');
    require('fs').writeFileSync(tmp, xml);
    exec(`schtasks /create /tn "${taskName}" /xml "${tmp}" /f`, (e, stdout, stderr) => {
      require('fs').unlinkSync(tmp);
      resolve({
        success: !e,
        output: (stdout || '').trim(),
        error: (stderr || e?.message || '').trim()
      });
    });
  });
}

module.exports = {
  async elevated(command) {
    // Auto-create task if missing, then run interactively
    let res = await runElevated(command);
    if (res.error.includes('The system cannot find the file specified')) {
      const create = await createElevatedTask();
      if (!create.success) return `Gagal bikin task elevated: ${create.error}`;
      // Task created, now run the actual command
      res = await runElevated(command);
    }
    // Return full output + keep session alive for follow-ups
    return res.success ? res.output + '\n\n[Elevated bridge ready – ketik perintah lanjutan langsung tanpa UAC lagi]' : `Elevated error: ${res.error}`;
  },

  async diskpart(script) {
    const cmd = `diskpart /s "${script}"`;
    return this.elevated(cmd);
  },

  async netsh(args) {
    return this.elevated(`netsh ${args}`);
  }
};