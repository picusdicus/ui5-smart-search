Using the ai-agent instructions, CLAUDE.md and vector-search skill 
as reference, implement the complete AI orchestration layer.
IMPORTANT: Use Ollama for BOTH embeddings and AI answers. 
No external API keys needed.

1. Create srv/lib/embeddings.js:
   - Calls Ollama REST API: POST http://localhost:11434/api/embeddings
   - Model: 'nomic-embed-text' (768 dimensions)
   - Function: embedText(text) → returns Float32Array
   - Function: serializeEmbedding(float32Array) → Buffer (for HANA storage)
   - Function: deserializeEmbedding(buffer) → Float32Array
   - Use native fetch, no extra npm packages needed
   - Handle connection errors gracefully (Ollama not running)

2. Create srv/lib/hana-vector.js:
   - Uses @sap/hana-client for direct HANA connection
   - Function: vectorSearch(entityName, queryVector, topK=10)
   - Uses COSINE_SIMILARITY with TO_REAL_VECTOR(?) pattern
   - Vector dimensions: 768 (matching nomic-embed-text)
   - Returns rows with score, sorted descending
   - Supports all 4 entities: Customers, Products, 
     SalesOrders, Invoices
   - Connection reads from process.env

3. Create srv/lib/ollama-client.js:
   - Calls Ollama REST API: POST http://localhost:11434/api/chat
   - Model: 'llama3.2'
   - Function: askLlama(query, context, entityType)
   - stream: false
   - System prompt identifies it as an SAP data assistant
   - Context is formatted as readable text from DB rows
   - Returns { answer: String }

4. Implement srv/search-service.js fully:
   - on('searchAI') handler chains all 3 steps:
     a. embedText(query)        → from embeddings.js
     b. vectorSearch(entity, vector) → from hana-vector.js
     c. askLlama(query, results)    → from ollama-client.js
   - Detects entity type from query keywords:
     "invoice/invoices" → Invoices
     "customer/customers" → Customers
     "product/products" → Products
     "order/orders" → SalesOrders
     default → search all entities
   - Returns { answer, results } to SAPUI5
   - Full try/catch with meaningful error messages

5. Create srv/lib/seed-embeddings.js:
   - Reads existing seed CSV data from db/src/seed-data/
   - Embeds each row's text fields using embedText()
   - Stores serialized embeddings to HANA via @sap/hana-client
   - Logs progress per entity
   - Run with: node srv/lib/seed-embeddings.js

6. Update package.json adding:
   @sap/hana-client, hdb

7. Update .env.example:
   # No API keys needed!
   OLLAMA_URL=http://localhost:11434
   HANA_HOST=
   HANA_PORT=443
   HANA_USER=DBADMIN
   HANA_PASSWORD=

8. Update CLAUDE.md:
   - Replace Anthropic/OpenAI references with Ollama
   - Update embeddings dimensions from 1536 to 768

All files must use async/await, no callbacks.
Add JSDoc comments to all functions.


Using hana-agent, update db/src/schema.cds and all HANA vector views to use 
REAL_VECTOR(768) instead of REAL_VECTOR(1536).
We switched to nomic-embed-text which outputs 768 dimensions.

Once it's done, tell me how to test it