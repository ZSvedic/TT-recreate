// #LlmClient — TAMEDTABLE_RPM sliding-window limiter, fake clock.
import { expect, test } from 'bun:test';
import { RateLimiter } from './rpm.ts';

function fakeClock() {
  const state = { now: 0, sleeps: [] as number[] };
  return {
    state,
    now: () => state.now,
    sleep: async (ms: number) => { state.sleeps.push(ms); state.now += ms; },
  };
}

test('the N+1th call within a minute waits for the window to roll', async () => {
  const clock = fakeClock();
  const limiter = new RateLimiter(3, clock.now, clock.sleep);
  await limiter.acquire();
  clock.state.now += 1000;
  await limiter.acquire();
  clock.state.now += 1000;
  await limiter.acquire();
  expect(clock.state.sleeps).toEqual([]);
  await limiter.acquire(); // 4th within the minute — must wait until the 1st expires
  expect(clock.state.sleeps).toEqual([58_000]);
});

test('calls spaced beyond the window never wait', async () => {
  const clock = fakeClock();
  const limiter = new RateLimiter(2, clock.now, clock.sleep);
  for (let i = 0; i < 5; i++) {
    await limiter.acquire();
    clock.state.now += 61_000;
  }
  expect(clock.state.sleeps).toEqual([]);
});

test('rpm 0 disables the limiter', async () => {
  const clock = fakeClock();
  const limiter = new RateLimiter(0, clock.now, clock.sleep);
  for (let i = 0; i < 100; i++) await limiter.acquire();
  expect(clock.state.sleeps).toEqual([]);
});
