import { fork } from 'node:child_process';
let child,
  stopping = false,
  timer,
  crashes = 0;
function start() {
  const began = Date.now();
  child = fork(new URL('./server.js', import.meta.url), [], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  });
  child.on('message', (message) => process.send?.(message));
  child.on('exit', (code, signal) => {
    if (stopping) return process.exit(0);
    crashes = Date.now() - began > 60000 ? 0 : crashes + 1;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(crashes, 5));
    console.log(JSON.stringify({ event: 'restart_scheduled', code, signal, delayMs: delay }));
    timer = setTimeout(start, delay);
  });
}
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    clearTimeout(timer);
    if (child?.exitCode === null) {
      child.kill('SIGTERM');
      setTimeout(() => {
        child.kill('SIGKILL');
        process.exit(0);
      }, 12000).unref();
    } else process.exit(0);
  });
start();
