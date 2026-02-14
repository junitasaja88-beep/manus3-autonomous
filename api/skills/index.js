/**
 * Skills Auto-Loader
 * Loads all .js skill files from this folder and combines their hints.
 * Each skill exports: { name: string, hints: string }
 */
const fs = require('fs');
const path = require('path');

function loadAllSkills() {
  const skillsDir = __dirname;
  const hints = [];

  try {
    const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.js') && f !== 'index.js');
    for (const file of files) {
      try {
        const skill = require(path.join(skillsDir, file));
        if (skill.hints) {
          hints.push(skill.hints);
        }
      } catch (e) {
        console.error(`Skill load error (${file}):`, e.message);
      }
    }
  } catch (e) {
    console.error('Skills dir error:', e.message);
  }

  return hints.join('\n\n');
}

// Cache on first load
let _cached = null;
function getSkillHints() {
  if (_cached === null) _cached = loadAllSkills();
  return _cached;
}

module.exports = { getSkillHints, loadAllSkills };
