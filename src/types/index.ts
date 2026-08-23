/**
 * Core type definitions for SynapseFlow
 * 
 * This file contains all base types and interfaces used throughout the SDK.
 * Following clean architecture principles, these types have no external dependencies.
 */

import { z } from 'zod';

/**
 * Message role in a conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * A message in a conversation
 */
export interface Message {
  role: MessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  timestamp?: number;
}

/**
 * A tool call requested by the LLM
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * Result of a tool execution
 */
export interface ToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
  error?: Error;
  duration?: number;
}

/**
 * Tool definition with schema and execution function
 */
export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<TInput>;
  execute: (input: TInput) => Promise<TOutput>;
  timeout?: number;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  name: string;
  instructions: string;
  model: string;
  provider?: string;
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  maxIterations?: number;
  timeout?: number;
  stream?: boolean;
  memoryEnabled?: boolean;
  graphEnabled?: boolean;
}

/**
 * Agent run options
 */
export interface RunOptions {
  sessionId?: string;
  includeGraphContext?: boolean;
  maxIterations?: number;
  timeout?: number;
  stream?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Agent execution result
 */
export interface AgentResult {
  success: boolean;
  output: string;
  iterations: number;
  toolCalls: ToolResult[];
  duration: number;
  tokensUsed?: number;
  cost?: number;
  error?: Error;
  traceId?: string;
}

/**
 * Agent event types for streaming and observability
 */
export type AgentEventType =
  | 'agent:start'
  | 'agent:complete'
  | 'agent:error'
  | 'llm:call:start'
  | 'llm:call:complete'
  | 'llm:call:error'
  | 'tool:start'
  | 'tool:complete'
  | 'tool:error'
  | 'text:delta'
  | 'memory:read'
  | 'memory:write'
  | 'graph:read'
  | 'graph:write'
  | 'handoff:start'
  | 'handoff:complete'
  | 'guardrail:triggered';

/**
 * Base agent event
 */
export interface BaseAgentEvent {
  type: AgentEventType;
  timestamp: number;
  traceId?: string;
}

/**
 * Agent start event
 */
export interface AgentStartEvent extends BaseAgentEvent {
  type: 'agent:start';
  agentName: string;
  input: string;
}

/**
 * Agent complete event
 */
export interface AgentCompleteEvent extends BaseAgentEvent {
  type: 'agent:complete';
  result: AgentResult;
}

/**
 * LLM call start event
 */
export interface LLMCallStartEvent extends BaseAgentEvent {
  type: 'llm:call:start';
  model: string;
  messages: Message[];
}

/**
 * LLM call complete event
 */
export interface LLMCallCompleteEvent extends BaseAgentEvent {
  type: 'llm:call:complete';
  response: string;
  tokensUsed?: number;
  duration: number;
}

/**
 * Tool execution start event
 */
export interface ToolStartEvent extends BaseAgentEvent {
  type: 'tool:start';
  toolName: string;
  input: unknown;
}

/**
 * Tool execution complete event
 */
export interface ToolCompleteEvent extends BaseAgentEvent {
  type: 'tool:complete';
  toolName: string;
  result: unknown;
  duration: number;
}

/**
 * Text delta event for streaming
 */
export interface TextDeltaEvent extends BaseAgentEvent {
  type: 'text:delta';
  delta: string;
}

/**
 * Union of all agent events
 */
export type AgentEvent =
  | AgentStartEvent
  | AgentCompleteEvent
  | LLMCallStartEvent
  | LLMCallCompleteEvent
  | ToolStartEvent
  | ToolCompleteEvent
  | TextDeltaEvent
  | BaseAgentEvent;

/**
 * Handoff context for agent-to-agent delegation
 */
export interface HandoffContext {
  fromAgent: string;
  toAgent: string;
  task: string;
  context: Record<string, unknown>;
  history: Message[];
  depth: number;
}

/**
 * Guardrail validation input
 */
export interface GuardrailInput {
  type: 'input' | 'output' | 'tool';
  content: string;
  toolName?: string;
  toolArgs?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Guardrail validation result
 */
export type GuardrailResult =
  | { allowed: true }
  | { allowed: false; reason: string; suggestion?: string };

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

/**
 * Error types
 */
export class AgentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export class ConfigurationError extends AgentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', details);
    this.name = 'ConfigurationError';
  }
}

export class ValidationError extends AgentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class TimeoutError extends AgentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TIMEOUT_ERROR', details);
    this.name = 'TimeoutError';
  }
}

export class ProviderError extends AgentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'PROVIDER_ERROR', details);
    this.name = 'ProviderError';
  }
}

export class ToolExecutionError extends AgentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TOOL_EXECUTION_ERROR', details);
    this.name = 'ToolExecutionError';
  }
}

export class GuardrailViolation extends AgentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'GUARDRAIL_VIOLATION', details);
    this.name = 'GuardrailViolation';
  }
}

export class HandoffError extends AgentError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'HANDOFF_ERROR', details);
    this.name = 'HandoffError';
  }
}
