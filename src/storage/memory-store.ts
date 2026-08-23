/**
 * In-memory implementation of memory store
 * 
 * Fast, non-persistent storage for conversation history
 */

import { IMemoryStore, SessionMetadata } from '../types/storage.js';
import { Message } from '../types/index.js';

/**
 * In-memory store for conversation history
 * 
 * Features:
 * - Fast access with Map storage
 * - Session-based organization
 * - Automatic metadata tracking
 * - Non-persistent (data lost on restart)
 */
export class InMemoryStore implements IMemoryStore {
  private sessions: Map<string, Message[]> = new Map();
  private metadata: Map<string, SessionMetadata> = new Map();

  /**
   * Save a message to a session
   */
  async saveMessage(sessionId: string, message: Message): Promise<void> {
    // Get or create session
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, []);
      this.metadata.set(sessionId, {
        sessionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
      });
    }

    // Add message
    const messages = this.sessions.get(sessionId)!;
    messages.push(message);

    // Update metadata
    const meta = this.metadata.get(sessionId)!;
    meta.updatedAt = Date.now();
    meta.messageCount = messages.length;
  }

  /**
   * Get conversation history for a session
   */
  async getHistory(sessionId: string, limit?: number): Promise<Message[]> {
    const messages = this.sessions.get(sessionId) || [];

    if (limit && limit > 0) {
      return messages.slice(-limit);
    }

    return [...messages];
  }

  /**
   * Clear all messages in a session
   */
  async clearSession(sessionId: string): Promise<void> {
    const messages = this.sessions.get(sessionId);
    if (messages) {
      messages.length = 0;
      const meta = this.metadata.get(sessionId);
      if (meta) {
        meta.messageCount = 0;
        meta.updatedAt = Date.now();
      }
    }
  }

  /**
   * Delete a session completely
   */
  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    this.metadata.delete(sessionId);
  }

  /**
   * Get all session IDs
   */
  async listSessions(): Promise<string[]> {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get session metadata
   */
  async getSessionMetadata(sessionId: string): Promise<SessionMetadata | null> {
    const meta = this.metadata.get(sessionId);
    return meta ? { ...meta } : null;
  }

  /**
   * Update session metadata
   */
  async updateSessionMetadata(
    sessionId: string,
    metadata: Partial<SessionMetadata>
  ): Promise<void> {
    const existing = this.metadata.get(sessionId);
    if (existing) {
      Object.assign(existing, metadata);
      existing.updatedAt = Date.now();
    }
  }

  /**
   * Get total number of sessions
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get total number of messages across all sessions
   */
  getTotalMessageCount(): number {
    let count = 0;
    for (const messages of this.sessions.values()) {
      count += messages.length;
    }
    return count;
  }

  /**
   * Clear all sessions (useful for testing)
   */
  clearAll(): void {
    this.sessions.clear();
    this.metadata.clear();
  }
}
