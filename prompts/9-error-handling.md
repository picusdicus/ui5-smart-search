Use agents ai-agent and cap-agent.

Read CLAUDE.md first. Add comprehensive error handling
and resilience to the smart-search application.

Current state: app works on happy path only.
Errors cause raw stack traces or silent failures.

─────────────────────────────────────────────
Backend resilience needed:
─────────────────────────────────────────────

1. HANA connection drops (trial stops daily):
   - Detect stale connection in getConnection()
   - Auto-reconnect with 3 retries + exponential backoff
   - Clear _connection singleton on failure
   - Log: [hana] Reconnecting attempt ${n}/3

2. Ollama not running:
   - Detect ECONNREFUSED on embedText() and askLlama()
   - Return user-friendly error:
     "AI service unavailable. 
      Please ensure Ollama is running."
   - Do not expose raw connection errors

3. Llama timeout:
   - Add 30s timeout to all Ollama fetch calls
   - On timeout return:
     "AI response timed out. Please try again."

4. JSON parse failures in suggestCustomer:
   - Wrap all JSON.parse() in try/catch
   - On failure return safe defaults:
     { name: '', language: 'EN', grouping: 'BP01' }
   - Log: [suggest] JSON parse failed, using defaults

5. Empty vector search results:
   - Return meaningful message not empty array:
     "No matching records found for your query."

6. API Hub unreachable:
   - Detect fetch errors in s4-client.js
   - Return: "SAP system temporarily unavailable."

7. search-service.js global error handler:
   - Wrap entire searchAI handler in try/catch
   - Never expose stack traces to UI
   - Always return { answer, results } even on error
   - Log full error server-side only

─────────────────────────────────────────────
Frontend resilience needed:
─────────────────────────────────────────────

1. Show specific error messages per scenario:
   - "AI service unavailable" → suggest checking Ollama
   - "No results found" → suggest rephrasing
   - "Connection error" → suggest retrying

2. Search field validation:
   - Minimum 3 characters before allowing search
   - Trim whitespace before sending

3. Dialog resilience:
   - If suggestCustomer fails → keep dialog open
     show error in MessageStrip, don't close dialog
   - If createCustomer fails → keep dialog open
     show error, let user retry

4. Loading states:
   - Disable search button while searching
   - Show "Searching..." text during query
   - Disable Create button while creating

All error messages must be user-friendly.
Never show: stack traces, HTTP codes, 
HANA errors, internal function names.
Log full details server-side only.