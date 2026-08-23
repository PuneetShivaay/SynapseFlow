/**
 * SynapseFlow - A graph-first AI agent SDK
 * 
 * Build autonomous AI agents with graph-based memory and multi-agent orchestration
 * 
 * @packageDocumentation
 */

// Core types
export * from './types/index.js';
export * from './types/provider.js';
export * from './types/storage.js';
export * from './types/tracing.js';

// Core functionality
export { EventEmitter, createScopedEmitter } from './core/events.js';
export * from './core/utils.js';

// Version
export const VERSION = '0.1.0';
