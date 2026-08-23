/**
 * Tool registry for managing and executing tools
 */

import { ToolDefinition } from '../types/index.js';
import { ConfigurationError } from '../types/index.js';

/**
 * Registry for managing agent tools
 * 
 * Provides a central place to register, retrieve, and manage tools
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  /**
   * Register a tool
   * 
   * @param tool - Tool definition to register
   * @throws ConfigurationError if tool with same name already exists
   */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new ConfigurationError(`Tool with name '${tool.name}' already registered`, {
        toolName: tool.name,
      });
    }

    this.tools.set(tool.name, tool);
  }

  /**
   * Register multiple tools at once
   * 
   * @param tools - Array of tool definitions
   */
  registerMany(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Get a tool by name
   * 
   * @param name - Tool name
   * @returns Tool definition or undefined if not found
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists
   * 
   * @param name - Tool name
   * @returns True if tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tools
   * 
   * @returns Array of all tool definitions
   */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get all tool names
   * 
   * @returns Array of tool names
   */
  names(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Remove a tool
   * 
   * @param name - Tool name to remove
   * @returns True if tool was removed, false if it didn't exist
   */
  remove(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Clear all tools
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * Get the number of registered tools
   * 
   * @returns Tool count
   */
  count(): number {
    return this.tools.size;
  }
}
