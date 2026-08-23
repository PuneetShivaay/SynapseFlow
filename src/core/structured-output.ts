/**
 * Structured Output System
 * 
 * Type-safe structured responses from LLMs using Zod schemas
 */

import { z } from 'zod';
import { IModelProvider } from '../types/provider.js';
import { Message } from '../types/index.js';

/**
 * Structured output options
 */
export interface StructuredOutputOptions {
  /**
   * Maximum retries on validation failure
   */
  maxRetries?: number;

  /**
   * Whether to use JSON mode (if provider supports it)
   */
  useJsonMode?: boolean;

  /**
   * Temperature for generation
   */
  temperature?: number;

  /**
   * Max tokens for response
   */
  maxTokens?: number;

  /**
   * Whether to include schema in prompt
   */
  includeSchemaInPrompt?: boolean;
}

/**
 * Structured output result
 */
export interface StructuredOutputResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  rawResponse?: string;
}

/**
 * Structured output generator
 */
export class StructuredOutputGenerator {
  private provider: IModelProvider;

  constructor(provider: IModelProvider) {
    this.provider = provider;
  }

  /**
   * Generate structured output from LLM
   */
  async generate<T>(
    schema: z.ZodType<T>,
    messages: Message[],
    options: StructuredOutputOptions = {}
  ): Promise<StructuredOutputResult<T>> {
    const {
      maxRetries = 3,
      useJsonMode = true,
      temperature = 0.3,
      maxTokens = 2000,
      includeSchemaInPrompt = true,
    } = options;

    let attempts = 0;
    let lastError: Error | undefined;
    let lastRawResponse: string | undefined;

    // Add schema to system message if requested
    const enhancedMessages = includeSchemaInPrompt
      ? this.addSchemaToMessages(messages, schema)
      : messages;

    while (attempts < maxRetries) {
      attempts++;

      try {
        // Call LLM
        const response = await this.provider.complete(enhancedMessages, {
          temperature,
          maxTokens,
          // Enable JSON mode if provider supports it
          ...(useJsonMode ? { responseFormat: { type: 'json_object' } } : {}),
        } as any);

        lastRawResponse = response.content;

        // Try to parse JSON
        const parsed = this.extractJson(response.content);
        if (!parsed) {
          throw new Error('Response is not valid JSON');
        }

        // Validate against schema
        const validated = schema.parse(parsed);

        return {
          success: true,
          data: validated,
          attempts,
          rawResponse: response.content,
        };
      } catch (error) {
        lastError = error as Error;
        console.log(`Attempt ${attempts}/${maxRetries} failed:`, (error as Error).message);

        // Add error feedback to messages for next attempt
        if (attempts < maxRetries) {
          enhancedMessages.push({
            role: 'assistant',
            content: lastRawResponse || '',
          });
          enhancedMessages.push({
            role: 'user',
            content: `The previous response was invalid. Error: ${(error as Error).message}\n\nPlease provide a valid JSON response that matches the required schema.`,
          });
        }
      }
    }

    return {
      success: false,
      error: lastError,
      attempts,
      rawResponse: lastRawResponse,
    };
  }

  /**
   * Generate structured output with retry
   */
  async generateWithRetry<T>(
    schema: z.ZodType<T>,
    prompt: string,
    systemPrompt?: string,
    options: StructuredOutputOptions = {}
  ): Promise<T> {
    const messages: Message[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    const result = await this.generate(schema, messages, options);

    if (!result.success || !result.data) {
      throw new Error(
        `Failed to generate structured output after ${result.attempts} attempts: ${result.error?.message}`
      );
    }

    return result.data;
  }

  /**
   * Add schema description to messages
   */
  private addSchemaToMessages<T>(messages: Message[], schema: z.ZodType<T>): Message[] {
    const schemaDescription = this.generateSchemaDescription(schema);

    // Add to system message if exists, otherwise create one
    const systemMessageIndex = messages.findIndex((m) => m.role === 'system');

    if (systemMessageIndex >= 0) {
      const systemMessage = messages[systemMessageIndex]!;
      messages[systemMessageIndex] = {
        ...systemMessage,
        content: `${systemMessage.content}\n\n${schemaDescription}`,
      };
      return [...messages];
    } else {
      return [
        {
          role: 'system',
          content: schemaDescription,
        },
        ...messages,
      ];
    }
  }

  /**
   * Generate human-readable schema description
   */
  private generateSchemaDescription<T>(schema: z.ZodType<T>): string {
    let description = 'You must respond with valid JSON matching this schema:\n\n';

    try {
      // Try to get JSON schema representation
      const jsonSchema = this.zodToJsonSchema(schema);
      description += '```json\n';
      description += JSON.stringify(jsonSchema, null, 2);
      description += '\n```\n\n';
      description += 'Return ONLY valid JSON, no other text.';
    } catch (error) {
      description += 'Return valid JSON object.';
    }

    return description;
  }

  /**
   * Convert Zod schema to JSON Schema (simplified)
   */
  private zodToJsonSchema(schema: any): any {
    // This is a simplified version - for production, use zod-to-json-schema library
    if (schema._def?.typeName) {
      switch (schema._def.typeName) {
        case 'ZodObject':
          return {
            type: 'object',
            properties: Object.entries(schema._def.shape() || {}).reduce(
              (acc: any, [key, value]: [string, any]) => {
                acc[key] = this.zodToJsonSchema(value);
                return acc;
              },
              {}
            ),
            required: Object.keys(schema._def.shape() || {}),
          };

        case 'ZodString':
          return { type: 'string' };

        case 'ZodNumber':
          return { type: 'number' };

        case 'ZodBoolean':
          return { type: 'boolean' };

        case 'ZodArray':
          return {
            type: 'array',
            items: this.zodToJsonSchema(schema._def.type),
          };

        case 'ZodOptional':
          return this.zodToJsonSchema(schema._def.innerType);

        case 'ZodNullable':
          return {
            anyOf: [this.zodToJsonSchema(schema._def.innerType), { type: 'null' }],
          };

        default:
          return { type: 'any' };
      }
    }

    return { type: 'any' };
  }

  /**
   * Extract JSON from response text
   */
  private extractJson(text: string): any {
    try {
      // Try direct parse first
      return JSON.parse(text);
    } catch {
      // Try to find JSON in code blocks
      const codeBlockMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
      if (codeBlockMatch) {
        try {
          return JSON.parse(codeBlockMatch[1]!);
        } catch {
          // Continue to next attempt
        }
      }

      // Try to find JSON object in text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]!);
        } catch {
          // Continue to next attempt
        }
      }

      return null;
    }
  }
}

/**
 * Helper function to create structured output generator
 */
export function createStructuredOutput(provider: IModelProvider): StructuredOutputGenerator {
  return new StructuredOutputGenerator(provider);
}

/**
 * Common schema examples
 */
export const CommonSchemas = {
  /**
   * Yes/No decision schema
   */
  decision: z.object({
    decision: z.enum(['yes', 'no']),
    reasoning: z.string(),
    confidence: z.number().min(0).max(1),
  }),

  /**
   * Classification schema
   */
  classification: z.object({
    category: z.string(),
    subcategory: z.string().optional(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
  }),

  /**
   * Extraction schema
   */
  extraction: z.object({
    entities: z.array(
      z.object({
        text: z.string(),
        type: z.string(),
        confidence: z.number().min(0).max(1),
      })
    ),
  }),

  /**
   * Sentiment analysis schema
   */
  sentiment: z.object({
    sentiment: z.enum(['positive', 'negative', 'neutral']),
    score: z.number().min(-1).max(1),
    aspects: z.array(
      z.object({
        aspect: z.string(),
        sentiment: z.enum(['positive', 'negative', 'neutral']),
      })
    ),
  }),

  /**
   * Summary schema
   */
  summary: z.object({
    summary: z.string(),
    keyPoints: z.array(z.string()),
    length: z.enum(['short', 'medium', 'long']),
  }),
};
