/**
 * Gateway Client Configuration
 * Reads from .env file or environment variables
 */

const path = require('path');
const fs = require('fs');

// Load .env file if it exists
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

module.exports = {
  VERCEL_URL: process.env.VERCEL_URL || 'https://manus3-autonomous.vercel.app',
  GATEWAY_SECRET: process.env.GATEWAY_SECRET || '',
  POLL_INTERVAL_MS: parseInt(process.env.POLL_INTERVAL_MS) || 2000,
  HEARTBEAT_INTERVAL_MS: parseInt(process.env.HEARTBEAT_INTERVAL_MS) || 15000,
  COMMAND_TIMEOUT_MS: parseInt(process.env.COMMAND_TIMEOUT_MS) || 30000,
  MAX_OUTPUT_LENGTH: parseInt(process.env.MAX_OUTPUT_LENGTH) || 4000,
};
