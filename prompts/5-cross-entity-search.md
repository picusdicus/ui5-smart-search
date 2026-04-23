Using ai-agent, we are enhancing the existing smart-search CAP application to support 
cross-entity queries that analyze data across multiple HANA tables 
simultaneously. Use CLAUDE.md, ai-agent instructions and vector-search 
skill as reference.

The current single-entity flow must be EXTENDED, not replaced.
All existing files must remain backward compatible.

─────────────────────────────────────────────────────────
1. CREATE srv/lib/context-builder.js
─────────────────────────────────────────────────────────
This module merges and enriches results from multiple 
vector searches into a structured context for Llama.

Functions to implement:

a) detectEntities(query: String) → Array<{name, weight}>
   - Scores ALL four entities against query keywords
   - Returns ALL entities that matched (not just one winner)
   - If nothing matches → returns all four with weight 0.8
   - Keyword map:
     Invoices:    invoice, invoices, bill, payment, overdue, 
                  paid, unpaid, due, amount
     Customers:   customer, customers, client, buyer, 
                  company, account, german, spain, country
     Products:    product, products, material, stock, 
                  inventory, item, category, price
     SalesOrders: order, orders, sales, delivery, 
                  confirmed, shipped, cancelled

b) mergeResults(entityResults: Map<String, Array>) → Array
   - Takes results keyed by entity name
   - Deduplicates by ID
   - Sorts by COSINE_SIMILARITY score descending
   - Returns flat array with entityType field added to each row

c) enrichWithRelationships(mergedRows: Array, db: connection)
   → Array
   - For each Invoice row: fetch its linked Customer name
     via SalesOrder → Customer association chain
   - For each SalesOrder row: fetch its linked Customer name
   - Adds relatedData field to each row
   - Uses Promise.all for parallel fetching
   - Gracefully skips if relationship fetch fails

d) buildContextBlock(enrichedRows: Array) → String
   - Groups rows by entityType
   - Formats each group as readable labeled text block:
     === INVOICES (4 records) ===
     - ID: xxx | Amount: €5,000 | Status: Overdue | 
       Customer: Acme GmbH
     ...
     === CUSTOMERS (3 records) ===
     ...
   - Returns complete context string for Llama prompt
   - Max 2000 characters total to respect context limits

─────────────────────────────────────────────────────────
2. UPDATE srv/lib/hana-vector.js
─────────────────────────────────────────────────────────
Add new function alongside existing vectorSearch():

parallelVectorSearch(
  entities: Array<{name, weight}>, 
  queryVector: Float32Array, 
  topKPerEntity: Number = 5
) → Map<String, Array>

- Runs vectorSearch() for each entity simultaneously
  using Promise.all
- Applies weight to scores: row.score * entity.weight
- Returns Map keyed by entity name
- Each entity gets topKPerEntity results (default 5)
- Total max records across all entities: 20
- Handles partial failures: if one entity search fails,
  log the error and continue with remaining entities

─────────────────────────────────────────────────────────
3. UPDATE srv/lib/ollama-client.js
─────────────────────────────────────────────────────────
Add new function alongside existing askLlama():

askLlamaMultiEntity(
  query: String,
  contextBlock: String,
  entityTypes: Array<String>
) → { answer: String }

- Uses a richer system prompt optimized for cross-entity 
  analysis:
  "You are an SAP business data analyst with expertise in
   reading related business records across multiple tables.
   Analyze the provided data holistically.
   Identify relationships between records.
   Highlight patterns, totals, and anomalies.
   Be concise but thorough. Format numbers as currency."
- Includes entityTypes in prompt so Llama knows what 
  tables were searched
- Max tokens: 2048 (more than single-entity's 1024)
- Keep existing askLlama() unchanged

─────────────────────────────────────────────────────────
4. UPDATE srv/search-service.js
─────────────────────────────────────────────────────────
Update the searchAI handler to use the new multi-entity 
pipeline when more than one entity is detected.
Keep the existing single-entity path as fallback.

New orchestration logic:

on('searchAI') {
  
  // STEP 1: Detect relevant entities
  const entities = detectEntities(query)
  const isMultiEntity = entities.length > 1

  if (isMultiEntity) {
    // ── MULTI-ENTITY PATH ──────────────────────────────

    // STEP 2: Embed query once (reused for all entities)
    const vector = await embedText(query)

    // STEP 3: Search all relevant entities in parallel
    const entityResults = await parallelVectorSearch(
      entities, vector, 5
    )

    // STEP 4: Merge and deduplicate results
    const mergedRows = mergeResults(entityResults)

    // STEP 5: Enrich with relationship data from HANA
    const enrichedRows = await enrichWithRelationships(
      mergedRows, db
    )

    // STEP 6: Build structured context block
    const contextBlock = buildContextBlock(enrichedRows)

    // STEP 7: Ask Llama with multi-entity prompt
    const entityNames = entities.map(e => e.name)
    const { answer } = await askLlamaMultiEntity(
      query, contextBlock, entityNames
    )

    // STEP 8: Return enriched results
    return {
      answer,
      results: enrichedRows.map(r => JSON.stringify(r)),
      entityTypes: entityNames,         // NEW field
      isMultiEntity: true               // NEW field
    }

  } else {
    // ── SINGLE-ENTITY PATH (existing, unchanged) ───────
    // ... existing code ...
  }
}

─────────────────────────────────────────────────────────
5. UPDATE srv/search-service.cds
─────────────────────────────────────────────────────────
Update the searchAI action return type to include 
the two new fields:

action searchAI(query: String) returns {
  answer      : String;
  results     : array of String;
  entityTypes : array of String;    // NEW
  isMultiEntity : Boolean;          // NEW
};

─────────────────────────