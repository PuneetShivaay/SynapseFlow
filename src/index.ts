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
export { Agent } from './core/agent.js';
export { ContextBuilder } from './core/context-builder.js';
export * from './core/utils.js';

// Providers
export { BaseProvider } from './providers/base.js';
export { OpenAIProvider } from './providers/openai.js';

// Tools
export { ToolRegistry } from './tools/registry.js';
export { ToolExecutor } from './tools/executor.js';

// Storage
export { InMemoryStore } from './storage/memory-store.js';
export { SQLiteGraphStore } from './storage/graph-store.js';
export { ContextRetriever } from './storage/context-retrieval.js';

// Background Processes
export * from './processes/index.js';

// Version
export const VERSION = '0.1.0';
