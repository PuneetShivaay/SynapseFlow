# SynapseFlow Examples

This directory contains working examples demonstrating SynapseFlow capabilities.

## Setup

1. **Install dependencies** (from project root):
   ```bash
   npm install
   ```

2. **Create `.env` file** with your OpenAI API key:
   ```bash
   cp .env.example .env
   # Edit .env and add your OPENAI_API_KEY
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

## Examples

### 01 - Basic Agent
A simple agent that answers questions without tools.

```bash
node examples/01-basic-agent.js
```

**Features demonstrated**:
- Basic agent creation
- Event listening
- Simple question answering

---

### 02 - Agent with Tools
An agent that can use tools for calculations and weather information.

```bash
node examples/02-with-tools.js
```

**Features demonstrated**:
- Tool definition with Zod schemas
- Tool execution
- Multi-turn conversations
- Multiple tool calls

**Tools included**:
- `calculator`: Perform arithmetic operations
- `get_weather`: Get weather for a location

---

## Example Output

```
🧠 SynapseFlow - Basic Agent Example

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 Agent started
📝 Input: What is the capital of France?

💭 LLM Response:
   The capital of France is Paris.
   Tokens: 25

✅ Agent completed
   Iterations: 1
   Duration: 1250ms
   Cost: $0.000038

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📤 Final Result:
   The capital of France is Paris.

✨ Success!
```

## Next Steps

- Add memory to maintain conversation context
- Integrate graph database for knowledge persistence
- Try streaming for real-time responses
- Build multi-agent workflows

## Need Help?

- Check the main [README](../README.md)
- Read the [BUILD_PLAN](../BUILD_PLAN.md)
- See [ARCHITECTURE](../ARCHITECTURE.md) for technical details
