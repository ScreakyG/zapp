/**
 * Runs at most `max` tasks at once; the others wait their turn, in call order. IPTV panels
 * ban an IP that opens too many connections at once, so every request to them goes through one.
 */
export function createLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= max) return;
    const start = queue.shift();
    if (start) start();
  };
  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        active++;
        // Promise.resolve().then: a task that throws synchronously still frees its slot.
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}
