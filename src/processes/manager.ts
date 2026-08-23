/**
 * Process Manager
 * 
 * Manages lifecycle of all background processes
 */

import { EventEmitter } from '../core/events.js';
import { BackgroundProcess } from './base.js';
import { MemoryExtractorProcess } from './memory-extractor.js';
import { RelationshipBuilderProcess } from './relationship-builder.js';
import { GraphCuratorProcess } from './graph-curator.js';
import { IMemoryStore, IGraphStore } from '../types/storage.js';
import { IModelProvider } from '../types/provider.js';

/**
 * Process Manager Configuration
 */
export interface ProcessManagerConfig {
  enableMemoryExtractor?: boolean;
  enableRelationshipBuilder?: boolean;
  enableGraphCurator?: boolean;
}

/**
 * Process Manager
 * 
 * Coordinates all background processes
 */
export class ProcessManager {
  private processes: Map<string, BackgroundProcess> = new Map();
  private emitter: EventEmitter;
  private running = false;

  constructor(
    emitter: EventEmitter,
    memoryStore: IMemoryStore,
    graphStore: IGraphStore,
    provider: IModelProvider,
    config: ProcessManagerConfig = {}
  ) {
    this.emitter = emitter;

    // Initialize processes based on config
    const {
      enableMemoryExtractor = true,
      enableRelationshipBuilder = true,
      enableGraphCurator = true,
    } = config;

    if (enableMemoryExtractor) {
      const memoryExtractor = new MemoryExtractorProcess(emitter, memoryStore, graphStore, provider);
      this.processes.set(memoryExtractor.name, memoryExtractor);
    }

    if (enableRelationshipBuilder) {
      const relationshipBuilder = new RelationshipBuilderProcess(emitter, graphStore, provider);
      this.processes.set(relationshipBuilder.name, relationshipBuilder);
    }

    if (enableGraphCurator) {
      const graphCurator = new GraphCuratorProcess(emitter, graphStore, provider);
      this.processes.set(graphCurator.name, graphCurator);
    }

    // Listen to process events
    this.setupEventListeners();
  }

  /**
   * Start all processes
   */
  start(): void {
    if (this.running) {
      console.log('⚠️  Process manager already running');
      return;
    }

    console.log(`🚀 Starting ${this.processes.size} background processes...`);

    for (const [name, process] of this.processes) {
      try {
        process.start();
        console.log(`✅ Started: ${name}`);
      } catch (error) {
        console.error(`❌ Failed to start ${name}:`, error);
      }
    }

    this.running = true;
    console.log('✅ All processes started');
  }

  /**
   * Stop all processes
   */
  stop(): void {
    if (!this.running) {
      console.log('⚠️  Process manager not running');
      return;
    }

    console.log('🛑 Stopping all background processes...');

    for (const [name, process] of this.processes) {
      try {
        process.stop();
        console.log(`✅ Stopped: ${name}`);
      } catch (error) {
        console.error(`❌ Failed to stop ${name}:`, error);
      }
    }

    this.running = false;
    console.log('✅ All processes stopped');
  }

  /**
   * Restart all processes
   */
  restart(): void {
    this.stop();
    this.start();
  }

  /**
   * Get a specific process by name
   */
  getProcess(name: string): BackgroundProcess | undefined {
    return this.processes.get(name);
  }

  /**
   * Get all process names
   */
  getProcessNames(): string[] {
    return Array.from(this.processes.keys());
  }

  /**
   * Get statistics for all processes
   */
  getStats(): Record<string, any> {
    const stats: Record<string, any> = {};

    for (const [name, process] of this.processes) {
      stats[name] = process.getStats();
    }

    return stats;
  }

  /**
   * Check if process manager is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Setup event listeners for process events
   */
  private setupEventListeners(): void {
    // Listen to process start events
    this.emitter.on('process:started', (data: any) => {
      console.log(`📊 Process started: ${data.processName}`);
    });

    // Listen to process stop events
    this.emitter.on('process:stopped', (data: any) => {
      console.log(`📊 Process stopped: ${data.processName}`);
    });

    // Listen to process execution events
    this.emitter.on('process:executed', (data: any) => {
      console.log(
        `📊 Process executed: ${data.processName} (duration: ${data.duration}ms)`
      );
    });

    // Listen to process error events
    this.emitter.on('process:error', (data: any) => {
      console.error(`❌ Process error: ${data.processName}`, data.error);
    });
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stop();
    this.processes.clear();
  }
}
