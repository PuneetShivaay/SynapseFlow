/**
 * Tool executor for running tools safely
 */

import { ToolDefinition, ToolResult, ToolCall } from '../types/index.js';
import { ToolExecutionError, ValidationError, TimeoutError } from '../types/index.js';
import { withTimeout } from '../core/utils.js';
import { EventEmitter } from '../core/events.js';
import { z } from 'zod';

/**
 * Executor for running tools with validation and error handling
 */
export class ToolExecutor {
  private emitter: EventEmitter;
  private defaultTimeout: number;

  constructor(emitter: EventEmitter, defaultTimeout = 30000) {
    this.emitter = emitter;
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Execute a single tool call
   * 
   * @param tool - Tool definition
   * @param toolCall - Tool call from LLM
   * @returns Tool result
   */
  async execute(tool: ToolDefinition, toolCall: ToolCall): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // Parse and validate input
      const input = this.parseToolInput(toolCall.function.arguments);
      const validatedInput = this.validateInput(tool, input);

      // Emit start event
      await this.emitter.emit({
        type: 'tool:start',
        timestamp: Date.now(),
        toolName: tool.name,
        input: validatedInput,
      });

      // Execute tool with timeout
      const timeout = tool.timeout || this.defaultTimeout;
      const result = await withTimeout(
        () => tool.execute(validatedInput),
        timeout
      );

      const duration = Date.now() - startTime;

      // Emit complete event
      await this.emitter.emit({
        type: 'tool:complete',
        timestamp: Date.now(),
        toolName: tool.name,
        result,
        duration,
      });

      return {
        toolCallId: toolCall.id,
        toolName: tool.name,
        result,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Emit error event
      await this.emitter.emit({
        type: 'tool:error',
        timestamp: Date.now(),
        toolName: tool.name,
        error: error as Error,
      } as any);

      return {
        toolCallId: toolCall.id,
        toolName: tool.name,
        result: null,
        error: this.normalizeError(error, tool.name),
        duration,
      };
    }
  }

  /**
   * Execute multiple tool calls in parallel
   * 
   * @param tools - Map of tool name to tool definition
   * @param toolCalls - Array of tool calls
   * @returns Array of tool results
   */
  async executeMany(
    tools: Map<string, ToolDefinition>,
    toolCalls: ToolCall[]
  ): Promise<ToolResult[]> {
    const promises = toolCalls.map(async (toolCall) => {
      const tool = tools.get(toolCall.function.name);

      if (!tool) {
        return {
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          result: null,
          error: new ToolExecutionError(
            `Tool '${toolCall.function.name}' not found`,
            { toolName: toolCall.function.name }
          ),
        };
      }

      return this.execute(tool, toolCall);
    });

    return Promise.all(promises);
  }

  /**
   * Parse tool input from JSON string
   */
  private parseToolInput(argumentsJson: string): unknown {
    try {
      return JSON.parse(argumentsJson);
    } catch (error) {
      throw new ValidationError('Invalid JSON in tool arguments', {
        arguments: argumentsJson,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Validate input against tool schema
   */
  private validateInput(tool: ToolDefinition, input: unknown): unknown {
    try {
      return tool.schema.parse(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(
          `Tool '${tool.name}' input validation failed`,
          {
            toolName: tool.name,
            errors: error.issues,
            input,
          }
        );
      }

      throw error;
    }
  }

  /**
   * Normalize errors to standard format
   */
  private normalizeError(error: unknown, toolName: string): Error {
    if (error instanceof Error) {
      if (error instanceof TimeoutError) {
        return new ToolExecutionError(
          `Tool '${toolName}' execution timed out`,
          {
            toolName,
            originalError: error.message,
          }
        );
      }

      if (error instanceof ValidationError) {
        return error;
      }

      return new ToolExecutionError(
        `Tool '${toolName}' execution failed: ${error.message}`,
        {
          toolName,
          originalError: error.message,
          stack: error.stack,
        }
      );
    }

    return new ToolExecutionError(
      `Tool '${toolName}' execution failed with unknown error`,
      {
        toolName,
        originalError: String(error),
      }
    );
  }
}
