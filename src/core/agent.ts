/**
 * Core agent implementation
 */

import { IModelProvider } from '../types/provider.js';
import {
  AgentConfig,
  RunOptions,
  AgentResult,
  Message,
  ToolResult,
  AgentEvent,
} from '../types/index.js';
import { EventEmitter } from './events.js';
import { ContextBuilder } from './context-builder.js';
import { ToolRegistry } from '../tools/registry.js';
import { ToolExecutor } from '../tools/executor.js';
import { generateId } from './utils.js';
import { ConfigurationError } from '../types/index.js';

/**
 * Main agent class for executing AI agent workflows
 * 
 * Features:
 * - Iterative LLM execution with tool calling
 * - Event emission for observability
 * - Safe stopping conditions
 * - Memory integration ready
 */
export class Agent {
  private config: AgentConfig;
  private provider: IModelProvider;
  private tools: ToolRegistry;
  private executor: ToolExecutor;
  private contextBuilder: ContextBuilder;
  private emitter: EventEmitter;
  private isRunning: boolean = false;

  constructor(config: AgentConfig, provider: IModelProvider) {
    this.validateConfig(config);
    
    this.config = {
      ...config,
      maxIterations: config.maxIterations || 10,
      timeout: config.timeout || 60000,
      temperature: config.temperature ?? 0.7,
    };
    
    this.provider = provider;
    this.emitter = new EventEmitter();
    this.tools = new ToolRegistry();
    this.executor = new ToolExecutor(this.emitter);
    this.contextBuilder = new ContextBuilder(this.config);

    // Register tools
    if (config.tools) {
      this.tools.registerMany(config.tools);
    }
  }

  /**
   * Run the agent with user input
   * 
   * @param input - User input message
   * @param options - Run options
   * @returns Agent result with output and metadata
   */
  async run(input: string, options: RunOptions = {}): Promise<AgentResult> {
    if (this.isRunning) {
      throw new ConfigurationError('Agent is already running');
    }

    this.isRunning = true;
    const startTime = Date.now();
    const runId = generateId();

    try {
      // Emit start event
      await this.emitter.emit({
        type: 'agent:start',
        timestamp: Date.now(),
        traceId: runId,
        agentName: this.config.name,
        input,
      });

      // Initialize conversation history
      const history: Message[] = [
        {
          role: 'user',
          content: input,
          timestamp: Date.now(),
        },
      ];

      // Execute agent loop
      const result = await this.executeLoop(history, options, runId);

      // Calculate metrics
      const duration = Date.now() - startTime;
      const agentResult: AgentResult = {
        success: true,
        output: result.output,
        iterations: result.iterations,
        toolCalls: result.toolCalls,
        duration,
        tokensUsed: result.tokensUsed,
        cost: result.cost,
        traceId: runId,
      };

      // Emit complete event
      await this.emitter.emit({
        type: 'agent:complete',
        timestamp: Date.now(),
        traceId: runId,
        result: agentResult,
      });

      return agentResult;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Emit error event
      await this.emitter.emit({
        type: 'agent:error',
        timestamp: Date.now(),
        traceId: runId,
      });

      return {
        success: false,
        output: '',
        iterations: 0,
        toolCalls: [],
        duration,
        error: error as Error,
        traceId: runId,
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Main agent execution loop
   * 
   * Loop: LLM call → Tool execution → LLM call → ... → Final response
   */
  private async executeLoop(
    history: Message[],
    options: RunOptions,
    runId: string
  ): Promise<{
    output: string;
    iterations: number;
    toolCalls: ToolResult[];
    tokensUsed?: number;
    cost?: number;
  }> {
    const maxIterations = options.maxIterations || this.config.maxIterations || 10;
    const allToolCalls: ToolResult[] = [];
    let totalTokens = 0;
    let totalCost = 0;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      // Build context for LLM
      const messages = this.contextBuilder.buildMessages(
        history,
        this.tools.list()
      );

      // Call LLM
      await this.emitter.emit({
        type: 'llm:call:start',
        timestamp: Date.now(),
        traceId: runId,
        model: this.config.model,
        messages,
      });

      const llmStartTime = Date.now();
      const completion = await this.provider.complete(messages, {
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
        tools: this.tools.list(),
        toolChoice: 'auto',
      });

      const llmDuration = Date.now() - llmStartTime;

      // Track tokens and cost
      if (completion.usage) {
        totalTokens += completion.usage.totalTokens;
        if (this.provider.estimateCost) {
          totalCost += this.provider.estimateCost(
            completion.usage.promptTokens,
            completion.usage.completionTokens
          );
        }
      }

      await this.emitter.emit({
        type: 'llm:call:complete',
        timestamp: Date.now(),
        traceId: runId,
        response: completion.content,
        tokensUsed: completion.usage?.totalTokens,
        duration: llmDuration,
      });

      // Add assistant message to history
      history.push({
        role: 'assistant',
        content: completion.content,
        toolCalls: completion.toolCalls,
        timestamp: Date.now(),
      });

      // Check if we're done (no tool calls)
      if (!completion.toolCalls || completion.toolCalls.length === 0) {
        return {
          output: completion.content,
          iterations: iteration,
          toolCalls: allToolCalls,
          tokensUsed: totalTokens,
          cost: totalCost,
        };
      }

      // Execute tool calls
      const toolResults = await this.executor.executeMany(
        new Map(this.tools.list().map((t) => [t.name, t])),
        completion.toolCalls
      );

      allToolCalls.push(...toolResults);

      // Add tool results to history
      const toolMessages = this.contextBuilder.formatToolResults(
        toolResults.map((r) => ({
          toolCallId: r.toolCallId,
          toolName: r.toolName,
          result: r.error || r.result,
        }))
      );
      history.push(...toolMessages);
    }

    // Max iterations reached
    return {
      output: history[history.length - 1]?.content || 'Max iterations reached',
      iterations: iteration,
      toolCalls: allToolCalls,
      tokensUsed: totalTokens,
      cost: totalCost,
    };
  }

  /**
   * Stream agent execution
   * 
   * @param input - User input
   * @param options - Run options
   */
  async *stream(
    input: string,
    options: RunOptions = {}
  ): AsyncIterableIterator<AgentEvent> {
    // Collect events during execution
    const events: AgentEvent[] = [];
    const unsubscribe = this.emitter.on('*', (event) => {
      events.push(event);
    });

    try {
      // Start execution in background
      const resultPromise = this.run(input, options);

      // Yield events as they come in
      while (this.isRunning || events.length > 0) {
        if (events.length > 0) {
          const event = events.shift();
          if (event) {
            yield event;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Wait for final result
      const result = await resultPromise;
      yield {
        type: 'agent:complete',
        timestamp: Date.now(),
        result,
      };
    } finally {
      unsubscribe();
    }
  }

  /**
   * Register an event listener
   */
  on(event: AgentEvent['type'] | '*', listener: (event: AgentEvent) => void | Promise<void>): () => void {
    return this.emitter.on(event, listener);
  }

  /**
   * Stop the agent (if running)
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Get agent configuration
   */
  getConfig(): Readonly<AgentConfig> {
    return { ...this.config };
  }

  /**
   * Validate agent configuration
   */
  private validateConfig(config: AgentConfig): void {
    if (!config.name) {
      throw new ConfigurationError('Agent name is required');
    }

    if (!config.instructions) {
      throw new ConfigurationError('Agent instructions are required');
    }

    if (!config.model) {
      throw new ConfigurationError('Model is required');
    }
  }
}
