using ai-agent

Read CLAUDE.md first. Replace Ollama LLM calls 
with Groq API. Keep Ollama ONLY for embeddings
(nomic-embed-text). 

Dependencies:
  npm install groq-sdk

─────────────────────────────────────────────
1. CREATE srv/lib/groq-client.js
─────────────────────────────────────────────
Use groq-sdk. Two model constants:
  FAST_MODEL  = 'llama-3.1-8b-instant'
  SMART_MODEL = 'llama-3.3-70b-versatile'

Function askGroq(prompt, systemPrompt, smart=false):
  - Initialize Groq with process.env.GROQ_API_KEY
  - Use FAST_MODEL if smart=false, SMART_MODEL if true
  - max_tokens: 1024, temperature: 0.3
  - Return { answer: response.choices[0].message.content }
  - Log: [groq] model=${model} tokens=${usage.total_tokens}
  - On error throw: "Groq unavailable: ${err.message}"

─────────────────────────────────────────────
2. UPDATE srv/lib/intent-detector.js
─────────────────────────────────────────────
Replace askLlama() with askGroq(prompt, sys, false)
Keep exact same prompt logic.

─────────────────────────────────────────────
3. UPDATE srv/lib/sql-generator.js
─────────────────────────────────────────────
Replace askLlama() with askGroq(prompt, sys, true)
Keep exact same prompt logic.

─────────────────────────────────────────────
4. UPDATE srv/search-service.js
─────────────────────────────────────────────
Replace all askLlama() calls:
  searchAI answers    → askGroq(prompt, sys, true)
  suggestCustomer     → askGroq(prompt, sys, false)

─────────────────────────────────────────────
5. UPDATE srv/lib/ollama-client.js
─────────────────────────────────────────────
Add top comment:
  // DEPRECATED: LLM calls moved to groq-client.js
  // This file kept for reference only
  // Ollama still used for embeddings (embeddings.js)

─────────────────────────────────────────────
6. UPDATE .env.example
─────────────────────────────────────────────
Add: GROQ_API_KEY=gsk_your-key-here
Keep: OLLAMA_URL=http://localhost:11434

─────────────────────────────────────────────
7. UPDATE srv/lib/error-handler.js (if exists)
   or search-service.js error handling
─────────────────────────────────────────────
Add Groq-specific error:
  if err includes "GROQ" or "groq":
    return "AI service unavailable. 
            Please check your Groq API key."