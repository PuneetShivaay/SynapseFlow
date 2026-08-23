/**
 * Example 06: Guardrails
 * 
 * Demonstrates input/output validation to ensure safe agent behavior
 */

import 'dotenv/config';
import {
  Agent,
  OpenAIProvider,
  GuardrailManager,
  GuardrailRules,
  EventEmitter,
} from '../dist/index.js';

// Check for API key
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY is required');
  process.exit(1);
}

async function main() {
  console.log('🚀 SynapseFlow - Guardrails Demo\n');

  // Initialize provider
  const provider = new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini',
  });

  // Create event emitter
  const emitter = new EventEmitter();

  // Create guardrail manager
  const guardrailManager = new GuardrailManager(emitter);

  // Add various guardrail rules
  console.log('📋 Setting up guardrail rules...\n');

  // 1. PII Detection (critical)
  guardrailManager.addRule(GuardrailRules.piiDetection());
  console.log('✅ PII Detection - Blocks emails, phone numbers, SSN, credit cards');

  // 2. Length limits
  guardrailManager.addRule(GuardrailRules.lengthLimit(1000, 10));
  console.log('✅ Length Limit - Min 10, Max 1000 characters');

  // 3. Topic restrictions
  guardrailManager.addRule(
    GuardrailRules.topicRestriction(['illegal', 'drugs', 'weapons', 'violence'])
  );
  console.log('✅ Topic Restriction - Blocks forbidden topics');

  // 4. Pattern matching (example: no URLs)
  guardrailManager.addRule(
    GuardrailRules.patternMatch(
      /https?:\/\/[^\s]+/gi,
      'URLs are not allowed in input',
      'medium'
    )
  );
  console.log('✅ Pattern Match - Blocks URLs');

  console.log('');

  // Listen to guardrail events
  emitter.on('guardrail:triggered', (event) => {
    console.log(`\n⚠️  GUARDRAIL TRIGGERED: ${event.ruleName}`);
    console.log(`   Severity: ${event.severity}`);
    if (event.message) {
      console.log(`   Message: ${event.message}`);
    }
  });

  // Create agent (we'll manually validate its input/output)
  const agent = new Agent(
    {
      name: 'GuardedAgent',
      instructions: 'You are a helpful assistant that follows strict safety guidelines.',
      model: 'gpt-4o-mini',
    },
    provider,
    emitter
  );

  // Test 1: Valid Input
  console.log('📋 Test 1: Valid Input\n');
  const input1 = 'What is the capital of France?';
  console.log(`👤 User: ${input1}`);

  let validation = await guardrailManager.validateInput(input1);
  if (validation.passed) {
    console.log('✅ Input validation passed\n');

    const result = await agent.run(input1);
    console.log(`🤖 Agent: ${result.output}\n`);

    // Validate output
    validation = await guardrailManager.validateOutput(result.output);
    if (validation.passed) {
      console.log('✅ Output validation passed\n');
    } else {
      console.log(`❌ Output blocked: ${validation.blockedBy?.message}\n`);
    }
  } else {
    console.log(`❌ Input blocked: ${validation.blockedBy?.message}\n`);
  }

  // Test 2: Input with PII (should be blocked)
  console.log('\n' + '='.repeat(80) + '\n');
  console.log('📋 Test 2: Input with PII (Should Block)\n');
  const input2 = 'My email is john.doe@example.com and my phone is 555-123-4567';
  console.log(`👤 User: ${input2}`);

  validation = await guardrailManager.validateInput(input2);
  if (!validation.passed) {
    console.log(`❌ INPUT BLOCKED: ${validation.blockedBy?.message}`);
    console.log(`   Rule: ${validation.blockedBy?.ruleName}`);
    console.log(`   Severity: ${validation.blockedBy?.severity}\n`);
  } else {
    console.log('✅ Input validation passed (unexpected!)\n');
  }

  // Test 3: Input with URL (should be blocked)
  console.log('\n' + '='.repeat(80) + '\n');
  console.log('📋 Test 3: Input with URL (Should Block)\n');
  const input3 = 'Check out this website: https://example.com/malicious';
  console.log(`👤 User: ${input3}`);

  validation = await guardrailManager.validateInput(input3);
  if (!validation.passed) {
    console.log(`❌ INPUT BLOCKED: ${validation.blockedBy?.message}`);
    console.log(`   Rule: ${validation.blockedBy?.ruleName}`);
    console.log(`   Severity: ${validation.blockedBy?.severity}\n`);
  } else {
    console.log('✅ Input validation passed (unexpected!)\n');
  }

  // Test 4: Input with restricted topic (should be blocked)
  console.log('\n' + '='.repeat(80) + '\n');
  console.log('📋 Test 4: Restricted Topic (Should Block)\n');
  const input4 = 'Tell me about illegal drugs and how to make weapons';
  console.log(`👤 User: ${input4}`);

  validation = await guardrailManager.validateInput(input4);
  if (!validation.passed) {
    console.log(`❌ INPUT BLOCKED: ${validation.blockedBy?.message}`);
    console.log(`   Rule: ${validation.blockedBy?.ruleName}`);
    console.log(`   Severity: ${validation.blockedBy?.severity}\n`);
  } else {
    console.log('✅ Input validation passed (unexpected!)\n');
  }

  // Test 5: Input too short (should be blocked)
  console.log('\n' + '='.repeat(80) + '\n');
  console.log('📋 Test 5: Input Too Short (Should Block)\n');
  const input5 = 'Hi';
  console.log(`👤 User: ${input5}`);

  validation = await guardrailManager.validateInput(input5);
  if (!validation.passed) {
    console.log(`❌ INPUT BLOCKED: ${validation.blockedBy?.message}`);
    console.log(`   Rule: ${validation.blockedBy?.ruleName}`);
    console.log(`   Severity: ${validation.blockedBy?.severity}\n`);
  } else {
    console.log('✅ Input validation passed (unexpected!)\n');
  }

  // Test 6: LLM-based moderation
  console.log('\n' + '='.repeat(80) + '\n');
  console.log('📋 Test 6: LLM-Based Moderation\n');

  // Add LLM moderation rule
  guardrailManager.addRule(GuardrailRules.llmModeration(provider));
  console.log('✅ Added LLM-based content moderation\n');

  const input6 = 'How do I create a bomb?';
  console.log(`👤 User: ${input6}`);

  validation = await guardrailManager.validateInput(input6);
  if (!validation.passed) {
    console.log(`❌ INPUT BLOCKED: ${validation.blockedBy?.message}`);
    console.log(`   Rule: ${validation.blockedBy?.ruleName}`);
    console.log(`   Severity: ${validation.blockedBy?.severity}`);
    if (validation.blockedBy?.metadata?.categories) {
      console.log(`   Categories: ${validation.blockedBy.metadata.categories}\n`);
    }
  } else {
    console.log('⚠️  Input passed (LLM may have flagged incorrectly)\n');
  }

  // Test 7: Custom guardrail
  console.log('\n' + '='.repeat(80) + '\n');
  console.log('📋 Test 7: Custom Guardrail Rule\n');

  // Add custom rule - no questions about competitors
  guardrailManager.addRule({
    name: 'no-competitor-questions',
    type: 'input',
    enabled: true,
    severity: 'medium',
    validate: (content) => {
      const competitors = ['CompetitorA', 'CompetitorB', 'CompetitorC'];
      const lowerContent = content.toLowerCase();

      for (const competitor of competitors) {
        if (lowerContent.includes(competitor.toLowerCase())) {
          return {
            passed: false,
            ruleName: 'no-competitor-questions',
            message: `Questions about ${competitor} are not allowed`,
            severity: 'medium',
          };
        }
      }

      return {
        passed: true,
        ruleName: 'no-competitor-questions',
        severity: 'medium',
      };
    },
  });

  const input7 = 'How does your product compare to CompetitorA?';
  console.log(`👤 User: ${input7}`);

  validation = await guardrailManager.validateInput(input7);
  if (!validation.passed) {
    console.log(`❌ INPUT BLOCKED: ${validation.blockedBy?.message}`);
    console.log(`   Rule: ${validation.blockedBy?.ruleName}`);
    console.log(`   Severity: ${validation.blockedBy?.severity}\n`);
  } else {
    console.log('✅ Input validation passed\n');
  }

  // Show all active rules
  console.log('\n' + '='.repeat(80) + '\n');
  console.log('📊 Active Guardrail Rules:\n');
  const rules = guardrailManager.getRules();
  rules.forEach((rule, index) => {
    console.log(
      `${index + 1}. ${rule.name} (${rule.type}) - Severity: ${rule.severity} - Enabled: ${rule.enabled}`
    );
  });

  console.log('\n✅ Demo complete!');
  console.log('\n💡 Key Takeaways:');
  console.log('   - Guardrails protect both input and output');
  console.log('   - Multiple validation rules can be combined');
  console.log('   - Critical violations block immediately');
  console.log('   - LLM-based moderation for complex cases');
  console.log('   - Custom rules for business-specific needs');
  console.log('   - Full observability via events');

  process.exit(0);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
