/**
 * Base class for background processes
 * 
 * Background processes run independently to maintain and improve the graph
 */

import { EventEmitter } from '../core/events.js';

/**
 * Base background process
 * 
 * All background processes extend this class and implement the execute method
 */
export abstract class BackgroundProcess {
  /**
   * Process name for identification
   */
  abstract name: string;

  /**
   * Interval in milliseconds between executions
   */
  abstract interval: number;

  /**
   * Execute the process logic
   */
  protected abstract execute(): Promise<void>;

  private running: boolean = false;
  private intervalId?: NodeJS.Timeout;
  private emitter: EventEmitter;
  private executionCount: number = 0;
  private lastExecutionTime?: number;
  private lastError?: Error;

  constructor(emitter: EventEmitter) {
    this.emitter = emitter;
  }

  /**
   * Start the background process
   */
  start(): void {
    if (this.running) {
      console.warn(`Process ${this.name} is already running`);
      return;
    }

    this.running = true;
    console.log(`🚀 Starting background process: ${this.name}`);
    this.scheduleNext();
  }

  /**
   * Stop the background process
   */
  stop(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = undefined;
    }

    console.log(`⏹️  Stopped background process: ${this.name}`);
  }

  /**
   * Check if process is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get process statistics
   */
  getStats(): {
    name: string;
    running: boolean;
    executionCount: number;
    lastExecutionTime?: number;
    lastError?: Error;
  } {
    return {
      name: this.name,
      running: this.running,
      executionCount: this.executionCount,
      lastExecutionTime: this.lastExecutionTime,
      lastError: this.lastError,
    };
  }

  /**
   * Schedule the next execution
   */
  private scheduleNext(): void {
    if (!this.running) {
      return;
    }

    this.intervalId = setTimeout(async () => {
      await this.runOnce();
      this.scheduleNext();
    }, this.interval);
  }

  /**
   * Run the process once
   */
  private async runOnce(): Promise<void> {
    const startTime = Date.now();

    try {
      await this.emitter.emit({
        type: 'agent:start',
        timestamp: Date.now(),
        agentName: this.name,
        input: 'Background process execution',
      } as any);

      await this.execute();

      this.executionCount++;
      this.lastExecutionTime = Date.now();
      this.lastError = undefined;

      const duration = Date.now() - startTime;

      await this.emitter.emit({
        type: 'agent:complete',
        timestamp: Date.now(),
        result: {
          success: true,
          output: `${this.name} completed`,
          duration,
          iterations: 1,
          toolCalls: [],
        },
      } as any);
    } catch (error) {
      this.lastError = error as Error;
      console.error(`❌ Error in ${this.name}:`, error);

      await this.emitter.emit({
        type: 'agent:error',
        timestamp: Date.now(),
      } as any);

      // Don't crash the process on error - continue running
    }
  }

  /**
   * Emit an event
   */
  protected async emit(event: any): Promise<void> {
    await this.emitter.emit(event);
  }
}
