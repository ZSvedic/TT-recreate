// #LlmClient — TAMEDTABLE_RPM enforcement: a sliding-window per-process
// requests-per-minute cap over live model calls. rpm <= 0 disables the cap
// (replay runs lift it — cassette hits touch no network). Clock and sleep are
// injectable so the limiter tests run on a fake clock.
export class RateLimiter {
  private stamps: number[] = [];

  constructor(
    private rpm: number,
    private now: () => number = Date.now,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Resolves when the call may fire; records it in the window. */
  async acquire(): Promise<void> {
    if (this.rpm <= 0) return;
    for (;;) {
      const cutoff = this.now() - 60_000;
      this.stamps = this.stamps.filter((t) => t > cutoff);
      if (this.stamps.length < this.rpm) {
        this.stamps.push(this.now());
        return;
      }
      await this.sleep(this.stamps[0]! + 60_000 - this.now());
    }
  }
}
