Using ai-agent

Read CLAUDE.md first. Replace Ollama LLM calls 
with Groq API. Keep Ollama for embeddings only.

IMPORTANT:
- Ollama stays for embeddings (nomic-embed-text)
- Only the LLM/chat calls move to Groq
- Model to use: llama3-8b-8192 (Groq's Llama3)

1. CREATE srv/lib/groq-client.js:
   - Uses groq-sdk
   - Initialize: new Groq({ apiKey: process.env.GROQ_API_KEY })
   - Function askGroq(prompt, systemPrompt):
     chat.completions.create({
       model: 'llama3-8b-8192',
       messages: [
         { role: 'system', content: systemPrompt },
         { role: 'user', content: prompt }
       ],
       max_tokens: 1024,
       temperature: 0.3
     })
     Return { answer: response.choices[0].message.content }
   - Same interface as existing askLlama()
   - Log: [groq] tokens used: ${usage.total_tokens}

2. UPDATE srv/lib/intent-detector.js:
   Replace askLlama() with askGroq()
   Keep exact same prompt

3. UPDATE srv/lib/sql-generator.js:
   Replace askLlama() with askGroq()
   Keep exact same prompt

4. UPDATE srv/search-service.js:
   Replace all askLlama() calls with askGroq()
   Keep exact same prompts

5. UPDATE srv/lib/ollama-client.js:
   Add comment: "DEPRECATED - use groq-client.js"
   Keep file for reference only

6. UPDATE .env.example:
   Add: GROQ_API_KEY=
   Keep: OLLAMA_URL= (still needed for embeddings)

Keep all existing function signatures unchanged.