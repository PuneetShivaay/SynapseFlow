/**
 * Model provider types and interfaces
 * 
 * Abstraction layer for different LLM providers (OpenAI, Claude, Gemini, etc.)
 */

import { Message, ToolCall, ToolDefinition } from './index.js';

/**
 * Completion options for LLM calls
 */
export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  stream?: boolean;
}

/**
 * Completion result from LLM
 */
export interface CompletionResult {
  content: string;
  role: 'assistant';
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Stream chunk for streaming responses
 */
export interface StreamChunk {
  type: 'text' | 'tool_call' | 'done';
  delta?: string;
  toolCall?: ToolCall;
  usage?: CompletionResult['usage'];
}

/**
 * Model provider interface
 * 
 * All LLM providers must implement this interface for interoperability
 */
export interface IModelProvider {
  /**
   * Provider name (e.g., 'openai', 'claude', 'gemini')
   */
  name: string;

  /**
   * Complete a chat conversation
   */
  complete(messages: Message[], options: CompletionOptions): Promise<CompletionResult>;

  /**
   * Stream a chat conversation
   */
  stream(
    messages: Message[],
    options: CompletionOptions
  ): AsyncIterableIterator<StreamChunk>;

  /**
   * Check if provider supports tool calling
   */
  supportsTools(): boolean;

  /**
   * Check if provider supports function calling
   */
  supportsFunctions(): boolean;

  /**
   * Check if provider supports streaming
   */
  supportsStreaming(): boolean;

  /**
   * Estimate cost for a completion (optional)
   */
  estimateCost?(promptTokens: number, completionTokens: number): number;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
  defaultModel?: string;
  timeout?: number;
  maxRetries?: number;
}
