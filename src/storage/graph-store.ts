/**
 * SQLite-based graph store
 * 
 * Lightweight graph database using SQLite without Docker
 */

import Database from 'better-sqlite3';
import {
  IGraphStore,
  GraphNode,
  GraphRelationship,
  GraphQueryResult,
  GraphStats,
} from '../types/storage.js';
import { generateId } from '../core/utils.js';

/**
 * SQLite implementation of graph store
 * 
 * Features:
 * - No Docker required
 * - Portable single file
 * - ACID transactions
 * - Full-text search ready
 */
export class SQLiteGraphStore implements IGraphStore {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    // Create nodes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        properties TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
      CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON nodes(created_at);
    `);

    // Create relationships table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        type TEXT NOT NULL,
        properties TEXT,
        confidence REAL DEFAULT 1.0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_relationships_from ON relationships(from_id);
      CREATE INDEX IF NOT EXISTS idx_relationships_to ON relationships(to_id);
      CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(type);
    `);

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
  }

  /**
   * Add a node to the graph
   */
  async addNode(type: string, properties: Record<string, unknown>): Promise<string> {
    const id = generateId();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO nodes (id, type, properties, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, type, JSON.stringify(properties), now, now);

    return id;
  }

  /**
   * Get a node by ID
   */
  async getNode(id: string): Promise<GraphNode | null> {
    const stmt = this.db.prepare('SELECT * FROM nodes WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) {
      return null;
    }

    return this.rowToNode(row);
  }

  /**
   * Update node properties
   */
  async updateNode(id: string, properties: Record<string, unknown>): Promise<void> {
    const existing = await this.getNode(id);
    if (!existing) {
      throw new Error(`Node ${id} not found`);
    }

    const merged = { ...existing.properties, ...properties };

    const stmt = this.db.prepare(`
      UPDATE nodes 
      SET properties = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(JSON.stringify(merged), Date.now(), id);
  }

  /**
   * Delete a node
   */
  async deleteNode(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM nodes WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Find nodes by type and properties
   */
  async findNodes(
    type: string,
    properties?: Record<string, unknown>
  ): Promise<GraphNode[]> {
    let query = 'SELECT * FROM nodes WHERE type = ?';
    const params: any[] = [type];

    // If properties filter is provided, add JSON filtering
    if (properties && Object.keys(properties).length > 0) {
      const rows = this.db.prepare(query).all(...params) as any[];
      return rows
        .map((row) => this.rowToNode(row))
        .filter((node) => this.matchesProperties(node.properties, properties));
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((row) => this.rowToNode(row));
  }

  /**
   * Add a relationship between nodes
   */
  async addRelationship(
    fromId: string,
    toId: string,
    type: string,
    properties?: Record<string, unknown>
  ): Promise<string> {
    const id = generateId();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO relationships (id, from_id, to_id, type, properties, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      fromId,
      toId,
      type,
      properties ? JSON.stringify(properties) : null,
      now,
      now
    );

    return id;
  }

  /**
   * Get a relationship by ID
   */
  async getRelationship(id: string): Promise<GraphRelationship | null> {
    const stmt = this.db.prepare('SELECT * FROM relationships WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) {
      return null;
    }

    return this.rowToRelationship(row);
  }

  /**
   * Update relationship properties
   */
  async updateRelationship(id: string, properties: Record<string, unknown>): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE relationships 
      SET properties = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(JSON.stringify(properties), Date.now(), id);
  }

  /**
   * Delete a relationship
   */
  async deleteRelationship(id: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM relationships WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Find relationships by type
   */
  async findRelationships(
    type: string,
    fromId?: string,
    toId?: string
  ): Promise<GraphRelationship[]> {
    let query = 'SELECT * FROM relationships WHERE type = ?';
    const params: any[] = [type];

    if (fromId) {
      query += ' AND from_id = ?';
      params.push(fromId);
    }

    if (toId) {
      query += ' AND to_id = ?';
      params.push(toId);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((row) => this.rowToRelationship(row));
  }

  /**
   * Execute a custom query (limited SQL support)
   */
  async query(query: string, params?: Record<string, unknown>): Promise<unknown[]> {
    const stmt = this.db.prepare(query);
    return stmt.all(params || {}) as unknown[];
  }

  /**
   * Find similar nodes based on properties
   */
  async findSimilar(nodeId: string, limit: number = 10): Promise<GraphNode[]> {
    const node = await this.getNode(nodeId);
    if (!node) {
      return [];
    }

    // Simple similarity: same type
    const nodes = await this.findNodes(node.type);
    return nodes.filter((n) => n.id !== nodeId).slice(0, limit);
  }

  /**
   * Get neighbors of a node up to a certain depth
   */
  async getNeighbors(
    nodeId: string,
    depth: number = 1,
    relationshipType?: string
  ): Promise<GraphNode[]> {
    const visited = new Set<string>();
    const neighbors: GraphNode[] = [];

    await this.traverseNeighbors(nodeId, depth, visited, neighbors, relationshipType);

    return neighbors;
  }

  /**
   * Traverse neighbors recursively
   */
  private async traverseNeighbors(
    nodeId: string,
    depth: number,
    visited: Set<string>,
    result: GraphNode[],
    relationshipType?: string
  ): Promise<void> {
    if (depth === 0 || visited.has(nodeId)) {
      return;
    }

    visited.add(nodeId);

    // Get outgoing relationships
    let query = 'SELECT * FROM relationships WHERE from_id = ?';
    const params: any[] = [nodeId];

    if (relationshipType) {
      query += ' AND type = ?';
      params.push(relationshipType);
    }

    const relationships = this.db.prepare(query).all(...params) as any[];

    for (const rel of relationships) {
      const neighborNode = await this.getNode(rel.to_id);
      if (neighborNode && !visited.has(neighborNode.id)) {
        result.push(neighborNode);
        await this.traverseNeighbors(
          neighborNode.id,
          depth - 1,
          visited,
          result,
          relationshipType
        );
      }
    }
  }

  /**
   * Get the full subgraph around a node
   */
  async getSubgraph(nodeId: string, depth: number = 1): Promise<GraphQueryResult> {
    const nodes: GraphNode[] = [];
    const relationships: GraphRelationship[] = [];
    const visited = new Set<string>();

    await this.traverseSubgraph(nodeId, depth, visited, nodes, relationships);

    return { nodes, relationships };
  }

  /**
   * Traverse subgraph recursively
   */
  private async traverseSubgraph(
    nodeId: string,
    depth: number,
    visited: Set<string>,
    nodes: GraphNode[],
    relationships: GraphRelationship[]
  ): Promise<void> {
    if (depth < 0 || visited.has(nodeId)) {
      return;
    }

    visited.add(nodeId);

    const node = await this.getNode(nodeId);
    if (node) {
      nodes.push(node);
    }

    if (depth === 0) {
      return;
    }

    // Get all relationships
    const rels = this.db
      .prepare('SELECT * FROM relationships WHERE from_id = ? OR to_id = ?')
      .all(nodeId, nodeId) as any[];

    for (const rel of rels) {
      const relationship = this.rowToRelationship(rel);
      relationships.push(relationship);

      const nextId = rel.from_id === nodeId ? rel.to_id : rel.from_id;
      await this.traverseSubgraph(nextId, depth - 1, visited, nodes, relationships);
    }
  }

  /**
   * Merge duplicate nodes
   */
  async mergeNodes(sourceId: string, targetId: string): Promise<void> {
    const source = await this.getNode(sourceId);
    const target = await this.getNode(targetId);

    if (!source || !target) {
      throw new Error('Source or target node not found');
    }

    // Merge properties
    const merged = { ...source.properties, ...target.properties };
    await this.updateNode(targetId, merged);

    // Update relationships to point to target
    this.db
      .prepare('UPDATE relationships SET from_id = ? WHERE from_id = ?')
      .run(targetId, sourceId);

    this.db
      .prepare('UPDATE relationships SET to_id = ? WHERE to_id = ?')
      .run(targetId, sourceId);

    // Delete source node
    await this.deleteNode(sourceId);
  }

  /**
   * Get graph statistics
   */
  async getStats(): Promise<GraphStats> {
    const nodeCount = this.db.prepare('SELECT COUNT(*) as count FROM nodes').get() as any;
    const relCount = this.db
      .prepare('SELECT COUNT(*) as count FROM relationships')
      .get() as any;

    const nodeTypes = this.db
      .prepare('SELECT type, COUNT(*) as count FROM nodes GROUP BY type')
      .all() as any[];

    const relTypes = this.db
      .prepare('SELECT type, COUNT(*) as count FROM relationships GROUP BY type')
      .all() as any[];

    return {
      nodeCount: nodeCount.count,
      relationshipCount: relCount.count,
      nodeTypes: Object.fromEntries(nodeTypes.map((t) => [t.type, t.count])),
      relationshipTypes: Object.fromEntries(relTypes.map((t) => [t.type, t.count])),
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Convert database row to GraphNode
   */
  private rowToNode(row: any): GraphNode {
    return {
      id: row.id,
      type: row.type,
      properties: JSON.parse(row.properties),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Convert database row to GraphRelationship
   */
  private rowToRelationship(row: any): GraphRelationship {
    return {
      id: row.id,
      fromId: row.from_id,
      toId: row.to_id,
      type: row.type,
      properties: row.properties ? JSON.parse(row.properties) : undefined,
      confidence: row.confidence,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Check if node properties match filter
   */
  private matchesProperties(
    nodeProps: Record<string, unknown>,
    filter: Record<string, unknown>
  ): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (nodeProps[key] !== value) {
        return false;
      }
    }
    return true;
  }
}
