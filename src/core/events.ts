/**
 * Event emitter for SynapseFlow
 * 
 * Type-safe event system for agent observability and streaming
 */

import { AgentEvent, AgentEventType } from '../types/index.js';

/**
 * Event listener callback
 */
export type EventListener<T extends AgentEvent = AgentEvent> = (event: T) => void | Promise<void>;

/**
 * Event emitter class for agent events
 * 
 * Provides a type-safe way to emit and listen to agent events
 */
export class EventEmitter {
  private listeners: Map<AgentEventType | '*', Set<EventListener>> = new Map();

  /**
   * Register an event listener
   * 
   * @param event - Event type to listen for, or '*' for all events
   * @param listener - Callback function to invoke when event occurs
   * @returns Unsubscribe function
   */
  on<T extends AgentEvent>(
    event: AgentEventType | '*',
    listener: EventListener<T>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    const listeners = this.listeners.get(event)!;
    listeners.add(listener as EventListener);

    // Return unsubscribe function
    return () => {
      listeners.delete(listener as EventListener);
      if (listeners.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /**
   * Register a one-time event listener
   * 
   * @param event - Event type to listen for
   * @param listener - Callback function to invoke once
   * @returns Unsubscribe function
   */
  once<T extends AgentEvent>(
    event: AgentEventType | '*',
    listener: EventListener<T>
  ): () => void {
    const wrappedListener: EventListener<T> = (e) => {
      unsubscribe();
      return listener(e);
    };

    const unsubscribe = this.on(event, wrappedListener);
    return unsubscribe;
  }

  /**
   * Emit an event to all registered listeners
   * 
   * @param event - Event to emit
   */
  async emit(event: AgentEvent): Promise<void> {
    // Get listeners for this specific event type
    const specificListeners = this.listeners.get(event.type);
    if (specificListeners) {
      await Promise.all(
        Array.from(specificListeners).map((listener) => listener(event))
      );
    }

    // Get wildcard listeners (listening to all events)
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      await Promise.all(
        Array.from(wildcardListeners).map((listener) => listener(event))
      );
    }
  }

  /**
   * Remove a specific listener
   * 
   * @param event - Event type
   * @param listener - Listener to remove
   */
  off<T extends AgentEvent>(event: AgentEventType | '*', listener: EventListener<T>): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(listener as EventListener);
      if (listeners.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Remove all listeners for a specific event type
   * 
   * @param event - Event type, or undefined to remove all listeners
   */
  removeAllListeners(event?: AgentEventType | '*'): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event type
   * 
   * @param event - Event type
   * @returns Number of listeners
   */
  listenerCount(event: AgentEventType | '*'): number {
    const listeners = this.listeners.get(event);
    return listeners ? listeners.size : 0;
  }

  /**
   * Get all event types that have listeners
   * 
   * @returns Array of event types
   */
  eventNames(): (AgentEventType | '*')[] {
    return Array.from(this.listeners.keys());
  }
}

/**
 * Create a scoped event emitter that prefixes trace ID to all events
 * 
 * @param baseEmitter - Base event emitter
 * @param traceId - Trace ID to attach to events
 * @returns Scoped event emitter
 */
export function createScopedEmitter(
  baseEmitter: EventEmitter,
  traceId: string
): EventEmitter {
  const scopedEmitter = new EventEmitter();

  // Forward all events from scoped emitter to base emitter with traceId
  scopedEmitter.on('*', (event) => {
    baseEmitter.emit({ ...event, traceId });
  });

  return scopedEmitter;
}
