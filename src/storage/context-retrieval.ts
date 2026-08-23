/**
 * Context retrieval from graph database
 * 
 * Extracts relevant context from the knowledge graph for agent prompts
 */

import { IGraphStore, GraphContext } from '../types/storage.js';
import { truncate } from '../core/utils.js';

/**
 * Context retriever for graph-based memory
 * 
 * Retrieves relevant context from knowledge graph to enhance agent prompts
 */
export class ContextRetriever {
  private graph: IGraphStore;

  constructor(graph: IGraphStore) {
    this.graph = graph;
  }

  /**
   * Retrieve relevant context from graph based on user input
   * 
   * @param input - User input message
   * @param maxNodes - Maximum nodes to retrieve
   * @returns Graph context with nodes, relationships, and summary
   */
  async retrieveContext(input: string, maxNodes: number = 5): Promise<GraphContext> {
    // Extract potential entity names from input (simple approach)
    const entities = this.extractEntities(input);

    if (entities.length === 0) {
      return {
        nodes: [],
        relationships: [],
        relevanceScore: 0,
        summary: '',
      };
    }

    // Find matching nodes
    const matchedNodes = [];
    for (const entity of entities) {
      const nodes = await this.findNodesByName(entity);
      matchedNodes.push(...nodes);
    }

    if (matchedNodes.length === 0) {
      return {
        nodes: [],
        relationships: [],
        relevanceScore: 0,
        summary: '',
      };
    }

    // Get relationships for matched nodes
    const relationships = [];
    for (const node of matchedNodes.slice(0, maxNodes)) {
      const subgraph = await this.graph.getSubgraph(node.id, 1);
      relationships.push(...subgraph.relationships);
    }

    // Calculate relevance score
    const relevanceScore = this.calculateRelevance(matchedNodes.length, relationships.length);

    // Generate summary
    const summary = this.generateSummary(matchedNodes.slice(0, maxNodes), relationships);

    return {
      nodes: matchedNodes.slice(0, maxNodes),
      relationships: relationships.slice(0, maxNodes * 2),
      relevanceScore,
      summary,
    };
  }

  /**
   * Extract potential entity names from text
   * Simple approach: capitalized words and quoted text
   */
  private extractEntities(text: string): string[] {
    const entities: string[] = [];

    // Extract quoted strings
    const quoted = text.match(/"([^"]+)"/g);
    if (quoted) {
      entities.push(...quoted.map((q) => q.replace(/"/g, '')));
    }

    // Extract capitalized words (potential names)
    const words = text.split(/\s+/);
    for (const word of words) {
      if (word.length > 2 && /^[A-Z]/.test(word)) {
        entities.push(word.toLowerCase());
      }
    }

    return [...new Set(entities)];
  }

  /**
   * Find nodes by name in properties
   */
  private async findNodesByName(name: string): Promise<any[]> {
    const types = ['entity', 'person', 'place', 'concept', 'project'];
    const nodes = [];

    for (const type of types) {
      const typeNodes = await this.graph.findNodes(type);
      const matched = typeNodes.filter((node) => {
        const nodeName = (node.properties['name'] as string)?.toLowerCase() || '';
        return nodeName.includes(name.toLowerCase());
      });
      nodes.push(...matched);
    }

    return nodes;
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevance(nodeCount: number, relationshipCount: number): number {
    // Simple scoring: more nodes and relationships = higher relevance
    const nodeScore = Math.min(nodeCount / 5, 1) * 0.6;
    const relScore = Math.min(relationshipCount / 10, 1) * 0.4;
    return nodeScore + relScore;
  }

  /**
   * Generate a text summary of the context
   */
  private generateSummary(nodes: any[], relationships: any[]): string {
    if (nodes.length === 0) {
      return '';
    }

    let summary = 'Relevant knowledge from memory:\n\n';

    // Summarize nodes
    for (const node of nodes.slice(0, 3)) {
      const name = node.properties['name'] || node.properties['title'] || 'Unknown';
      const description = node.properties['description'] || '';
      summary += `- ${name} (${node.type})`;
      if (description) {
        summary += `: ${truncate(String(description), 100)}`;
      }
      summary += '\n';
    }

    // Summarize key relationships
    if (relationships.length > 0) {
      summary += '\nRelationships:\n';
      for (const rel of relationships.slice(0, 3)) {
        summary += `- ${rel.type}\n`;
      }
    }

    return summary;
  }

  /**
   * Store entities from conversation to graph
   */
  async storeEntities(
    entities: Array<{ type: string; name: string; properties?: Record<string, unknown> }>
  ): Promise<string[]> {
    const nodeIds: string[] = [];

    for (const entity of entities) {
      const existingNodes = await this.graph.findNodes(entity.type, { name: entity.name });

      if (existingNodes.length > 0) {
        // Update existing node
        const nodeId = existingNodes[0]!.id;
        if (entity.properties) {
          await this.graph.updateNode(nodeId, entity.properties);
        }
        nodeIds.push(nodeId);
      } else {
        // Create new node
        const nodeId = await this.graph.addNode(entity.type, {
          name: entity.name,
          ...entity.properties,
        });
        nodeIds.push(nodeId);
      }
    }

    return nodeIds;
  }

  /**
   * Store relationships between entities
   */
  async storeRelationships(
    relationships: Array<{ fromName: string; toName: string; type: string }>
  ): Promise<void> {
    for (const rel of relationships) {
      // Find nodes by name
      const fromNodes = await this.findNodesByName(rel.fromName);
      const toNodes = await this.findNodesByName(rel.toName);

      if (fromNodes.length > 0 && toNodes.length > 0) {
        const fromId = fromNodes[0]!.id;
        const toId = toNodes[0]!.id;

        // Check if relationship already exists
        const existing = await this.graph.findRelationships(rel.type, fromId, toId);

        if (existing.length === 0) {
          await this.graph.addRelationship(fromId, toId, rel.type);
        }
      }
    }
  }
}
