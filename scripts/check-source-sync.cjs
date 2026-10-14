const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'source-versions.json'), 'utf8'));
let failed = false;
for (const component of baseline.components) {
  let differences = 0;
  for (const [file, expected] of Object.entries(component.files)) {
    const target = path.join(root, component.directory, file);
    if (!fs.existsSync(target)) {
      console.error(`缺失: ${component.directory}/${file}`);
      differences++;
      continue;
    }
    const content = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
    const actual = crypto.createHash('sha256').update(content).digest('hex');
    if (actual !== expected) {
      console.error(`不同: ${component.directory}/${file}`);
      differences++;
    }
  }
  for (const file of component.absent || []) {
    if (fs.existsSync(path.join(root, component.directory, file))) {
      console.error(`交付版不应包含: ${component.directory}/${file}`);
      differences++;
    }
  }
  console.log(`${component.directory}: ${Object.keys(component.files).length} 个基线文件，${differences} 处差异`);
  failed ||= differences > 0;
}
process.exitCode = failed ? 1 : 0;
