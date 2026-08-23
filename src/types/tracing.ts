/**
 * Tracing and observability types
 * 
 * Types for capturing and analyzing agent execution traces
 */

import { AgentResult } from './index.js';

/**
 * Span type for tracing different operations
 */
export type SpanType =
  | 'agent'
  | 'llm-call'
  | 'tool-call'
  | 'memory-read'
  | 'memory-write'
  | 'graph-read'
  | 'graph-write'
  | 'guardrail'
  | 'handoff';

/**
 * Span representing a single operation in a trace
 */
export interface Span {
  id: string;
  traceId: string;
  parentId?: string;
  type: SpanType;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  input?: unknown;
  output?: unknown;
  error?: Error;
  metadata: Record<string, unknown>;
  tags?: Record<string, string>;
}

/**
 * Complete trace of an agent execution
 */
export interface Trace {
  id: string;
  agentName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  spans: Span[];
  metrics: TraceMetrics;
  result?: AgentResult;
  error?: Error;
  metadata: Record<string, unknown>;
}

/**
 * Metrics collected during agent execution
 */
export interface TraceMetrics {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  toolCallCount: number;
  llmCallCount: number;
  memoryReadCount: number;
  memoryWriteCount: number;
  graphReadCount: number;
  graphWriteCount: number;
  guardrailCount: number;
  handoffCount: number;
  iterationCount: number;
}

/**
 * Tracer interface for creating and managing traces
 */
export interface ITracer {
  /**
   * Start a new trace
   */
  startTrace(agentName: string, metadata?: Record<string, unknown>): Trace;

  /**
   * End a trace
   */
  endTrace(traceId: string, result?: AgentResult, error?: Error): void;

  /**
   * Start a new span within a trace
   */
  startSpan(traceId: string, config: SpanConfig): Span;

  /**
   * End a span
   */
  endSpan(spanId: string, output?: unknown, error?: Error): void;

  /**
   * Get a trace by ID
   */
  getTrace(traceId: string): Trace | null;

  /**
   * Get all traces
   */
  getAllTraces(): Trace[];

  /**
   * Clear all traces
   */
  clearTraces(): void;

  /**
   * Export traces in a specific format
   */
  exportTraces(format: 'json' | 'opentelemetry'): unknown;
}

/**
 * Configuration for creating a span
 */
export interface SpanConfig {
  type: SpanType;
  name: string;
  parentId?: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
  tags?: Record<string, string>;
}

/**
 * Trace export format
 */
export interface TraceExport {
  traces: Trace[];
  exportedAt: number;
  version: string;
  metadata?: Record<string, unknown>;
}
