/**
 * Relationship Builder Process
 * 
 * Analyzes nodes to discover and create meaningful relationships
 */

import { BackgroundProcess } from './base.js';
import { IGraphStore } from '../types/storage.js';
import { IModelProvider } from '../types/provider.js';
import { EventEmitter } from '../core/events.js';
import { z } from 'zod';

/**
 * Schema for relationship suggestions
 */
const RelationshipSuggestionSchema = z.object({
  relationships: z.array(
    z.object({
      fromId: z.string(),
      toId: z.string(),
      type: z.string(),
      reasoning: z.string(),
      confidence: z.number().min(0).max(1),
      properties: z.record(z.string(), z.unknown()).optional(),
    })
  ),
});

/**
 * Relationship Builder Process
 * 
 * Discovers implicit relationships between entities in the graph
 */
export class RelationshipBuilderProcess extends BackgroundProcess {
  name = 'relationship-builder';
  interval = 60000; // Run every 60 seconds

  private graphStore: IGraphStore;
  private provider: IModelProvider;
  private lastProcessedTime: number = 0;
  private processedPairs: Set<string> = new Set();

  constructor(emitter: EventEmitter, graphStore: IGraphStore, provider: IModelProvider) {
    super(emitter);
    this.graphStore = graphStore;
    this.provider = provider;
  }

  /**
   * Execute relationship building
   */
  protected async execute(): Promise<void> {
    // Get recent nodes (added or updated since last run)
    const recentNodes = await this.getRecentNodes();

    if (recentNodes.length === 0) {
      return;
    }

    console.log(`🔗 Building relationships for ${recentNodes.length} recent nodes`);

    // Process each recent node
    for (const node of recentNodes) {
      await this.findRelationshipsForNode(node);
    }

    // Update last processed time
    this.lastProcessedTime = Date.now();
  }

  /**
   * Get nodes that have been added or updated recently
   */
  private async getRecentNodes(): Promise<any[]> {
    // Get all nodes
    const types = ['person', 'place', 'organization', 'concept', 'project', 'technology', 'entity'];
    const recentNodes = [];

    for (const type of types) {
      const nodes = await this.graphStore.findNodes(type);
      const recent = nodes.filter((node) => {
        const lastSeen = (node.properties['lastSeen'] as number) || 0;
        return lastSeen > this.lastProcessedTime;
      });
      recentNodes.push(...recent);
    }

    return recentNodes;
  }

  /**
   * Find relationships for a specific node
   */
  private async findRelationshipsForNode(node: any): Promise<void> {
    // Get neighboring nodes (within 2 hops)
    const neighbors = await this.graphStore.getNeighbors(node.id, 2);

    if (neighbors.length === 0) {
      return;
    }

    // Get all nodes to consider for relationships
    const candidateNodes = await this.getCandidateNodes(node);

    if (candidateNodes.length === 0) {
      return;
    }

    // Use LLM to suggest relationships
    try {
      const suggestions = await this.suggestRelationships(node, candidateNodes);

      // Create suggested relationships
      for (const suggestion of suggestions.relationships) {
        await this.createRelationship(suggestion);
      }

      if (suggestions.relationships.length > 0) {
        console.log(`✅ Created ${suggestions.relationships.length} new relationships for ${node.properties['name']}`);
      }
    } catch (error) {
      console.error(`Error finding relationships for node ${node.id}:`, error);
    }
  }

  /**
   * Get candidate nodes for relationship building
   */
  private async getCandidateNodes(sourceNode: any): Promise<any[]> {
    // Get all nodes of different types
    const types = ['person', 'place', 'organization', 'concept', 'project', 'technology', 'entity'];
    const candidates = [];

    for (const type of types) {
      if (type === sourceNode.type) {
        // Skip same type for now to avoid too many connections
        continue;
      }

      const nodes = await this.graphStore.findNodes(type);
      // Limit to most relevant nodes (recently updated or high mention count)
      const relevant = nodes
        .filter((n) => n.id !== sourceNode.id)
        .sort((a, b) => {
          const aMentions = (a.properties['mentions'] as number) || 0;
          const bMentions = (b.properties['mentions'] as number) || 0;
          return bMentions - aMentions;
        })
        .slice(0, 10); // Take top 10

      candidates.push(...relevant);
    }

    return candidates;
  }

  /**
   * Use LLM to suggest relationships between nodes
   */
  private async suggestRelationships(
    sourceNode: any,
    candidateNodes: any[]
  ): Promise<z.infer<typeof RelationshipSuggestionSchema>> {
    const sourceInfo = this.formatNodeInfo(sourceNode);
    const candidatesInfo = candidateNodes.map((n) => this.formatNodeInfo(n)).join('\n');

    const prompt = `Analyze the following entity and suggest meaningful relationships with other entities.

Source Entity:
${sourceInfo}

Candidate Entities:
${candidatesInfo}

Suggest relationships between the source entity and candidates. Only suggest relationships that are:
1. Clearly implied by the available information
2. Semantically meaningful
3. Not redundant or trivial

Common relationship types:
- WORKS_ON: person works on project/technology
- MANAGES: person manages project/organization
- USES: project uses technology
- KNOWS: person knows person
- LOCATED_IN: entity located in place
- PART_OF: entity part of organization/project
- RELATED_TO: general meaningful connection
- COLLABORATES_WITH: entities work together
- DEPENDS_ON: entity depends on another

Return valid JSON with this exact structure:
{
  "relationships": [
    {
      "fromId": "${sourceNode.id}",
      "toId": "candidate_id",
      "type": "RELATIONSHIP_TYPE",
      "reasoning": "why this relationship makes sense",
      "confidence": 0.85,
      "properties": {}
    }
  ]
}

Only return valid JSON, no other text. Return empty array if no meaningful relationships found.`;

    const response = await this.provider.complete(
      [
        { role: 'system', content: 'You are a knowledge graph relationship analyzer. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      {
        temperature: 0.4,
        maxTokens: 1500,
      }
    );

    try {
      const json = JSON.parse(response.content);
      const validated = RelationshipSuggestionSchema.parse(json);
      return validated;
    } catch (error) {
      console.error('Failed to parse relationship suggestions:', response.content);
      return { relationships: [] };
    }
  }

  /**
   * Format node information for LLM
   */
  private formatNodeInfo(node: any): string {
    const name = node.properties['name'] || 'Unknown';
    const description = node.properties['description'] || 'No description';
    const mentions = node.properties['mentions'] || 0;

    return `ID: ${node.id}\nType: ${node.type}\nName: ${name}\nDescription: ${description}\nMentions: ${mentions}`;
  }

  /**
   * Create a relationship if it doesn't already exist
   */
  private async createRelationship(suggestion: any): Promise<void> {
    const pairKey = `${suggestion.fromId}-${suggestion.toId}-${suggestion.type}`;

    // Check if we've already processed this pair
    if (this.processedPairs.has(pairKey)) {
      return;
    }

    try {
      // Check if relationship already exists
      const existing = await this.graphStore.findRelationships(
        suggestion.type,
        suggestion.fromId,
        suggestion.toId
      );

      if (existing.length > 0) {
        // Update confidence if new confidence is higher
        const existingRel = existing[0];
        if (!existingRel) return;
        
        const currentConfidence = ((existingRel.properties || {})['confidence'] as number) || 0;
        if (suggestion.confidence > currentConfidence) {
          await this.graphStore.updateRelationship(existingRel.id, {
            confidence: suggestion.confidence,
            reasoning: suggestion.reasoning,
            updatedAt: Date.now(),
          });
        }
      } else {
        // Create new relationship
        await this.graphStore.addRelationship(suggestion.fromId, suggestion.toId, suggestion.type, {
          confidence: suggestion.confidence,
          reasoning: suggestion.reasoning,
          createdBy: 'relationship-builder',
          createdAt: Date.now(),
          ...suggestion.properties,
        });
      }

      // Mark as processed
      this.processedPairs.add(pairKey);
    } catch (error) {
      console.error(`Error creating relationship ${pairKey}:`, error);
    }
  }

  /**
   * Clear processed pairs cache periodically
   */
  public clearCache(): void {
    this.processedPairs.clear();
    console.log('🔄 Cleared relationship builder cache');
  }
}
