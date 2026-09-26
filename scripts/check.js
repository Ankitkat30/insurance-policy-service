import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await check(path);
    else if (path.endsWith('.js'))
      execFileSync(process.execPath, ['--check', path], { stdio: 'inherit' });
  }
}
for (const directory of ['src', 'scripts', 'test']) await check(directory);
console.log('All JavaScript files passed syntax checks.');
