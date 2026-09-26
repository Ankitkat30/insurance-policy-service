// Process CPU, including worker threads, expressed as a percentage of one core.
// This may exceed 100% when several threads run concurrently.
export function cpuPercent(delta, elapsedMicroseconds) {
  return elapsedMicroseconds > 0 ? ((delta.user + delta.system) / elapsedMicroseconds) * 100 : 0;
}
export function startCpuMonitor({ threshold, interval, onThreshold, onSample = () => {} }) {
  let previous = process.cpuUsage();
  let time = process.hrtime.bigint();
  const timer = setInterval(() => {
    const current = process.cpuUsage();
    const now = process.hrtime.bigint();
    const percent = cpuPercent(
      { user: current.user - previous.user, system: current.system - previous.system },
      Number(now - time) / 1000,
    );
    previous = current;
    time = now;
    onSample(percent);
    if (percent >= threshold) {
      clearInterval(timer);
      onThreshold(percent);
    }
  }, interval);
  timer.unref();
  return () => clearInterval(timer);
}
