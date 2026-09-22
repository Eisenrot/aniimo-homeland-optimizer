import fs from 'node:fs';

const source=fs.readFileSync(new URL('./src/app.js',import.meta.url),'utf8');
const body=source.replace(/^import[\s\S]*?from '\.\/progression\.js';\n/m,'');
if(body===source)throw new Error('Could not isolate app.js import block for syntax smoke test.');
new Function(body);
console.log('app.js browser-body syntax OK');
