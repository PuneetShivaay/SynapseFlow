/**
 * Example 05: Agent Handoffs
 * 
 * Demonstrates how to transfer conversations between specialized agents
 */

import 'dotenv/config';
import {
  Agent,
  OpenAIProvider,
  InMemoryStore,
  HandoffManager,
  EventEmitter,
} from '../dist/index.js';

// Check for API key
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY is required');
  process.exit(1);
}

async function main() {
  console.log('🚀 SynapseFlow - Agent Handoffs Demo\n');

  // Initialize storage
  const memoryStore = new InMemoryStore();

  // Initialize provider
  const provider = new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini',
  });

  // Create event emitter for observability
  const emitter = new EventEmitter();

  // Create handoff manager
  const handoffManager = new HandoffManager(emitter, memoryStore);

  // Create specialized agents
  const generalAgent = new Agent(
    {
      name: 'General Assistant',
      instructions: `You are a general-purpose assistant that can help with various tasks.
When you receive questions about:
- Technical programming topics → Hand off to "Technical Support"
- Customer service issues → Hand off to "Customer Service"
- Sales or pricing questions → Hand off to "Sales Agent"

Be friendly and explain why you're transferring them.`,
      model: 'gpt-4o-mini',
      memoryEnabled: true,
    },
    provider,
    emitter,
    memoryStore
  );

  const technicalAgent = new Agent(
    {
      name: 'Technical Support',
      instructions: `You are a specialized technical support agent with deep knowledge of:
- Programming languages (JavaScript, TypeScript, Python)
- Frameworks and libraries
- Debugging and troubleshooting
- Best practices and architecture

Provide detailed technical explanations and code examples when appropriate.`,
      model: 'gpt-4o-mini',
      memoryEnabled: true,
    },
    provider,
    emitter,
    memoryStore
  );

  const customerServiceAgent = new Agent(
    {
      name: 'Customer Service',
      instructions: `You are a friendly customer service agent focused on:
- Resolving customer complaints
- Processing refunds and returns
- Answering product questions
- Providing excellent service with empathy

Always be polite, understanding, and solution-oriented.`,
      model: 'gpt-4o-mini',
      memoryEnabled: true,
    },
    provider,
    emitter,
    memoryStore
  );

  const salesAgent = new Agent(
    {
      name: 'Sales Agent',
      instructions: `You are a knowledgeable sales agent who:
- Explains product features and benefits
- Provides pricing information
- Helps customers make informed decisions
- Closes deals professionally

Be persuasive but not pushy. Focus on customer needs.`,
      model: 'gpt-4o-mini',
      memoryEnabled: true,
    },
    provider,
    emitter,
    memoryStore
  );

  // Register all agents with handoff manager
  handoffManager.registerAgent('General Assistant', generalAgent);
  handoffManager.registerAgent('Technical Support', technicalAgent);
  handoffManager.registerAgent('Customer Service', customerServiceAgent);
  handoffManager.registerAgent('Sales Agent', salesAgent);

  console.log('✅ Registered agents:', handoffManager.getRegisteredAgents());
  console.log('');

  // Listen to handoff events
  emitter.on('handoff:start', (event) => {
    console.log(`\n🔄 HANDOFF: ${event.fromAgent} → ${event.toAgent}`);
    if (event.reason) {
      console.log(`   Reason: ${event.reason}`);
    }
  });

  emitter.on('handoff:complete', (event) => {
    console.log(`✅ HANDOFF COMPLETE: Session ${event.sessionId}`);
  });

  // Conversation 1: Technical Question (should trigger handoff)
  console.log('📋 Scenario 1: Technical Question\n');
  console.log('👤 User: How do I fix a memory leak in a React component?');

  let sessionId = 'session-tech';
  let result = await generalAgent.run(
    'How do I fix a memory leak in a React component?',
    { sessionId }
  );

  console.log(`🤖 ${generalAgent.config.name}: ${result.output}\n`);

  // Detect if handoff is suggested
  if (
    result.output.toLowerCase().includes('technical') ||
    result.output.toLowerCase().includes('transfer')
  ) {
    console.log('🔄 Initiating handoff to Technical Support...\n');

    const handoffResult = await handoffManager.executeHandoff(
      'General Assistant',
      {
        targetAgent: 'Technical Support',
        reason: 'User asked a technical programming question about React',
        preserveHistory: true,
        instructions: 'Help the user debug their React memory leak issue',
      },
      sessionId
    );

    if (handoffResult.success) {
      console.log(`✅ ${handoffResult.message}\n`);
      sessionId = handoffResult.sessionId;

      // Continue conversation with technical agent
      console.log('👤 User: Specifically, I have a setInterval in useEffect');
      result = await technicalAgent.run('Specifically, I have a setInterval in useEffect', {
        sessionId,
      });
      console.log(`🤖 ${technicalAgent.config.name}: ${result.output}\n`);
    }
  }

  // Conversation 2: Customer Service (should trigger handoff)
  console.log('\n' + '='.repeat(80) + '\n');
  console.log('📋 Scenario 2: Customer Complaint\n');
  console.log('👤 User: I received a damaged product and want a refund!');

  sessionId = 'session-cs';
  result = await generalAgent.run('I received a damaged product and want a refund!', {
    sessionId,
  });

  console.log(`🤖 ${generalAgent.config.name}: ${result.output}\n`);

  // Detect if handoff is suggested
  if (
    result.output.toLowerCase().includes('customer') ||
    result.output.toLowerCase().includes('service')
  ) {
    console.log('🔄 Initiating handoff to Customer Service...\n');

    const handoffResult = await handoffManager.executeHandoff(
      'General Assistant',
      {
        targetAgent: 'Customer Service',
        reason: 'Customer has a complaint about damaged product',
        preserveHistory: true,
        context: {
          issue: 'damaged_product',
          requestedAction: 'refund',
        },
      },
      sessionId
    );

    if (handoffResult.success) {
      console.log(`✅ ${handoffResult.message}\n`);
      sessionId = handoffResult.sessionId;

      // Continue with customer service
      console.log('👤 User: The item arrived broken in the box');
      result = await customerServiceAgent.run('The item arrived broken in the box', {
        sessionId,
      });
      console.log(`🤖 ${customerServiceAgent.config.name}: ${result.output}\n`);
    }
  }

  // Conversation 3: Sales Question (should trigger handoff)
  console.log('\n' + '='.repeat(80) + '\n');
  console.log('📋 Scenario 3: Pricing Question\n');
  console.log('👤 User: What are your enterprise pricing plans?');

  sessionId = 'session-sales';
  result = await generalAgent.run('What are your enterprise pricing plans?', { sessionId });

  console.log(`🤖 ${generalAgent.config.name}: ${result.output}\n`);

  // Detect if handoff is suggested
  if (
    result.output.toLowerCase().includes('sales') ||
    result.output.toLowerCase().includes('pricing')
  ) {
    console.log('🔄 Initiating handoff to Sales Agent...\n');

    const handoffResult = await handoffManager.executeHandoff(
      'General Assistant',
      {
        targetAgent: 'Sales Agent',
        reason: 'User inquiring about enterprise pricing',
        preserveHistory: true,
      },
      sessionId
    );

    if (handoffResult.success) {
      console.log(`✅ ${handoffResult.message}\n`);
      sessionId = handoffResult.sessionId;

      // Continue with sales
      console.log('👤 User: We have about 500 employees');
      result = await salesAgent.run('We have about 500 employees', { sessionId });
      console.log(`🤖 ${salesAgent.config.name}: ${result.output}\n`);
    }
  }

  console.log('\n✅ Demo complete!');
  console.log('\n💡 Key Takeaways:');
  console.log('   - Multiple specialized agents can work together');
  console.log('   - Handoffs preserve conversation context');
  console.log('   - Each agent has its own expertise area');
  console.log('   - Seamless transfers between agents');
  console.log('   - Full observability via events');

  process.exit(0);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
