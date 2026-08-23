/**
 * Base provider implementation with common functionality
 */

import {
  IModelProvider,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  ProviderConfig,
} from '../types/provider.js';
import { Message } from '../types/index.js';
import { retry, DEFAULT_RETRY_CONFIG } from '../core/utils.js';
import { ProviderError } from '../types/index.js';

/**
 * Abstract base class for model providers
 * 
 * Provides common functionality like retry logic and error handling
 */
export abstract class BaseProvider implements IModelProvider {
  abstract name: string;
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /**
   * Complete a chat conversation
   */
  abstract complete(
    messages: Message[],
    options: CompletionOptions
  ): Promise<CompletionResult>;

  /**
   * Stream a chat conversation
   */
  abstract stream(
    messages: Message[],
    options: CompletionOptions
  ): AsyncIterableIterator<StreamChunk>;

  /**
   * Check if provider supports tool calling
   */
  abstract supportsTools(): boolean;

  /**
   * Check if provider supports function calling
   */
  abstract supportsFunctions(): boolean;

  /**
   * Check if provider supports streaming
   */
  abstract supportsStreaming(): boolean;

  /**
   * Estimate cost for a completion (optional)
   */
  estimateCost?(promptTokens: number, completionTokens: number): number;

  /**
   * Wrap an API call with retry logic
   */
  protected async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    return retry(fn, {
      ...DEFAULT_RETRY_CONFIG,
      maxAttempts: this.config.maxRetries || DEFAULT_RETRY_CONFIG.maxAttempts,
    });
  }

  /**
   * Handle provider errors and normalize them
   */
  protected handleError(error: unknown): never {
    if (error instanceof Error) {
      // Check for specific error types
      if (error.message.includes('API key')) {
        throw new ProviderError('Invalid API key', {
          provider: this.name,
          originalError: error.message,
        });
      }

      if (error.message.includes('rate limit') || error.message.includes('429')) {
        throw new ProviderError('Rate limit exceeded', {
          provider: this.name,
          originalError: error.message,
          retryable: true,
        });
      }

      if (error.message.includes('timeout')) {
        throw new ProviderError('Request timeout', {
          provider: this.name,
          originalError: error.message,
          retryable: true,
        });
      }

      throw new ProviderError(error.message, {
        provider: this.name,
        originalError: error.message,
      });
    }

    throw new ProviderError('Unknown error occurred', {
      provider: this.name,
      originalError: String(error),
    });
  }

  /**
   * Validate configuration
   */
  protected validateConfig(): void {
    if (!this.config.apiKey) {
      throw new ProviderError('API key is required', {
        provider: this.name,
      });
    }
  }
}
