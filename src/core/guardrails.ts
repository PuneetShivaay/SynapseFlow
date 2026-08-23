/**
 * Guardrails System
 * 
 * Input and output validation to ensure safe and appropriate agent behavior
 */

import { EventEmitter } from './events.js';
import { IModelProvider } from '../types/provider.js';

/**
 * Guardrail rule types
 */
export type GuardrailType = 'input' | 'output' | 'both';

/**
 * Guardrail validation result
 */
export interface GuardrailResult {
  passed: boolean;
  ruleName: string;
  message?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
}

/**
 * Guardrail rule configuration
 */
export interface GuardrailRule {
  name: string;
  type: GuardrailType;
  enabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  validate: (content: string) => Promise<GuardrailResult> | GuardrailResult;
}

/**
 * Built-in guardrail rules
 */
export class GuardrailRules {
  /**
   * Check for profanity or inappropriate language
   */
  static profanityFilter(blacklist?: string[]): GuardrailRule {
    const defaultBlacklist = [
      // Add actual profanity list in production
      'badword1',
      'badword2',
    ];

    const words = blacklist || defaultBlacklist;

    return {
      name: 'profanity-filter',
      type: 'both',
      enabled: true,
      severity: 'high',
      validate: (content: string) => {
        const lowerContent = content.toLowerCase();
        const found = words.filter((word) => lowerContent.includes(word.toLowerCase()));

        if (found.length > 0) {
          return {
            passed: false,
            ruleName: 'profanity-filter',
            message: `Content contains inappropriate language: ${found.join(', ')}`,
            severity: 'high',
            metadata: { foundWords: found },
          };
        }

        return {
          passed: true,
          ruleName: 'profanity-filter',
          severity: 'high',
        };
      },
    };
  }

  /**
   * Check for PII (emails, phone numbers, SSN)
   */
  static piiDetection(): GuardrailRule {
    const patterns = {
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
      creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    };

    return {
      name: 'pii-detection',
      type: 'both',
      enabled: true,
      severity: 'critical',
      validate: (content: string) => {
        const detected: string[] = [];

        for (const [type, pattern] of Object.entries(patterns)) {
          if (pattern.test(content)) {
            detected.push(type);
          }
        }

        if (detected.length > 0) {
          return {
            passed: false,
            ruleName: 'pii-detection',
            message: `Content contains PII: ${detected.join(', ')}`,
            severity: 'critical',
            metadata: { detectedTypes: detected },
          };
        }

        return {
          passed: true,
          ruleName: 'pii-detection',
          severity: 'critical',
        };
      },
    };
  }

  /**
   * Check content length limits
   */
  static lengthLimit(maxLength: number, minLength: number = 0): GuardrailRule {
    return {
      name: 'length-limit',
      type: 'both',
      enabled: true,
      severity: 'medium',
      validate: (content: string) => {
        if (content.length > maxLength) {
          return {
            passed: false,
            ruleName: 'length-limit',
            message: `Content exceeds maximum length of ${maxLength} characters`,
            severity: 'medium',
            metadata: { length: content.length, maxLength },
          };
        }

        if (content.length < minLength) {
          return {
            passed: false,
            ruleName: 'length-limit',
            message: `Content is below minimum length of ${minLength} characters`,
            severity: 'medium',
            metadata: { length: content.length, minLength },
          };
        }

        return {
          passed: true,
          ruleName: 'length-limit',
          severity: 'medium',
        };
      },
    };
  }

  /**
   * Pattern matching guardrail
   */
  static patternMatch(
    pattern: RegExp,
    message: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): GuardrailRule {
    return {
      name: 'pattern-match',
      type: 'both',
      enabled: true,
      severity,
      validate: (content: string) => {
        if (pattern.test(content)) {
          return {
            passed: false,
            ruleName: 'pattern-match',
            message,
            severity,
          };
        }

        return {
          passed: true,
          ruleName: 'pattern-match',
          severity,
        };
      },
    };
  }

  /**
   * LLM-based content moderation
   */
  static llmModeration(provider: IModelProvider): GuardrailRule {
    return {
      name: 'llm-moderation',
      type: 'both',
      enabled: true,
      severity: 'high',
      validate: async (content: string) => {
        try {
          const prompt = `Analyze the following content for safety and appropriateness. Check for:
- Harmful or dangerous instructions
- Hate speech or discrimination
- Violence or threats
- Sexual content
- Misinformation

Content: "${content}"

Respond with JSON: {"safe": true/false, "reason": "explanation", "categories": ["category1", "category2"]}`;

          const response = await provider.complete(
            [
              {
                role: 'system',
                content: 'You are a content moderation system. Return only valid JSON.',
              },
              { role: 'user', content: prompt },
            ],
            { temperature: 0.2, maxTokens: 200 }
          );

          const result = JSON.parse(response.content);

          if (!result.safe) {
            return {
              passed: false,
              ruleName: 'llm-moderation',
              message: `Content flagged by moderation: ${result.reason}`,
              severity: 'high',
              metadata: { categories: result.categories },
            };
          }

          return {
            passed: true,
            ruleName: 'llm-moderation',
            severity: 'high',
          };
        } catch (error) {
          console.error('LLM moderation failed:', error);
          // Fail open - don't block on errors
          return {
            passed: true,
            ruleName: 'llm-moderation',
            severity: 'high',
            metadata: { error: (error as Error).message },
          };
        }
      },
    };
  }

  /**
   * Topic restriction guardrail
   */
  static topicRestriction(forbiddenTopics: string[]): GuardrailRule {
    return {
      name: 'topic-restriction',
      type: 'both',
      enabled: true,
      severity: 'high',
      validate: (content: string) => {
        const lowerContent = content.toLowerCase();
        const found = forbiddenTopics.filter((topic) =>
          lowerContent.includes(topic.toLowerCase())
        );

        if (found.length > 0) {
          return {
            passed: false,
            ruleName: 'topic-restriction',
            message: `Content discusses restricted topics: ${found.join(', ')}`,
            severity: 'high',
            metadata: { foundTopics: found },
          };
        }

        return {
          passed: true,
          ruleName: 'topic-restriction',
          severity: 'high',
        };
      },
    };
  }
}

/**
 * Guardrail manager
 */
export class GuardrailManager {
  private rules: Map<string, GuardrailRule> = new Map();
  private emitter: EventEmitter;

  constructor(emitter: EventEmitter) {
    this.emitter = emitter;
  }

  /**
   * Add a guardrail rule
   */
  addRule(rule: GuardrailRule): void {
    this.rules.set(rule.name, rule);
  }

  /**
   * Remove a guardrail rule
   */
  removeRule(name: string): void {
    this.rules.delete(name);
  }

  /**
   * Enable/disable a rule
   */
  toggleRule(name: string, enabled: boolean): void {
    const rule = this.rules.get(name);
    if (rule) {
      rule.enabled = enabled;
    }
  }

  /**
   * Validate input content
   */
  async validateInput(content: string): Promise<{
    passed: boolean;
    results: GuardrailResult[];
    blockedBy?: GuardrailResult;
  }> {
    return this.validate(content, 'input');
  }

  /**
   * Validate output content
   */
  async validateOutput(content: string): Promise<{
    passed: boolean;
    results: GuardrailResult[];
    blockedBy?: GuardrailResult;
  }> {
    return this.validate(content, 'output');
  }

  /**
   * Validate content against rules
   */
  private async validate(
    content: string,
    type: 'input' | 'output'
  ): Promise<{
    passed: boolean;
    results: GuardrailResult[];
    blockedBy?: GuardrailResult;
  }> {
    const results: GuardrailResult[] = [];

    // Get applicable rules
    const applicableRules = Array.from(this.rules.values()).filter(
      (rule) => rule.enabled && (rule.type === type || rule.type === 'both')
    );

    // Run all rules
    for (const rule of applicableRules) {
      try {
        const result = await rule.validate(content);
        results.push(result);

        // Stop on first critical failure
        if (!result.passed && result.severity === 'critical') {
          this.emitter.emit({
            type: 'guardrail:triggered' as const,
            timestamp: Date.now(),
            ruleName: rule.name,
            severity: result.severity,
            message: result.message,
          } as any);

          return {
            passed: false,
            results,
            blockedBy: result,
          };
        }
      } catch (error) {
        console.error(`Guardrail rule "${rule.name}" failed:`, error);
      }
    }

    // Check if any non-critical rules failed
    const failed = results.find((r) => !r.passed);
    if (failed) {
      this.emitter.emit({
        type: 'guardrail:triggered' as const,
        timestamp: Date.now(),
        ruleName: failed.ruleName,
        severity: failed.severity,
        message: failed.message,
      } as any);

      return {
        passed: false,
        results,
        blockedBy: failed,
      };
    }

    return {
      passed: true,
      results,
    };
  }

  /**
   * Get all rules
   */
  getRules(): GuardrailRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Clear all rules
   */
  clearRules(): void {
    this.rules.clear();
  }
}
