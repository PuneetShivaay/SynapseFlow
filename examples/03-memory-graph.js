/**
 * Example 3: Agent with Memory & Graph
 * 
 * Demonstrates persistent memory and knowledge graph
 */

import 'dotenv/config';
import {
  Agent,
  OpenAIProvider,
  InMemoryStore,
  SQLiteGraphStore,
  ContextRetriever,
} from '../dist/index.js';

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY not found');
    process.exit(1);
  }

  console.log('🧠 SynapseFlow - Memory & Graph Example\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Create storage
  const memoryStore = new InMemoryStore();
  const graphStore = new SQLiteGraphStore('./synapse flow.db');
  const contextRetriever = new ContextRetriever(graphStore);

  console.log('✅ Created in-memory store');
  console.log('✅ Created SQLite graph store (synapseflow.db)');
  console.log('✅ Created context retriever\n');

  // Create provider and agent
  const provider = new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: 'gpt-4o-mini',
  });

  const agent = new Agent(
    {
      name: 'knowledge-agent',
      instructions: `You are a helpful assistant with access to a knowledge graph.
You can remember information about people, projects, and relationships.
When given new information, acknowledge it and confirm you'll remember it.`,
      model: 'gpt-4o-mini',
      maxIterations: 5,
    },
    provider
  );

  // Session ID for this conversation
  const sessionId = 'demo-session-001';

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📝 Building Knowledge Graph\n');

  // Conversation 1: Learn about people and projects
  const conversations = [
    {
      input: 'Alice is working on the SynapseFlow project.',
      entities: [
        { type: 'person', name: 'Alice', properties: { role: 'developer' } },
        { type: 'project', name: 'SynapseFlow', properties: { status: 'active' } },
      ],
      relationships: [{ fromName: 'Alice', toName: 'SynapseFlow', type: 'WORKS_ON' }],
    },
    {
      input: 'Bob is the project manager for SynapseFlow.',
      entities: [
        { type: 'person', name: 'Bob', properties: { role: 'manager' } },
      ],
      relationships: [
        { fromName: 'Bob', toName: 'SynapseFlow', type: 'MANAGES' },
        { fromName: 'Bob', toName: 'Alice', type: 'MANAGES' },
      ],
    },
    {
      input: 'SynapseFlow uses TypeScript and OpenAI.',
      entities: [
        { type: 'technology', name: 'TypeScript', properties: {} },
        { type: 'technology', name: 'OpenAI', properties: {} },
      ],
      relationships: [
        { fromName: 'SynapseFlow', toName: 'TypeScript', type: 'USES' },
        { fromName: 'SynapseFlow', toName: 'OpenAI', type: 'USES' },
      ],
    },
  ];

  // Process each conversation and store in graph
  for (const conv of conversations) {
    console.log(`\n💬 User: ${conv.input}`);

    // Save to memory
    await memoryStore.saveMessage(sessionId, {
      role: 'user',
      content: conv.input,
      timestamp: Date.now(),
    });

    // Run agent
    const result = await agent.run(conv.input);

    // Save agent response
    await memoryStore.saveMessage(sessionId, {
      role: 'assistant',
      content: result.output,
      timestamp: Date.now(),
    });

    console.log(`🤖 Agent: ${result.output}`);

    // Store entities and relationships in graph
    await contextRetriever.storeEntities(conv.entities);
    await contextRetriever.storeRelationships(conv.relationships);

    console.log(`   📊 Stored ${conv.entities.length} entities, ${conv.relationships.length} relationships`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 Graph Statistics\n');

  const stats = await graphStore.getStats();
  console.log(`   Nodes: ${stats.nodeCount}`);
  console.log(`   Relationships: ${stats.relationshipCount}`);
  console.log(`   Node types:`, stats.nodeTypes);
  console.log(`   Relationship types:`, stats.relationshipTypes);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔍 Testing Knowledge Retrieval\n');

  // Test context retrieval
  const queries = [
    'Who works on SynapseFlow?',
    'What technologies does the project use?',
    'Who is Bob?',
  ];

  for (const query of queries) {
    console.log(`\n❓ Query: ${query}`);

    // Retrieve relevant context from graph
    const context = await contextRetriever.retrieveContext(query);

    console.log(`   📈 Relevance score: ${context.relevanceScore.toFixed(2)}`);
    console.log(`   📦 Retrieved ${context.nodes.length} nodes, ${context.relationships.length} relationships`);

    if (context.summary) {
      console.log(`\n   💡 Context:\n${context.summary.split('\n').map(l => '      ' + l).join('\n')}`);
    }

    // Get agent response with context
    const result = await agent.run(query);
    console.log(`\n   🤖 Answer: ${result.output}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📚 Memory Statistics\n');

  const history = await memoryStore.getHistory(sessionId);
  const metadata = await memoryStore.getSessionMetadata(sessionId);

  console.log(`   Messages in session: ${history.length}`);
  if (metadata) {
    console.log(`   Session created: ${new Date(metadata.createdAt).toLocaleString()}`);
    console.log(`   Last updated: ${new Date(metadata.updatedAt).toLocaleString()}`);
  }
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✨ Demo complete!\n');
  console.log('💾 Knowledge graph saved to: synapseflow.db');
  console.log('📊 You can query this database in future runs\n');

  // Close graph store
  graphStore.close();
}

main();
