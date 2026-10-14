import type {CompletionEngine} from '../utils/completionTypes';

/**
 * The exclusive right to run one generation on the engine that was current
 * when it was granted. The holder stops its engine calls once `signal`
 * aborts and calls `end()` after its last write.
 */
export interface GenerationLease {
  readonly engine: CompletionEngine;
  readonly signal: AbortSignal;
  abort(): void;
  end(): void;
}

class Lease implements GenerationLease {
  private readonly controller = new AbortController();
  private ended = false;

  constructor(
    readonly engine: CompletionEngine,
    private readonly onEnd: (lease: Lease) => void,
  ) {}

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  abort(): void {
    this.controller.abort();
  }

  end(): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    this.onEnd(this);
  }
}

/**
 * Holds at most one lease. Waiting acquirers are served in arrival order,
 * each only after the previous lease has ended.
 */
export class GenerationSlot {
  private active: Lease | null = null;
  private activeEnded: Promise<void> = Promise.resolve();
  private turnsEnded: Promise<void> = Promise.resolve();
  private queuedAcquirers = 0;

  get isBusy(): boolean {
    return this.active !== null || this.queuedAcquirers > 0;
  }

  /**
   * Resolves once every earlier acquirer has had its turn and `beforeGrant`
   * has settled; then grants a lease on `grantEngine()`, or resolves null
   * when that returns null.
   */
  async acquire(
    beforeGrant: () => Promise<unknown>,
    grantEngine: () => CompletionEngine | null,
  ): Promise<GenerationLease | null> {
    this.queuedAcquirers += 1;
    const previousTurnEnded = this.turnsEnded;
    let endTurn!: () => void;
    this.turnsEnded = new Promise(resolve => {
      endTurn = resolve;
    });
    try {
      await previousTurnEnded;
      await beforeGrant().catch(() => {});
    } finally {
      this.queuedAcquirers -= 1;
    }
    const engine = grantEngine();
    if (!engine) {
      endTurn();
      return null;
    }
    return this.grant(engine, endTurn);
  }

  /** Grants at once, or returns null while a lease is held or acquirers wait. */
  tryAcquire(
    grantEngine: () => CompletionEngine | null,
  ): GenerationLease | null {
    if (this.isBusy) {
      return null;
    }
    const engine = grantEngine();
    if (!engine) {
      return null;
    }
    let endTurn!: () => void;
    this.turnsEnded = new Promise(resolve => {
      endTurn = resolve;
    });
    return this.grant(engine, endTurn);
  }

  /** Aborts the held lease, if any; resolves when it has ended. */
  abortActive(): Promise<void> {
    this.active?.abort();
    return this.activeEnded;
  }

  private grant(engine: CompletionEngine, endTurn: () => void): Lease {
    let markEnded!: () => void;
    this.activeEnded = new Promise(resolve => {
      markEnded = resolve;
    });
    const lease = new Lease(engine, ended => {
      if (this.active === ended) {
        this.active = null;
      }
      markEnded();
      endTurn();
    });
    this.active = lease;
    return lease;
  }
}
