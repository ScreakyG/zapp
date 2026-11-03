import { describe, expect, it } from 'vitest';
import { createLimiter } from './limit';

describe('createLimiter', () => {
  it('never runs more than max tasks at once, and runs them all in order', async () => {
    const run = createLimiter(3);
    let active = 0;
    let peak = 0;
    const order: number[] = [];
    const tasks = Array.from({ length: 20 }, (_, i) =>
      run(async () => {
        active++;
        peak = Math.max(peak, active);
        order.push(i);
        await new Promise((r) => setTimeout(r, 1));
        active--;
        return i;
      }),
    );
    expect(await Promise.all(tasks)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(peak).toBe(3);
    expect(order).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it('keeps going after a failure', async () => {
    const run = createLimiter(1);
    const failed = run(() => Promise.reject(new Error('boom')));
    const ok = run(async () => 'ok');
    await expect(failed).rejects.toThrow('boom');
    expect(await ok).toBe('ok');
  });
});
