/**
 * Example 07: Structured Output
 * 
 * Demonstrates type-safe structured responses from LLMs using Zod schemas
 */

import 'dotenv/config';
import { z } from 'zod';
import {
  OpenAIProvider,
  createStructuredOutput,
  CommonSchemas,
} from '../dist/index.js';

// Check for API key
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY is required');
  process.exit(1);
}

async function main() {
  console.log('🚀 SynapseFlow - Structured Output Demo\n');

  // Initialize provider
  const provider = new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o-mini',
  });

  // Create structured output generator
  const structuredOutput = createStructuredOutput(provider);

  // Example 1: Extract Contact Information
  console.log('📋 Example 1: Extract Contact Information\n');

  const contactSchema = z.object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
    company: z.string().optional(),
    role: z.string().optional(),
  });

  const contactText = `Hi, I'm Sarah Chen from TechCorp. You can reach me at sarah.chen@techcorp.com or call 555-0123. I'm the Senior Product Manager.`;

  console.log(`Input: ${contactText}\n`);

  const contact = await structuredOutput.generateWithRetry(
    contactSchema,
    `Extract contact information from this text: "${contactText}"`,
    'You are a contact information extraction system. Return structured JSON.'
  );

  console.log('Extracted Contact:');
  console.log(JSON.stringify(contact, null, 2));
  console.log('');

  // Example 2: Sentiment Analysis
  console.log('\n' + '='.repeat(80) + '\n');
  console.log('📋 Example 2: Sentiment Analysis\n');

  const reviewText = `I absolutely love this product! The build quality is excellent and it works exactly as advertised. However, the customer service was a bit slow to respond. Overall, I'm very satisfied with my purchase.`;

  console.log(`Review: ${reviewText}\n`);

  const sentiment = await structuredOutput.generateWithRetry(
    CommonSchemas.sentiment,
    `Analyze the sentiment of this review: "${reviewText}"`,
    'You are a sentiment analysis system. Analyze overall sentiment and individual aspects.'
  );

  console.log('Sentiment Analysis:');
  console.log(JSON.stringify(sentiment, null, 2));
  console.log('');

  // Example 3: Classification
  console.log('\n' + '='.repeat(80) + '\n');
  console.log('📋 Example 3: Classification\n');

  const supportTicket = `My laptop won't turn on after the latest software update. I've tried holding the power button but nothing happens. The screen stays black.`;

  console.log(`Support Ticket: ${supportTicket}\n`);

  const classification = await structuredOutput.generateWithRetry(
    CommonSchemas.classification,
    `Classify this support ticket: "${supportTicket}"`,
    'You are a support ticket classification system. Categorize tickets by type and urgency.'
  );

  console.log('Classification:');
  console.log(JSON.stringify(classification, null, 2));
  console.log('');

  // Example 4: Entity Extraction
  console.log('\n' + '='.repeat(80) + '\n');
  console.log('📋 Example 4: Entity Extraction\n');

  const articleText = `Apple announced the new iPhone 15 yesterday at their headquarters in Cupertino, California. CEO Tim Cook presented the device featuring an A17 chip and improved camera system. The phone will be available starting September 22nd at $999.`;

  console.log(`Article: ${articleText}\n`);

  const entities = await structuredOutput.generateWithRetry(
    CommonSchemas.extraction,
    `Extract all named entities from this text: "${articleText}"`,
    'You are an entity extraction system. Identify people, organizations, products, locations, and dates.'
  );

  console.log('Extracted Entities:');
  console.log(JSON.stringify(entities, null, 2));
  console.log('');

  // Example 5: Decision Making
  console.log('\n' + '='.repeat(80) + '\n');
  console.log('📋 Example 5: Decision Making\n');

  const decisionPrompt = `Should we launch the new feature now or wait until next quarter? 
Current considerations:
- Feature is 95% complete
- Minor bugs exist but not critical
- Competitor just launched similar feature
- Marketing team is ready
- Engineering team wants more testing time`;

  console.log(`Question: ${decisionPrompt}\n`);

  const decision = await structuredOutput.generateWithRetry(
    CommonSchemas.decision,
    decisionPrompt,
    'You are a business decision advisor. Analyze the situation and provide a clear yes/no decision with reasoning.'
  );

  console.log('Decision:');
  console.log(JSON.stringify(decision, null, 2));
  console.log('');

  // Example 6: Custom Schema - Product Review
  console.log('\n' + '='.repeat(80) + '\n');
  console.log('📋 Example 6: Custom Schema - Product Review Summary\n');

  const reviewSchema = z.object({
    overallRating: z.number().min(1).max(5),
    pros: z.array(z.string()),
    cons: z.array(z.string()),
    recommendation: z.enum(['highly_recommend', 'recommend', 'neutral', 'not_recommend']),
    targetAudience: z.string(),
    priceValue: z.enum(['excellent', 'good', 'fair', 'poor']),
  });

  const productReview = `I bought this laptop for programming and it's been fantastic! The keyboard is comfortable for long coding sessions, the screen is bright and clear, and the battery lasts all day. The build quality feels premium and solid. 

However, it's quite expensive at $2000, and the fan can get loud under heavy load. Also, the webcam quality is disappointing for video calls.

Overall, if you're a developer with the budget, this is a great choice. For casual users, there are better value options.`;

  console.log(`Review: ${productReview}\n`);

  const reviewSummary = await structuredOutput.generateWithRetry(
    reviewSchema,
    `Summarize this product review: "${productReview}"`,
    'You are a product review analyzer. Extract key insights and create a structured summary.'
  );

  console.log('Review Summary:');
  console.log(JSON.stringify(reviewSummary, null, 2));
  console.log('');

  // Example 7: Complex Nested Schema
  console.log('\n' + '='.repeat(80) + '\n');
  console.log('📋 Example 7: Complex Schema - Project Plan\n');

  const projectPlanSchema = z.object({
    projectName: z.string(),
    duration: z.object({
      weeks: z.number(),
      startDate: z.string(),
      endDate: z.string(),
    }),
    phases: z.array(
      z.object({
        name: z.string(),
        tasks: z.array(z.string()),
        duration: z.string(),
        dependencies: z.array(z.string()).optional(),
      })
    ),
    team: z.object({
      size: z.number(),
      roles: z.array(z.string()),
    }),
    risks: z.array(
      z.object({
        description: z.string(),
        severity: z.enum(['low', 'medium', 'high']),
        mitigation: z.string(),
      })
    ),
  });

  const projectRequest = `Create a project plan for building a mobile app with user authentication, profile management, and a social feed. We have 4 developers and want to launch in 3 months.`;

  console.log(`Request: ${projectRequest}\n`);

  const projectPlan = await structuredOutput.generateWithRetry(
    projectPlanSchema,
    projectRequest,
    'You are a project planning expert. Create detailed, realistic project plans with phases, tasks, and risk analysis.'
  );

  console.log('Project Plan:');
  console.log(JSON.stringify(projectPlan, null, 2));
  console.log('');

  console.log('\n✅ Demo complete!');
  console.log('\n💡 Key Takeaways:');
  console.log('   - Structured output ensures type-safe responses');
  console.log('   - Zod schemas provide runtime validation');
  console.log('   - Automatic retry on invalid responses');
  console.log('   - Works with any complexity of schema');
  console.log('   - Common schemas provided for typical use cases');
  console.log('   - Perfect for building reliable AI applications');

  process.exit(0);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
