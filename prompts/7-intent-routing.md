Use ai-agent for this task.

Add intent routing to smart-search. Queries are either 
"lookup" (use existing RAG) or "analytical" (use SQL).

─────────────────────────────────────────────────────────
1. CREATE srv/lib/intent-detector.js
─────────────────────────────────────────────────────────
Function: detectIntent(query) → 'analytical' | 'lookup'

Call Ollama llama3.2 with this prompt:
  system: "You are a query classifier. Reply with exactly 
           one word: 'analytical' or 'lookup'.
           analytical = requires aggregation, totals, 
           averages, rankings, grouping, counting.
           lookup = finding specific records, filtering,
           searching for entities."
  user: query

Parse response, default to 'lookup' if unclear.
Log: [intent] query: "${query}" → ${intent}

─────────────────────────────────────────────────────────
2. CREATE srv/lib/sql-generator.js
─────────────────────────────────────────────────────────
Function: generateSQL(query) → String

Call Ollama llama3.2 with this prompt:
  system: "You are a HANA SQL expert. Generate ONE valid 
           SELECT query. Output raw SQL only, no markdown,
           no explanation, no backticks.
           
           Rules:
           - Only SELECT statements allowed
           - Always use LIMIT 100
           - Use exact table/column names below
           
           Schema:
           "smart_search_Customers"
             ID, name, email, country
           "smart_search_Products"  
             ID, name, category, price, currency, stock
           "smart_search_SalesOrders"
             ID, orderDate, status, "customer_ID", 
             totalAmount, currency
           "smart_search_SalesOrderItems"
             ID, "salesOrder_ID", "product_ID",
             quantity, unitPrice, currency
           "smart_search_Invoices"
             ID, invoiceDate, dueDate, status,
             "salesOrder_ID", amount, currency
             
           Relationships:
           Invoices."salesOrder_ID" = SalesOrders.ID
           SalesOrders."customer_ID" = Customers.ID
           SalesOrderItems."salesOrder_ID" = SalesOrders.ID
           SalesOrderItems."product_ID" = Products.ID"
           
  user: query

─────────────────────────────────────────────────────────
3. CREATE srv/lib/sql-validator.js
─────────────────────────────────────────────────────────
Function: validateSQL(sql) → { valid: Boolean, error: String }

Safety checks (reject if any fail):
- Must start with SELECT (case insensitive)
- Must NOT contain: INSERT, UPDATE, DELETE, DROP, 
  CREATE, ALTER, EXEC, EXECUTE, --, ;--
- Must only reference these table names:
  smart_search_Customers, smart_search_Products,
  smart_search_SalesOrders, smart_search_SalesOrderItems,
  smart_search_Invoices
- Must contain LIMIT or TOP

Log: [sql-validator] valid=${valid} sql="${sql}"

─────────────────────────────────────────────────────────
4. CREATE srv/lib/sql-executor.js
─────────────────────────────────────────────────────────
Function: executeSQL(sql, conn) → Array

- Execute validated SQL on HANA connection
- Return raw rows array
- Log row count returned
- On error: throw with message "SQL execution failed: ${err}"

Function: formatSQLContext(rows, query) → String
- Format rows as labeled text block for Llama:
  "=== ANALYTICAL RESULTS (${rows.length} rows) ===
   These are exact database results. Do not recalculate.
   ${rows.map(r => JSON.stringify(r)).join('\n')}"

─────────────────────────────────────────────────────────
5. UPDATE srv/search-service.js
─────────────────────────────────────────────────────────
Add analytical path BEFORE existing RAG path:

const { detectIntent } = require('./lib/intent-detector')
const { generateSQL } = require('./lib/sql-generator')
const { validateSQL } = require('./lib/sql-validator')
const { executeSQL, formatSQLContext } = require('./lib/sql-executor')

on('searchAI') {
  const intent = await detectIntent(query)
  
  if (intent === 'analytical') {
    const sql = await generateSQL(query)
    const { valid, error } = validateSQL(sql)
    
    if (!valid) {
      // fallback to RAG if SQL is unsafe
      console.warn('[searchAI] Invalid SQL, falling back to RAG:', error)
      // ... existing RAG path
    }
    
    const conn = await getConnection()
    const rows = await executeSQL(sql, conn)
    const context = formatSQLContext(rows, query)
    const { answer } = await askLlamaMultiEntity(
      query, context, ['Analytics']
    )
    
    return {
      answer,
      results: rows.map(r => JSON.stringify(r)),
      entityTypes: ['Analytics'],
      isMultiEntity: false,
      generatedSQL: sql    // useful for debugging
    }
  }
  
  // existing RAG path unchanged below...
}

─────────────────────────────────────────────────────────
6. UPDATE srv/search-service.cds
─────────────────────────────────────────────────────────
Add generatedSQL field to searchAI return type:

action searchAI(query: String) returns {
  answer        : String;
  results       : array of String;
  entityTypes   : array of String;
  isMultiEntity : Boolean;
  generatedSQL  : String;    // NEW - for transparency
};

─────────────────────────────────────────────────────────
7. UPDATE app/webapp/controller/Search.controller.js
─────────────────────────────────────────────────────────
If generatedSQL exists in response, show it in a 
collapsed sap.m.Panel below the results:
  Header: "Generated SQL (click to expand)"
  Content: sap.m.Text with the SQL string
  expanded: false by default

─────────────────────────────────────────────────────────
8. UPDATE test/revenue-queries.http
─────────────────────────────────────────────────────────
Add intent routing tests:

### Analytical - revenue
{ "query": "monthly revenue by product category" }

### Analytical - ranking  
{ "query": "top 5 best selling products" }

### Analytical - count
{ "query": "how many overdue invoices per country" }

### Lookup - should still use RAG
{ "query": "show me overdue invoices from Germany" }

### Lookup - should still use RAG
{ "query": "customers from Mexico" }