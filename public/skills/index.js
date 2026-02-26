/**
 * Skills Loader
 *
 * Default: auto-discover skills by reading this directory (no code changes needed when adding a new skill file).
 * Fallback: explicit list for environments that can't bundle dynamic requires.
 *
 * Each skill exports:
 * - { name: string, hints: string }
 * - optional: { server: { match(text): boolean, handle(ctx): Promise<string|null> } }
 */

const fs = require('fs');
const path = require('path');

function safeRequire(p) {
  try { return require(p); } catch { return null; }
}

function discoverSkills() {
  const dir = __dirname;
  const entries = fs.readdirSync(dir);
  const jsFiles = entries
    .filter((f) => f.endsWith('.js'))
    .filter((f) => f !== 'index.js')
    .filter((f) => !f.startsWith('_'))
    .sort();

  const out = [];
  for (const f of jsFiles) {
    const mod = safeRequire(path.join(dir, f));
    if (mod) out.push(mod);
  }
  return out;
}

function explicitSkills() {
  return [
    safeRequire('./brightness'),
    safeRequire('./clipboard'),
    safeRequire('./file-execute'),
    safeRequire('./file-management'),
    safeRequire('./keyboard-mouse'),
    safeRequire('./network-info'),
    safeRequire('./notification'),
    safeRequire('./power'),
    safeRequire('./search-safety'),
    safeRequire('./system-monitor'),
    safeRequire('./volume'),
    safeRequire('./window-management'),
    safeRequire('./youtube-random'),
  ].filter(Boolean);
}

function loadSkills() {
  // Allow forcing explicit mode for environments that can't handle dynamic requires.
  const mode = String(process.env.SKILLS_MODE || '').toLowerCase().trim();
  if (mode === 'explicit') return explicitSkills();

  try {
    const discovered = discoverSkills();
    if (discovered.length > 0) return discovered;
  } catch {}

  return explicitSkills();
}

const skills = loadSkills();

let _cached = null;
function getSkillHints() {
  if (_cached === null) {
    _cached = skills.filter(s => s && s.hints).map(s => s.hints).join('\n\n');
  }
  return _cached;
}

function loadAllSkills() {
  return getSkillHints();
}

function getServerSkills() {
  return skills.map(s => s && s.server).filter(Boolean);
}

module.exports = { getSkillHints, loadAllSkills, getServerSkills };
