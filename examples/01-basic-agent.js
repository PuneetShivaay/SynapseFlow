/**
 * Example 1: Basic Agent
 * 
 * A simple agent that can answer questions without tools
 */

import 'dotenv/config';
import { Agent, OpenAIProvider } from '../dist/index.js';

async function main() {
  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY not found in environment variables');
    console.log('Please create a .env file with your OpenAI API key');
    console.log('See .env.example for reference');
    process.exit(1);
  }

  console.log('🧠 SynapseFlow - Basic Agent Example\n');

  // Create OpenAI provider
  const provider = new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: 'gpt-4o-mini', // Fast and cost-effective
  });

  // Create agent
  const agent = new Agent(
    {
      name: 'helpful-assistant',
      instructions: 'You are a helpful AI assistant. Answer questions concisely and accurately.',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxIterations: 5,
    },
    provider
  );

  // Listen to events
  agent.on('agent:start', (event) => {
    console.log('🚀 Agent started');
    console.log(`📝 Input: ${event.input}\n`);
  });

  agent.on('llm:call:complete', (event) => {
    console.log('💭 LLM Response:');
    console.log(`   ${event.response}`);
    if (event.tokensUsed) {
      console.log(`   Tokens: ${event.tokensUsed}`);
    }
    console.log();
  });

  agent.on('agent:complete', (event) => {
    console.log('✅ Agent completed');
    console.log(`   Iterations: ${event.result.iterations}`);
    console.log(`   Duration: ${event.result.duration}ms`);
    if (event.result.cost) {
      console.log(`   Cost: $${event.result.cost.toFixed(6)}`);
    }
    console.log();
  });

  // Run agent
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const result = await agent.run('What is the capital of France?');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📤 Final Result:');
    console.log(`   ${result.output}\n`);

    if (result.success) {
      console.log('✨ Success!');
    } else {
      console.error('❌ Failed:', result.error?.message);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
