/**
 * Graph Curator Process
 * 
 * Maintains and improves graph quality through deduplication, pruning, and enrichment
 */

import { BackgroundProcess } from './base.js';
import { IGraphStore, GraphRelationship } from '../types/storage.js';
import { IModelProvider } from '../types/provider.js';
import { EventEmitter } from '../core/events.js';

/**
 * Graph Curator Process
 * 
 * Continuously improves graph quality
 */
export class GraphCuratorProcess extends BackgroundProcess {
  name = 'graph-curator';
  interval = 120000; // Run every 2 minutes

  private graphStore: IGraphStore;
  private provider: IModelProvider;

  constructor(emitter: EventEmitter, graphStore: IGraphStore, provider: IModelProvider) {
    super(emitter);
    this.graphStore = graphStore;
    this.provider = provider;
  }

  /**
   * Execute graph curation
   */
  protected async execute(): Promise<void> {
    console.log('🔧 Running graph curation...');

    // 1. Find and merge duplicate nodes
    await this.mergeDuplicates();

    // 2. Prune stale or low-value data
    await this.pruneLowValueNodes();

    // 3. Update relationship confidence scores
    await this.updateConfidenceScores();

    // 4. Remove redundant relationships
    await this.removeRedundantRelationships();

    console.log('✅ Graph curation complete');
  }

  /**
   * Find and merge duplicate nodes
   */
  private async mergeDuplicates(): Promise<void> {
    const types = ['person', 'place', 'organization', 'concept', 'project', 'technology'];

    for (const type of types) {
      const nodes = await this.graphStore.findNodes(type);

      // Group nodes by similarity
      const duplicateGroups = this.findDuplicateGroups(nodes);

      for (const group of duplicateGroups) {
        if (group.length < 2) continue;

        try {
          // Use LLM to confirm they are duplicates
          const shouldMerge = await this.confirmDuplicates(group);

          if (shouldMerge) {
            // Merge all nodes into the first one (primary)
            const primaryId = group[0]!.id;
            const duplicateIds = group.slice(1).map((n) => n.id);

            for (const dupId of duplicateIds) {
              await this.graphStore.mergeNodes(primaryId, dupId);
            }

            console.log(`🔀 Merged ${duplicateIds.length} duplicate ${type} nodes into ${primaryId}`);
          }
        } catch (error) {
          console.error(`Error merging duplicates:`, error);
        }
      }
    }
  }

  /**
   * Find groups of potentially duplicate nodes
   */
  private findDuplicateGroups(nodes: any[]): any[][] {
    const groups: any[][] = [];
    const processed = new Set<string>();

    for (const node of nodes) {
      if (processed.has(node.id)) continue;

      const group = [node];
      processed.add(node.id);

      const nodeName = ((node.properties || {})['name'] as string)?.toLowerCase() || '';

      // Find similar nodes
      for (const other of nodes) {
        if (processed.has(other.id)) continue;

        const otherName = ((other.properties || {})['name'] as string)?.toLowerCase() || '';

        // Check similarity
        if (this.areSimilar(nodeName, otherName)) {
          group.push(other);
          processed.add(other.id);
        }
      }

      if (group.length > 1) {
        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * Check if two strings are similar (fuzzy matching)
   */
  private areSimilar(str1: string, str2: string): boolean {
    if (str1 === str2) return true;

    // Levenshtein distance
    const distance = this.levenshteinDistance(str1, str2);
    const maxLen = Math.max(str1.length, str2.length);

    // Similar if distance is less than 20% of max length
    return distance / maxLen < 0.2;
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0]![j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2[i - 1] === str1[j - 1]) {
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j - 1]! + 1,
            matrix[i]![j - 1]! + 1,
            matrix[i - 1]![j]! + 1
          );
        }
      }
    }

    return matrix[str2.length]![str1.length]!;
  }

  /**
   * Use LLM to confirm if nodes are duplicates
   */
  private async confirmDuplicates(nodes: any[]): Promise<boolean> {
    const nodesInfo = nodes
      .map((n, idx) => {
        const name = (n.properties || {})['name'] || 'Unknown';
        const description = (n.properties || {})['description'] || 'No description';
        const mentions = (n.properties || {})['mentions'] || 0;
        return `${idx + 1}. Name: ${name}\n   Description: ${description}\n   Mentions: ${mentions}`;
      })
      .join('\n\n');

    const prompt = `Are these entities the same thing (duplicates that should be merged)?

${nodesInfo}

Answer with just "YES" or "NO".`;

    try {
      const response = await this.provider.complete(
        [
          { role: 'system', content: 'You are a duplicate detection system. Answer only YES or NO.' },
          { role: 'user', content: prompt },
        ],
        {
          temperature: 0.2,
          maxTokens: 10,
        }
      );

      return response.content.trim().toUpperCase() === 'YES';
    } catch (error) {
      console.error('Error confirming duplicates:', error);
      return false;
    }
  }

  /**
   * Prune low-value nodes
   */
  private async pruneLowValueNodes(): Promise<void> {
    const types = ['fact', 'entity', 'concept'];
    const cutoffTime = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago

    for (const type of types) {
      const nodes = await this.graphStore.findNodes(type);

      for (const node of nodes) {
        const lastSeen = ((node.properties || {})['lastSeen'] as number) || 0;
        const mentions = ((node.properties || {})['mentions'] as number) || 0;
        const confidence = ((node.properties || {})['confidence'] as number) || 1;

        // Prune if:
        // - Not seen in 30 days AND has low mentions
        // - Low confidence
        const shouldPrune =
          (lastSeen < cutoffTime && mentions < 2) || confidence < 0.3;

        if (shouldPrune) {
          try {
            await this.graphStore.deleteNode(node.id);
            console.log(`🗑️  Pruned low-value ${type} node: ${node.id}`);
          } catch (error) {
            console.error(`Error pruning node ${node.id}:`, error);
          }
        }
      }
    }
  }

  /**
   * Update confidence scores based on relationship count and recency
   */
  private async updateConfidenceScores(): Promise<void> {
    const types = ['person', 'place', 'organization', 'concept', 'project', 'technology'];

    for (const type of types) {
      const nodes = await this.graphStore.findNodes(type);

      for (const node of nodes) {
        try {
          // Get subgraph to count relationships
          const subgraph = await this.graphStore.getSubgraph(node.id, 1);

          // Calculate new confidence based on:
          // - Number of relationships
          // - Recency of updates
          // - Number of mentions
          const relationshipCount = subgraph.relationships.length;
          const mentions = ((node.properties || {})['mentions'] as number) || 0;
          const lastSeen = ((node.properties || {})['lastSeen'] as number) || 0;
          const daysSinceLastSeen = (Date.now() - lastSeen) / (24 * 60 * 60 * 1000);

          // Calculate confidence score (0-1)
          let confidence = 0.5; // Base confidence

          // Boost for relationships (up to 0.3)
          confidence += Math.min(relationshipCount * 0.05, 0.3);

          // Boost for mentions (up to 0.2)
          confidence += Math.min(mentions * 0.02, 0.2);

          // Reduce for staleness
          if (daysSinceLastSeen > 30) {
            confidence -= 0.1;
          }

          // Clamp to 0-1
          confidence = Math.max(0, Math.min(1, confidence));

          // Update node
          await this.graphStore.updateNode(node.id, { confidence });
        } catch (error) {
          console.error(`Error updating confidence for node ${node.id}:`, error);
        }
      }
    }
  }

  /**
   * Remove redundant relationships
   */
  private async removeRedundantRelationships(): Promise<void> {
    // Get all relationship types to check
    const relationshipTypes = [
      'WORKS_ON',
      'MANAGES',
      'USES',
      'KNOWS',
      'LOCATED_IN',
      'PART_OF',
      'RELATED_TO',
      'COLLABORATES_WITH',
      'DEPENDS_ON',
    ];

    // Track relationships we've seen
    const seen = new Map<string, GraphRelationship>();

    for (const relType of relationshipTypes) {
      const relationships = await this.graphStore.findRelationships(relType);

      for (const rel of relationships) {
        const key = `${rel.fromId}-${rel.toId}-${rel.type}`;

        if (seen.has(key)) {
          // This is a duplicate - delete the one with lower confidence
          const existing = seen.get(key)!;
          const existingConfidence = ((existing.properties || {})['confidence'] as number) || 0.5;
          const currentConfidence = ((rel.properties || {})['confidence'] as number) || 0.5;

          if (currentConfidence < existingConfidence) {
            // Delete current
            try {
              await this.graphStore.deleteRelationship(rel.id);
              console.log(`🗑️  Removed redundant relationship: ${key}`);
            } catch (error) {
              console.error(`Error deleting relationship ${rel.id}:`, error);
            }
          } else {
            // Delete existing and replace with current
            try {
              await this.graphStore.deleteRelationship(existing.id);
              seen.set(key, rel);
              console.log(`🗑️  Removed redundant relationship: ${key}`);
            } catch (error) {
              console.error(`Error deleting relationship ${existing.id}:`, error);
            }
          }
        } else {
          seen.set(key, rel);
        }
      }
    }
  }
}
