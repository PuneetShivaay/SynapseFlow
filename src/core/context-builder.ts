/**
 * Context builder for assembling prompts
 */

import { Message, ToolDefinition, AgentConfig } from '../types/index.js';
import { estimateTokens, truncate } from './utils.js';

/**
 * Context builder for creating LLM prompts
 * 
 * Assembles system instructions, conversation history, and tool definitions
 * while managing token limits
 */
export class ContextBuilder {
  private config: AgentConfig;
  private maxContextTokens: number;

  constructor(config: AgentConfig, maxContextTokens = 8000) {
    this.config = config;
    this.maxContextTokens = maxContextTokens;
  }

  /**
   * Build context messages for LLM call
   * 
   * @param history - Conversation history
   * @param tools - Available tools
   * @returns Array of messages with proper context
   */
  buildMessages(history: Message[], tools?: ToolDefinition[]): Message[] {
    const messages: Message[] = [];

    // Add system message with instructions
    const systemMessage = this.buildSystemMessage(tools);
    messages.push(systemMessage);

    // Add conversation history (with token management)
    const truncatedHistory = this.truncateHistory(history, systemMessage);
    messages.push(...truncatedHistory);

    return messages;
  }

  /**
   * Build system message with instructions and tool context
   */
  private buildSystemMessage(tools?: ToolDefinition[]): Message {
    let content = this.config.instructions;

    // Add tool context if available
    if (tools && tools.length > 0) {
      content += '\n\nYou have access to the following tools:\n';
      for (const tool of tools) {
        content += `- ${tool.name}: ${tool.description}\n`;
      }
      content += '\nUse these tools when needed to complete the user\'s request.';
    }

    return {
      role: 'system',
      content,
      timestamp: Date.now(),
    };
  }

  /**
   * Truncate history to fit within token limits
   * 
   * Strategy: Keep most recent messages, always keep first user message
   */
  private truncateHistory(history: Message[], systemMessage: Message): Message[] {
    if (history.length === 0) {
      return [];
    }

    // Estimate tokens for system message
    const systemTokens = estimateTokens(systemMessage.content);
    const availableTokens = this.maxContextTokens - systemTokens - 500; // Reserve for response

    // Calculate tokens for each message
    const messagesWithTokens = history.map((msg) => ({
      message: msg,
      tokens: estimateTokens(msg.content) + (msg.toolCalls ? 100 : 0), // Extra for tool calls
    }));

    // If all messages fit, return them
    const totalTokens = messagesWithTokens.reduce((sum, m) => sum + m.tokens, 0);
    if (totalTokens <= availableTokens) {
      return history;
    }

    // Otherwise, truncate from the middle (keep first and recent messages)
    const result: Message[] = [];
    let currentTokens = 0;

    // Always include first message if it's from user
    if (history[0]?.role === 'user') {
      result.push(history[0]);
      currentTokens += messagesWithTokens[0]!.tokens;
    }

    // Add messages from the end
    for (let i = messagesWithTokens.length - 1; i >= 1; i--) {
      const item = messagesWithTokens[i];
      if (!item) continue;

      if (currentTokens + item.tokens <= availableTokens) {
        result.unshift(item.message);
        currentTokens += item.tokens;
      } else {
        break;
      }
    }

    return result;
  }

  /**
   * Format tool results as messages
   */
  formatToolResults(results: { toolCallId: string; toolName: string; result: unknown }[]): Message[] {
    return results.map((result) => ({
      role: 'tool' as const,
      content: this.serializeToolResult(result.result),
      toolCallId: result.toolCallId,
      name: result.toolName,
      timestamp: Date.now(),
    }));
  }

  /**
   * Serialize tool result to string
   */
  private serializeToolResult(result: unknown): string {
    if (typeof result === 'string') {
      return result;
    }

    if (result === null || result === undefined) {
      return 'null';
    }

    try {
      const serialized = JSON.stringify(result, null, 2);
      // Truncate very long results
      return truncate(serialized, 2000, '... (truncated)');
    } catch {
      return String(result);
    }
  }

  /**
   * Estimate total tokens for current context
   */
  estimateContextTokens(history: Message[]): number {
    const messages = this.buildMessages(history);
    return messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
  }
}
