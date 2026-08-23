/**
 * Memory and graph storage types
 * 
 * Interfaces for persistent memory and graph database operations
 */

import { Message } from './index.js';

/**
 * Memory store interface for conversation history
 */
export interface IMemoryStore {
  /**
   * Save a message to a session
   */
  saveMessage(sessionId: string, message: Message): Promise<void>;

  /**
   * Get conversation history for a session
   */
  getHistory(sessionId: string, limit?: number): Promise<Message[]>;

  /**
   * Clear all messages in a session
   */
  clearSession(sessionId: string): Promise<void>;

  /**
   * Delete a session completely
   */
  deleteSession(sessionId: string): Promise<void>;

  /**
   * Get all session IDs
   */
  listSessions(): Promise<string[]>;

  /**
   * Get session metadata
   */
  getSessionMetadata(sessionId: string): Promise<SessionMetadata | null>;

  /**
   * Update session metadata
   */
  updateSessionMetadata(sessionId: string, metadata: Partial<SessionMetadata>): Promise<void>;
}

/**
 * Session metadata
 */
export interface SessionMetadata {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  metadata?: Record<string, unknown>;
}

/**
 * Graph node representing an entity or concept
 */
export interface GraphNode {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/**
 * Graph relationship between nodes
 */
export interface GraphRelationship {
  id: string;
  fromId: string;
  toId: string;
  type: string;
  properties?: Record<string, unknown>;
  confidence?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Graph query result
 */
export interface GraphQueryResult {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

/**
 * Graph store interface for knowledge graph operations
 */
export interface IGraphStore {
  /**
   * Add a node to the graph
   */
  addNode(type: string, properties: Record<string, unknown>): Promise<string>;

  /**
   * Get a node by ID
   */
  getNode(id: string): Promise<GraphNode | null>;

  /**
   * Update node properties
   */
  updateNode(id: string, properties: Record<string, unknown>): Promise<void>;

  /**
   * Delete a node
   */
  deleteNode(id: string): Promise<void>;

  /**
   * Find nodes by type and properties
   */
  findNodes(type: string, properties?: Record<string, unknown>): Promise<GraphNode[]>;

  /**
   * Add a relationship between nodes
   */
  addRelationship(
    fromId: string,
    toId: string,
    type: string,
    properties?: Record<string, unknown>
  ): Promise<string>;

  /**
   * Get a relationship by ID
   */
  getRelationship(id: string): Promise<GraphRelationship | null>;

  /**
   * Update relationship properties
   */
  updateRelationship(id: string, properties: Record<string, unknown>): Promise<void>;

  /**
   * Delete a relationship
   */
  deleteRelationship(id: string): Promise<void>;

  /**
   * Find relationships by type
   */
  findRelationships(type: string, fromId?: string, toId?: string): Promise<GraphRelationship[]>;

  /**
   * Execute a custom query (implementation-specific, e.g., Cypher for Neo4j)
   */
  query(query: string, params?: Record<string, unknown>): Promise<unknown[]>;

  /**
   * Find similar nodes based on properties
   */
  findSimilar(nodeId: string, limit?: number): Promise<GraphNode[]>;

  /**
   * Get neighbors of a node up to a certain depth
   */
  getNeighbors(nodeId: string, depth?: number, relationshipType?: string): Promise<GraphNode[]>;

  /**
   * Get the full subgraph around a node
   */
  getSubgraph(nodeId: string, depth?: number): Promise<GraphQueryResult>;

  /**
   * Merge duplicate nodes
   */
  mergeNodes(sourceId: string, targetId: string): Promise<void>;

  /**
   * Get graph statistics
   */
  getStats(): Promise<GraphStats>;
}

/**
 * Graph database statistics
 */
export interface GraphStats {
  nodeCount: number;
  relationshipCount: number;
  nodeTypes: Record<string, number>;
  relationshipTypes: Record<string, number>;
}

/**
 * Context retrieved from graph for agent
 */
export interface GraphContext {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  relevanceScore: number;
  summary: string;
}

/**
 * Memory extraction result from conversations
 */
export interface MemoryExtraction {
  entities: ExtractedEntity[];
  facts: ExtractedFact[];
  relationships: ExtractedRelationship[];
}

/**
 * Extracted entity from conversation
 */
export interface ExtractedEntity {
  type: string;
  name: string;
  description?: string;
  properties?: Record<string, unknown>;
  confidence: number;
}

/**
 * Extracted fact from conversation
 */
export interface ExtractedFact {
  statement: string;
  subject?: string;
  predicate?: string;
  object?: string;
  confidence: number;
  source: string;
}

/**
 * Extracted relationship from conversation
 */
export interface ExtractedRelationship {
  from: string;
  to: string;
  type: string;
  properties?: Record<string, unknown>;
  confidence: number;
}
