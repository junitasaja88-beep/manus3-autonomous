/**
 * Skills Loader — Explicit requires (Vercel-safe, no fs.readdirSync)
 * Each skill exports: { name: string, hints: string }
 */

const skills = [
  require('./brightness'),
  require('./clipboard'),
  require('./file-execute'),
  require('./file-management'),
  require('./keyboard-mouse'),
  require('./network-info'),
  require('./notification'),
  require('./power'),
  require('./search-safety'),
  require('./social-media'),
  require('./system-monitor'),
  require('./volume'),
  require('./window-management'),
  require('../../public/skills/social-post-x'),
  require('../../public/skills/x-auto-engage'),
];

let _cached = null;
function getSkillHints() {
  if (_cached === null) {
    _cached = skills.filter(s => s.hints).map(s => s.hints).join('\n\n');
  }
  return _cached;
}

function loadAllSkills() {
  return getSkillHints();
}

module.exports = { getSkillHints, loadAllSkills };
