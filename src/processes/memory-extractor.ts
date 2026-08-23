/**
 * Memory Extractor Process
 * 
 * Continuously extracts entities, facts, and relationships from conversations
 */

import { BackgroundProcess } from './base.js';
import { IMemoryStore, IGraphStore } from '../types/storage.js';
import { IModelProvider } from '../types/provider.js';
import { z } from 'zod';
import { EventEmitter } from '../core/events.js';

/**
 * Schema for extracted information
 */
const ExtractionSchema = z.object({
  entities: z.array(
    z.object({
      type: z.string(),
      name: z.string(),
      description: z.string().optional(),
      properties: z.record(z.string(), z.unknown()).optional(),
    })
  ),
  facts: z.array(
    z.object({
      statement: z.string(),
      confidence: z.number().min(0).max(1),
      subject: z.string().optional(),
      predicate: z.string().optional(),
      object: z.string().optional(),
    })
  ),
  relationships: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      type: z.string(),
      properties: z.record(z.string(), z.unknown()).optional(),
    })
  ),
});

/**
 * Memory Extractor Process
 * 
 * Extracts structured information from conversations and stores in graph
 */
export class MemoryExtractorProcess extends BackgroundProcess {
  name = 'memory-extractor';
  interval = 30000; // Run every 30 seconds

  private memoryStore: IMemoryStore;
  private graphStore: IGraphStore;
  private provider: IModelProvider;
  private lastProcessedMessageCount: Map<string, number> = new Map();

  constructor(
    emitter: EventEmitter,
    memoryStore: IMemoryStore,
    graphStore: IGraphStore,
    provider: IModelProvider
  ) {
    super(emitter);
    this.memoryStore = memoryStore;
    this.graphStore = graphStore;
    this.provider = provider;
  }

  /**
   * Execute memory extraction
   */
  protected async execute(): Promise<void> {
    // Get all sessions
    const sessions = await this.memoryStore.listSessions();

    if (sessions.length === 0) {
      return;
    }

    // Process each session
    for (const sessionId of sessions) {
      await this.processSession(sessionId);
    }
  }

  /**
   * Process a single session
   */
  private async processSession(sessionId: string): Promise<void> {
    // Get conversation history
    const history = await this.memoryStore.getHistory(sessionId);

    // Check if we've already processed this session
    const lastProcessedCount = this.lastProcessedMessageCount.get(sessionId) || 0;
    if (history.length <= lastProcessedCount) {
      return; // No new messages
    }

    // Get only new messages
    const newMessages = history.slice(lastProcessedCount);
    if (newMessages.length === 0) {
      return;
    }

    // Format messages for extraction
    const conversationText = newMessages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    console.log(`📝 Extracting memory from session ${sessionId} (${newMessages.length} new messages)`);

    try {
      // Call LLM to extract information
      const extraction = await this.extractInformation(conversationText);

      // Store entities in graph
      for (const entity of extraction.entities) {
        try {
          // Check if entity already exists
          const existing = await this.graphStore.findNodes(entity.type, {
            name: entity.name,
          });

          if (existing.length > 0) {
            // Update existing entity
            const nodeId = existing[0]!.id;
            await this.graphStore.updateNode(nodeId, {
              ...entity.properties,
              description: entity.description,
              lastSeen: Date.now(),
              mentions: (existing[0]!.properties['mentions'] as number || 0) + 1,
            });
          } else {
            // Create new entity
            await this.graphStore.addNode(entity.type, {
              name: entity.name,
              description: entity.description,
              ...entity.properties,
              firstSeen: Date.now(),
              lastSeen: Date.now(),
              mentions: 1,
              source: sessionId,
            });
          }
        } catch (error) {
          console.error(`Error storing entity ${entity.name}:`, error);
        }
      }

      // Store relationships
      for (const rel of extraction.relationships) {
        try {
          // Find the nodes
          const fromNodes = await this.findNodeByName(rel.from);
          const toNodes = await this.findNodeByName(rel.to);

          if (fromNodes.length > 0 && toNodes.length > 0) {
            const fromId = fromNodes[0]!.id;
            const toId = toNodes[0]!.id;

            // Check if relationship already exists
            const existing = await this.graphStore.findRelationships(rel.type, fromId, toId);

            if (existing.length === 0) {
              await this.graphStore.addRelationship(fromId, toId, rel.type, {
                ...rel.properties,
                source: sessionId,
                confidence: 0.8,
              });
            }
          }
        } catch (error) {
          console.error(`Error storing relationship ${rel.from} -> ${rel.to}:`, error);
        }
      }

      // Store facts as special nodes
      for (const fact of extraction.facts) {
        try {
          await this.graphStore.addNode('fact', {
            statement: fact.statement,
            confidence: fact.confidence,
            subject: fact.subject,
            predicate: fact.predicate,
            object: fact.object,
            source: sessionId,
            extractedAt: Date.now(),
          });
        } catch (error) {
          console.error(`Error storing fact:`, error);
        }
      }

      console.log(
        `✅ Extracted: ${extraction.entities.length} entities, ` +
          `${extraction.relationships.length} relationships, ` +
          `${extraction.facts.length} facts`
      );

      // Update processed count
      this.lastProcessedMessageCount.set(sessionId, history.length);
    } catch (error) {
      console.error(`Error extracting from session ${sessionId}:`, error);
    }
  }

  /**
   * Extract information using LLM
   */
  private async extractInformation(conversationText: string): Promise<{
    entities: any[];
    facts: any[];
    relationships: any[];
  }> {
    const prompt = `Analyze the following conversation and extract structured information.

Conversation:
${conversationText}

Extract:
1. **Entities**: People, places, organizations, concepts, projects, technologies
2. **Facts**: Key statements and information
3. **Relationships**: Connections between entities

Return valid JSON with this exact structure:
{
  "entities": [
    {
      "type": "person|place|organization|concept|project|technology",
      "name": "entity name",
      "description": "brief description",
      "properties": {}
    }
  ],
  "facts": [
    {
      "statement": "the fact",
      "confidence": 0.9,
      "subject": "who/what",
      "predicate": "relationship",
      "object": "to whom/what"
    }
  ],
  "relationships": [
    {
      "from": "entity name",
      "to": "entity name",
      "type": "WORKS_ON|MANAGES|USES|KNOWS|LOCATED_IN|PART_OF",
      "properties": {}
    }
  ]
}

Only return valid JSON, no other text.`;

    const response = await this.provider.complete(
      [
        { role: 'system', content: 'You are a knowledge extraction system. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      {
        temperature: 0.3,
        maxTokens: 2000,
      }
    );

    // Parse and validate response
    try {
      const json = JSON.parse(response.content);
      const validated = ExtractionSchema.parse(json);
      return validated;
    } catch (error) {
      console.error('Failed to parse extraction response:', response.content);
      return { entities: [], facts: [], relationships: [] };
    }
  }

  /**
   * Find node by name across all types
   */
  private async findNodeByName(name: string): Promise<any[]> {
    const types = ['person', 'place', 'organization', 'concept', 'project', 'technology', 'entity'];
    const nodes = [];

    for (const type of types) {
      const typeNodes = await this.graphStore.findNodes(type);
      const matched = typeNodes.filter((node) => {
        const nodeName = (node.properties['name'] as string)?.toLowerCase() || '';
        return nodeName === name.toLowerCase();
      });
      nodes.push(...matched);
    }

    return nodes;
  }
}
