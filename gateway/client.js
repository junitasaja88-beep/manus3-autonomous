/**
 * Manus3 Local Gateway Client
 * Runs on user's PC, polls Vercel for pending tasks, executes them locally
 *
 * Usage: node gateway/client.js
 */

const { exec } = require('child_process');
const config = require('./config');

const {
  VERCEL_URL,
  GATEWAY_SECRET,
  POLL_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
  COMMAND_TIMEOUT_MS,
  MAX_OUTPUT_LENGTH,
} = config;

let running = true;
let processing = false;

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function logError(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`[${ts}] ERROR: ${msg}`);
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '\n... (truncated)';
}

// --- HTTP ---

async function gatewayFetch(path, options = {}) {
  const url = `${VERCEL_URL}${path}`;
  try {
    const resp = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
    return await resp.json();
  } catch (e) {
    logError(`Fetch ${path}: ${e.message}`);
    return null;
  }
}

async function pollTask() {
  return gatewayFetch(`/api/gateway?action=poll&secret=${encodeURIComponent(GATEWAY_SECRET)}`);
}

async function sendHeartbeat() {
  return gatewayFetch('/api/gateway', {
    method: 'POST',
    body: JSON.stringify({ action: 'heartbeat', secret: GATEWAY_SECRET }),
  });
}

async function sendResult(taskId, result) {
  return gatewayFetch('/api/gateway', {
    method: 'POST',
    body: JSON.stringify({ action: 'result', taskId, result, secret: GATEWAY_SECRET }),
  });
}

// --- Execution ---

function executeCommand(command) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    exec(command, {
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      cwd: process.cwd(),
      shell: true,
    }, (error, stdout, stderr) => {
      const duration = Date.now() - startTime;
      let output = '';
      if (stdout) output += stdout;
      if (stderr) output += (output ? '\n--- stderr ---\n' : '') + stderr;
      if (error && !output) output = `Error: ${error.message}`;
      if (!output) output = '(no output)';
      output = truncate(output.trim(), MAX_OUTPUT_LENGTH);
      output += `\n\n[${duration}ms]`;
      resolve(output);
    });
  });
}

async function executeAgentTask(message) {
  let command = null;
  const text = message.toLowerCase();

  if (/buat(?:kan)?\s+file\s+(\S+)/i.test(message)) {
    const match = message.match(/buat(?:kan)?\s+file\s+(\S+)(?:\s+(?:dengan|isi|berisi|content)\s+(.+))?/i);
    if (match) {
      const filename = match[1];
      const content = match[2] || 'Hello from Manus3!';
      command = process.platform === 'win32'
        ? `echo ${content}> "${filename}"`
        : `echo "${content}" > "${filename}"`;
    }
  } else if (/cek\s+(disk|storage|space)/i.test(text)) {
    command = process.platform === 'win32' ? 'wmic logicaldisk get size,freespace,caption' : 'df -h';
  } else if (/cek\s+(memory|ram|mem)/i.test(text)) {
    command = process.platform === 'win32' ? 'systeminfo | findstr Memory' : 'free -h';
  } else if (/list\s+(file|folder)|dir|ls/i.test(text)) {
    command = process.platform === 'win32' ? 'dir' : 'ls -la';
  } else if (/ip\s*(address)?|ipconfig|ifconfig/i.test(text)) {
    command = process.platform === 'win32' ? 'ipconfig' : 'ifconfig';
  } else if (/node\s*version|node\s*-v/i.test(text)) {
    command = 'node -v';
  } else if (/system\s*info|uname/i.test(text)) {
    command = process.platform === 'win32' ? 'systeminfo' : 'uname -a';
  }

  if (command) {
    log(`Agent executing: ${command}`);
    const output = await executeCommand(command);
    return `Agent executed: \`${command}\`\n\n${output}`;
  }

  // Try as raw command if it looks safe
  const firstWord = message.trim().split(/\s+/)[0].toLowerCase();
  const safeCommands = ['dir', 'ls', 'pwd', 'cd', 'echo', 'type', 'cat', 'node', 'npm', 'git', 'python', 'pip', 'whoami', 'hostname', 'date', 'time', 'ping', 'curl', 'where', 'which'];
  if (safeCommands.includes(firstWord)) {
    log(`Agent raw execute: ${message}`);
    return await executeCommand(message);
  }

  return `Tidak bisa memproses otomatis: "${message}"\nCoba pakai /terminal dengan command spesifik.`;
}

async function processTask(task) {
  log(`>>> Task ${task.id}: [${task.type}] ${task.command}`);

  let result;
  try {
    if (task.type === 'command') {
      result = await executeCommand(task.command);
    } else if (task.type === 'agent') {
      result = await executeAgentTask(task.command);
    } else {
      result = `Unknown task type: ${task.type}`;
    }
  } catch (e) {
    result = `Execution error: ${e.message}`;
  }

  log(`<<< Task ${task.id} done. Sending result...`);
  const resp = await sendResult(task.id, result);
  if (resp && resp.ok) {
    log(`    Result sent OK`);
  } else {
    logError(`    Failed to send result: ${JSON.stringify(resp)}`);
  }
}

// --- Main Loop ---

async function pollLoop() {
  while (running) {
    if (!processing) {
      try {
        const data = await pollTask();
        if (data && data.task) {
          processing = true;
          await processTask(data.task);
          processing = false;
        }
      } catch (e) {
        logError(`Poll: ${e.message}`);
        processing = false;
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

async function heartbeatLoop() {
  while (running) {
    try { await sendHeartbeat(); } catch (e) { logError(`Heartbeat: ${e.message}`); }
    await new Promise((r) => setTimeout(r, HEARTBEAT_INTERVAL_MS));
  }
}

// --- Startup ---

async function main() {
  console.log('========================================');
  console.log('  Manus3 Gateway Client');
  console.log('========================================');
  console.log(`  Server:   ${VERCEL_URL}`);
  console.log(`  Poll:     ${POLL_INTERVAL_MS}ms`);
  console.log(`  Secret:   ${GATEWAY_SECRET ? '***' + GATEWAY_SECRET.slice(-4) : '(none)'}`);
  console.log('========================================\n');

  if (VERCEL_URL.includes('your-app')) {
    logError('VERCEL_URL not configured! Set it in .env');
    process.exit(1);
  }

  log('Testing connection...');
  const status = await gatewayFetch(`/api/gateway?action=status&secret=${encodeURIComponent(GATEWAY_SECRET)}`);
  if (status) {
    log(`Connected! ${JSON.stringify(status)}`);
  } else {
    logError('Cannot reach server. Continuing anyway...');
  }

  await sendHeartbeat();
  log('Gateway ONLINE. Waiting for tasks...\n');

  pollLoop();
  heartbeatLoop();
}

// Graceful shutdown
process.on('SIGINT', () => { console.log(''); log('Shutting down...'); running = false; setTimeout(() => process.exit(0), 1000); });
process.on('SIGTERM', () => { log('SIGTERM, shutting down...'); running = false; setTimeout(() => process.exit(0), 1000); });

main().catch((e) => { logError(`Fatal: ${e.message}`); process.exit(1); });
