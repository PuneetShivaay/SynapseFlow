/**
 * Example 2: Agent with Tools
 * 
 * An agent that can use tools to perform calculations and get weather
 */

import 'dotenv/config';
import { Agent, OpenAIProvider } from '../dist/index.js';
import { z } from 'zod';

async function main() {
  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY not found');
    process.exit(1);
  }

  console.log('🧠 SynapseFlow - Agent with Tools Example\n');

  // Define tools
  const calculatorTool = {
    name: 'calculator',
    description: 'Perform basic arithmetic operations (add, subtract, multiply, divide)',
    schema: z.object({
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
      a: z.number().describe('First number'),
      b: z.number().describe('Second number'),
    }),
    execute: async (input) => {
      console.log(`   🔧 Executing calculator: ${input.operation}(${input.a}, ${input.b})`);
      
      switch (input.operation) {
        case 'add':
          return input.a + input.b;
        case 'subtract':
          return input.a - input.b;
        case 'multiply':
          return input.a * input.b;
        case 'divide':
          if (input.b === 0) throw new Error('Division by zero');
          return input.a / input.b;
      }
    },
  };

  const weatherTool = {
    name: 'get_weather',
    description: 'Get current weather for a location',
    schema: z.object({
      location: z.string().describe('City name'),
      units: z.enum(['celsius', 'fahrenheit']).default('celsius'),
    }),
    execute: async (input) => {
      console.log(`   🔧 Getting weather for: ${input.location}`);
      
      // Simulated weather data
      const weatherData = {
        'new york': { temp: 22, condition: 'Partly cloudy' },
        'london': { temp: 15, condition: 'Rainy' },
        'tokyo': { temp: 28, condition: 'Sunny' },
        'paris': { temp: 18, condition: 'Clear' },
      };

      const location = input.location.toLowerCase();
      const data = weatherData[location] || { temp: 20, condition: 'Unknown' };

      return {
        location: input.location,
        temperature: data.temp,
        condition: data.condition,
        units: input.units,
      };
    },
  };

  // Create provider
  const provider = new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: 'gpt-4o-mini',
  });

  // Create agent with tools
  const agent = new Agent(
    {
      name: 'multi-tool-assistant',
      instructions: `You are a helpful assistant with access to tools.
Use the calculator for math operations and get_weather to check weather.
Always use the appropriate tool when the user asks for calculations or weather information.`,
      model: 'gpt-4o-mini',
      tools: [calculatorTool, weatherTool],
      maxIterations: 10,
    },
    provider
  );

  // Listen to events
  agent.on('tool:start', (event) => {
    console.log(`\n🔧 Tool: ${event.toolName}`);
  });

  agent.on('tool:complete', (event) => {
    console.log(`   ✅ Result: ${JSON.stringify(event.result)}`);
    console.log(`   Duration: ${event.duration}ms\n`);
  });

  agent.on('llm:call:complete', (event) => {
    if (event.tokensUsed) {
      console.log(`💭 LLM used ${event.tokensUsed} tokens`);
    }
  });

  // Test questions
  const questions = [
    'What is 573 multiplied by 284?',
    'What is the weather like in Tokyo?',
    'If I buy 5 items at $12.99 each, what is the total cost?',
  ];

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const question of questions) {
    console.log(`\n❓ Question: ${question}\n`);

    try {
      const result = await agent.run(question);

      console.log(`\n📤 Answer: ${result.output}`);
      console.log(`   Iterations: ${result.iterations}`);
      console.log(`   Tool calls: ${result.toolCalls.length}`);
      console.log(`   Duration: ${result.duration}ms`);

      if (result.cost) {
        console.log(`   Cost: $${result.cost.toFixed(6)}`);
      }

      console.log('\n' + '─'.repeat(50));
    } catch (error) {
      console.error('❌ Error:', error);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✨ All examples completed!\n');
}

main();
