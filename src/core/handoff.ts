/**
 * Agent Handoff System
 * 
 * Enables transferring conversations between agents with context preservation
 */

import { EventEmitter } from './events.js';
import { Message } from '../types/index.js';
import { IMemoryStore } from '../types/storage.js';

/**
 * Handoff request configuration
 */
export interface HandoffRequest {
  /**
   * Target agent name or identifier
   */
  targetAgent: string;

  /**
   * Reason for handoff (for context)
   */
  reason?: string;

  /**
   * Additional context to pass
   */
  context?: Record<string, unknown>;

  /**
   * Whether to preserve conversation history
   */
  preserveHistory?: boolean;

  /**
   * Custom instructions for the target agent
   */
  instructions?: string;
}

/**
 * Handoff result
 */
export interface HandoffResult {
  success: boolean;
  targetAgent: string;
  sessionId: string;
  message: string;
  error?: Error;
}

/**
 * Agent handoff manager
 */
export class HandoffManager {
  private emitter: EventEmitter;
  private memoryStore?: IMemoryStore;
  private registeredAgents: Map<string, any> = new Map();

  constructor(emitter: EventEmitter, memoryStore?: IMemoryStore) {
    this.emitter = emitter;
    this.memoryStore = memoryStore;
  }

  /**
   * Register an agent for handoffs
   */
  registerAgent(name: string, agent: any): void {
    if (this.registeredAgents.has(name)) {
      throw new Error(`Agent "${name}" is already registered`);
    }

    this.registeredAgents.set(name, agent);
    console.log(`✅ Registered agent: ${name}`);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(name: string): void {
    this.registeredAgents.delete(name);
    console.log(`❌ Unregistered agent: ${name}`);
  }

  /**
   * Execute a handoff from one agent to another
   */
  async executeHandoff(
    fromAgent: string,
    handoffRequest: HandoffRequest,
    currentSessionId: string
  ): Promise<HandoffResult> {
    const startTime = Date.now();

    // Emit handoff start event
    this.emitter.emit({
      type: 'handoff:start' as const,
      timestamp: startTime,
      fromAgent,
      toAgent: handoffRequest.targetAgent,
      reason: handoffRequest.reason,
    } as any);

    try {
      // Check if target agent exists
      const targetAgent = this.registeredAgents.get(handoffRequest.targetAgent);
      if (!targetAgent) {
        throw new Error(`Target agent "${handoffRequest.targetAgent}" is not registered`);
      }

      // Create new session ID for the target agent
      const newSessionId = `${currentSessionId}-handoff-${Date.now()}`;

      // Preserve conversation history if requested
      if (handoffRequest.preserveHistory && this.memoryStore) {
        await this.transferHistory(currentSessionId, newSessionId);
      }

      // Add handoff context message
      const handoffMessage: Message = {
        role: 'system',
        content: this.createHandoffMessage(fromAgent, handoffRequest),
        timestamp: Date.now(),
      };

      if (this.memoryStore) {
        await this.memoryStore.saveMessage(newSessionId, handoffMessage);
      }

      // Emit handoff complete event
      this.emitter.emit({
        type: 'handoff:complete' as const,
        timestamp: Date.now(),
        fromAgent,
        toAgent: handoffRequest.targetAgent,
        sessionId: newSessionId,
        duration: Date.now() - startTime,
      } as any);

      return {
        success: true,
        targetAgent: handoffRequest.targetAgent,
        sessionId: newSessionId,
        message: `Successfully handed off to ${handoffRequest.targetAgent}`,
      };
    } catch (error) {
      // Emit error event
      this.emitter.emit({
        type: 'agent:error' as const,
        timestamp: Date.now(),
        error: error as Error,
        phase: 'handoff',
      } as any);

      return {
        success: false,
        targetAgent: handoffRequest.targetAgent,
        sessionId: currentSessionId,
        message: `Failed to hand off to ${handoffRequest.targetAgent}`,
        error: error as Error,
      };
    }
  }

  /**
   * Transfer conversation history to new session
   */
  private async transferHistory(fromSessionId: string, toSessionId: string): Promise<void> {
    if (!this.memoryStore) {
      return;
    }

    const history = await this.memoryStore.getHistory(fromSessionId);

    // Copy all messages to new session
    for (const message of history) {
      await this.memoryStore.saveMessage(toSessionId, message);
    }

    console.log(`📋 Transferred ${history.length} messages to new session`);
  }

  /**
   * Create handoff context message
   */
  private createHandoffMessage(fromAgent: string, request: HandoffRequest): string {
    let message = `[HANDOFF] This conversation has been transferred from agent "${fromAgent}" to agent "${request.targetAgent}".`;

    if (request.reason) {
      message += `\n\nReason: ${request.reason}`;
    }

    if (request.instructions) {
      message += `\n\nInstructions: ${request.instructions}`;
    }

    if (request.context) {
      message += `\n\nContext: ${JSON.stringify(request.context, null, 2)}`;
    }

    return message;
  }

  /**
   * Get registered agent names
   */
  getRegisteredAgents(): string[] {
    return Array.from(this.registeredAgents.keys());
  }

  /**
   * Check if an agent is registered
   */
  isAgentRegistered(name: string): boolean {
    return this.registeredAgents.has(name);
  }

  /**
   * Create a handoff function for an agent to use as a tool
   */
  createHandoffTool(currentAgentName: string, currentSessionId: string) {
    return {
      name: 'handoff_to_agent',
      description: 'Transfer this conversation to another specialized agent',
      schema: {
        type: 'object',
        properties: {
          targetAgent: {
            type: 'string',
            description: 'Name of the agent to hand off to',
            enum: this.getRegisteredAgents().filter((name) => name !== currentAgentName),
          },
          reason: {
            type: 'string',
            description: 'Reason for the handoff',
          },
          context: {
            type: 'object',
            description: 'Additional context to pass to the target agent',
          },
        },
        required: ['targetAgent', 'reason'],
      },
      execute: async (input: any) => {
        const result = await this.executeHandoff(currentAgentName, input, currentSessionId);
        return result;
      },
    };
  }
}

/**
 * Create a handoff-enabled agent wrapper
 */
export function createHandoffAgent(agent: any, handoffManager: HandoffManager): any {
  // Register the agent
  handoffManager.registerAgent(agent.config.name, agent);

  // Return the agent with handoff capabilities
  return {
    ...agent,
    handoffManager,
  };
}
