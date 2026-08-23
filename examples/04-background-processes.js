/**
 * Example 04: Background Processes
 * 
 * Demonstrates the three autonomous background processes that maintain the knowledge graph:
 * 1. Memory Extractor - Extracts entities from conversations
 * 2. Relationship Builder - Discovers connections between entities
 * 3. Graph Curator - Maintains quality, merges duplicates, prunes stale data
 */

import 'dotenv/config';
import {
  Agent,
  OpenAIProvider,
  InMemoryStore,
  SQLiteGraphStore,
  ProcessManager,
  EventEmitter,
} from '../dist/index.js';

// Check for API key
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY is required');
  process.exit(1);
}

async function main() {
  console.log('🚀 SynapseFlow - Background Processes Demo\n');

  // Initialize storage
  const memoryStore = new InMemoryStore();
  const graphStore = new SQLiteGraphStore('./data/example04.db');

  // Initialize provider
  const provider = new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini',
  });

  // Create event emitter for observability
  const emitter = new EventEmitter();

  // Create agent
  const agent = new Agent(
    {
      name: 'BackgroundProcessAgent',
      instructions: `You are a helpful AI assistant with access to a knowledge graph.
When you learn new information about people, projects, or concepts, remember it.
Answer questions using your accumulated knowledge.`,
      model: 'gpt-4o-mini',
      memoryEnabled: true,
      graphEnabled: true,
    },
    provider,
    emitter,
    memoryStore,
    graphStore
  );

  // Create and start process manager
  console.log('🎯 Starting background processes...\n');
  const processManager = new ProcessManager(emitter, memoryStore, graphStore, provider, {
    enableMemoryExtractor: true,
    enableRelationshipBuilder: true,
    enableGraphCurator: true,
  });

  // Listen to process events
  emitter.on('process:started', (data) => {
    console.log(`✅ Process started: ${data.processName}`);
  });

  emitter.on('process:executed', (data) => {
    console.log(`⚙️  Process executed: ${data.processName} (${data.duration}ms)`);
  });

  emitter.on('process:error', (data) => {
    console.error(`❌ Process error: ${data.processName}`, data.error);
  });

  // Start all background processes
  processManager.start();

  console.log('\n📝 Having conversations to generate graph data...\n');

  // Have several conversations to generate data
  const conversations = [
    {
      session: 'session-1',
      messages: [
        'Hi! My name is Sarah Chen and I work at TechCorp as a senior software engineer.',
        'I am currently working on Project Phoenix, which is a new AI-powered customer service platform.',
        'The project uses TypeScript, React, and Node.js. We also leverage OpenAI APIs for natural language processing.',
      ],
    },
    {
      session: 'session-2',
      messages: [
        'Hello! I am Michael Rodriguez, a data scientist at DataFlow Inc.',
        'I collaborate with Sarah Chen on Project Phoenix. I handle the machine learning models.',
        'We use Python, TensorFlow, and PyTorch for our ML pipeline.',
      ],
    },
    {
      session: 'session-3',
      messages: [
        'My name is Emily Johnson. I manage Project Phoenix.',
        'The project is located in San Francisco and has a team of 15 people.',
        'We are aiming to launch in Q2 2024.',
      ],
    },
  ];

  // Run conversations
  for (const conv of conversations) {
    for (const message of conv.messages) {
      console.log(`\n👤 User (${conv.session}): ${message}`);

      const result = await agent.run(message, {
        sessionId: conv.session,
        includeGraphContext: true,
      });

      console.log(`🤖 Agent: ${result.output.substring(0, 100)}...`);

      // Small delay to let background processes run
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.log('\n\n⏳ Waiting for background processes to extract and analyze...');
  await new Promise((resolve) => setTimeout(resolve, 35000)); // Wait 35 seconds

  console.log('\n\n📊 Graph Statistics:');
  const stats = await graphStore.getStats();
  console.log(JSON.stringify(stats, null, 2));

  console.log('\n\n🔍 Querying extracted knowledge...\n');

  // Ask questions that require the extracted knowledge
  const questions = [
    'Who works at TechCorp?',
    'What technologies are used in Project Phoenix?',
    'Who manages Project Phoenix?',
    'Where is Project Phoenix located?',
  ];

  for (const question of questions) {
    console.log(`\n👤 User: ${question}`);

    const result = await agent.run(question, {
      sessionId: 'query-session',
      includeGraphContext: true,
    });

    console.log(`🤖 Agent: ${result.output}`);
  }

  console.log('\n\n📊 Process Statistics:');
  const processStats = processManager.getStats();
  console.log(JSON.stringify(processStats, null, 2));

  // Check specific relationships
  console.log('\n\n🔗 Sample Relationships:');
  const sarahNodes = await graphStore.findNodes('person', { name: 'Sarah Chen' });
  if (sarahNodes.length > 0) {
    const subgraph = await graphStore.getSubgraph(sarahNodes[0].id, 2);
    console.log(`\nSarah Chen's connections:`);
    console.log(`- Connected to ${subgraph.relationships.length} entities`);
    for (const rel of subgraph.relationships.slice(0, 5)) {
      const targetNode = subgraph.nodes.find((n) => n.id === rel.toId);
      console.log(
        `  - ${rel.type} → ${targetNode?.properties['name'] || 'Unknown'} (confidence: ${rel.confidence?.toFixed(2) || 'N/A'})`
      );
    }
  }

  // Stop processes
  console.log('\n\n🛑 Stopping background processes...');
  processManager.stop();

  console.log('\n✅ Demo complete!');
  console.log('\n💡 Key Takeaways:');
  console.log('   - Memory Extractor runs every 30s, extracting entities from conversations');
  console.log('   - Relationship Builder runs every 60s, discovering connections');
  console.log('   - Graph Curator runs every 2min, maintaining quality');
  console.log('   - All processes run autonomously in the background');
  console.log('   - The agent benefits from accumulated structured knowledge');

  process.exit(0);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
