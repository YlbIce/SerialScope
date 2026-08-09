const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
const required = [
  "sequence: ++state.logSequence,\n    time: formatLogTime(payload.timestamp)",
  "sequence: ++state.logSequence,\n    time: formatLogTime(),",
  "const content = `sequence,time,direction,bytes,text,hex\\n${lines.join('\\n')}`;",
  "return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;"
];
for (const fragment of required) {
  if (!source.includes(fragment)) throw new Error(`missing log export contract fragment: ${fragment}`);
}
console.log('Log export sequence and millisecond timestamp contract passed');
