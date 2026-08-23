/**
 * OpenAI provider implementation
 */

import OpenAI from 'openai';
import { BaseProvider } from './base.js';
import {
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  ProviderConfig,
} from '../types/provider.js';
import { Message, ToolDefinition } from '../types/index.js';
import { z } from 'zod';

/**
 * OpenAI provider for GPT models
 * 
 * Supports:
 * - GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
 * - Function calling and tool use
 * - Streaming responses
 * - Automatic retries
 */
export class OpenAIProvider extends BaseProvider {
  name = 'openai';
  private client: OpenAI;

  constructor(config: ProviderConfig) {
    super(config);
    this.validateConfig();

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      organization: config.organization,
      timeout: config.timeout || 60000,
      maxRetries: 0, // We handle retries ourselves
    });
  }

  /**
   * Complete a chat conversation
   */
  async complete(
    messages: Message[],
    options: CompletionOptions
  ): Promise<CompletionResult> {
    return this.withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model: this.config.defaultModel || 'gpt-4o-mini',
        messages: this.convertMessages(messages),
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        top_p: options.topP,
        stop: options.stop,
        tools: options.tools ? this.convertTools(options.tools) : undefined,
        tool_choice: options.toolChoice,
        stream: false,
      });

      const choice = response.choices[0];
      if (!choice) {
        throw this.handleError(new Error('No response from OpenAI'));
      }

      const toolCalls = choice.message.tool_calls?.map((tc) => {
        if (tc.type === 'function') {
          return {
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          };
        }
        return null;
      }).filter((tc): tc is NonNullable<typeof tc> => tc !== null);

      return {
        content: choice.message.content || '',
        role: 'assistant',
        toolCalls,
        finishReason: this.mapFinishReason(choice.finish_reason),
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    });
  }

  /**
   * Stream a chat conversation
   */
  async *stream(
    messages: Message[],
    options: CompletionOptions
  ): AsyncIterableIterator<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.config.defaultModel || 'gpt-4o-mini',
      messages: this.convertMessages(messages),
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      stop: options.stop,
      tools: options.tools ? this.convertTools(options.tools) : undefined,
      tool_choice: options.toolChoice,
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      
      if (!delta) {
        // Check for usage in final chunk
        if (chunk.usage) {
          yield {
            type: 'done',
            usage: {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            },
          };
        }
        continue;
      }

      // Text delta
      if (delta.content) {
        yield {
          type: 'text',
          delta: delta.content,
        };
      }

      // Tool calls
      if (delta.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          if (toolCall.function?.name) {
            yield {
              type: 'tool_call',
              toolCall: {
                id: toolCall.id || '',
                type: 'function',
                function: {
                  name: toolCall.function.name,
                  arguments: toolCall.function.arguments || '',
                },
              },
            };
          }
        }
      }
    }

    yield { type: 'done' };
  }

  /**
   * Check if provider supports tool calling
   */
  supportsTools(): boolean {
    return true;
  }

  /**
   * Check if provider supports function calling
   */
  supportsFunctions(): boolean {
    return true;
  }

  /**
   * Check if provider supports streaming
   */
  supportsStreaming(): boolean {
    return true;
  }

  /**
   * Estimate cost for a completion
   * 
   * Prices as of 2024 (may change):
   * - GPT-4 Turbo: $0.01/1K prompt, $0.03/1K completion
   * - GPT-3.5 Turbo: $0.0005/1K prompt, $0.0015/1K completion
   */
  override estimateCost(promptTokens: number, completionTokens: number): number {
    const model = this.config.defaultModel || 'gpt-4o-mini';

    // Default to GPT-4 Turbo pricing
    let promptCost = 0.01 / 1000;
    let completionCost = 0.03 / 1000;

    if (model.includes('gpt-3.5')) {
      promptCost = 0.0005 / 1000;
      completionCost = 0.0015 / 1000;
    } else if (model.includes('gpt-4o-mini')) {
      promptCost = 0.00015 / 1000;
      completionCost = 0.0006 / 1000;
    } else if (model.includes('gpt-4o')) {
      promptCost = 0.0025 / 1000;
      completionCost = 0.01 / 1000;
    }

    return promptTokens * promptCost + completionTokens * completionCost;
  }

  /**
   * Convert SynapseFlow messages to OpenAI format
   */
  private convertMessages(messages: Message[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.toolCallId || '',
        };
      }

      if (msg.role === 'assistant' && msg.toolCalls) {
        return {
          role: 'assistant',
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        };
      }

      return {
        role: msg.role,
        content: msg.content,
        name: msg.name,
      } as OpenAI.Chat.ChatCompletionMessageParam;
    });
  }

  /**
   * Convert SynapseFlow tools to OpenAI format
   */
  private convertTools(tools: ToolDefinition[]): OpenAI.Chat.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: this.zodToJsonSchema(tool.schema),
      },
    }));
  }

  /**
   * Convert Zod schema to JSON Schema for OpenAI
   * Simplified implementation using any for Zod internals
   */
  private zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
    const def = (schema as any)._def;

    // Handle ZodObject
    if (def.typeName === 'ZodObject') {
      const shape = (schema as z.ZodObject<any>).shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = this.zodToJsonSchema(value as z.ZodTypeAny);
        if (!(value as any).isOptional()) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }

    // Handle ZodString
    if (def.typeName === 'ZodString') {
      return { type: 'string', description: schema.description };
    }

    // Handle ZodNumber
    if (def.typeName === 'ZodNumber') {
      return { type: 'number', description: schema.description };
    }

    // Handle ZodBoolean
    if (def.typeName === 'ZodBoolean') {
      return { type: 'boolean', description: schema.description };
    }

    // Handle ZodArray
    if (def.typeName === 'ZodArray') {
      return {
        type: 'array',
        items: this.zodToJsonSchema(def.type),
        description: schema.description,
      };
    }

    // Handle ZodEnum
    if (def.typeName === 'ZodEnum') {
      return {
        type: 'string',
        enum: def.values,
        description: schema.description,
      };
    }

    // Fallback
    return { type: 'string' };
  }

  /**
   * Map OpenAI finish reason to SynapseFlow format
   */
  private mapFinishReason(
    reason: string | null | undefined
  ): CompletionResult['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
      case 'function_call':
        return 'tool_calls';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}
