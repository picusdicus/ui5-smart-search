'use strict';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

const SYSTEM_PROMPT =
    'You are a HANA SQL expert. Generate ONE valid SELECT query. ' +
    'Output raw SQL only, no markdown, no explanation, no backticks.\n\n' +
    'Rules:\n' +
    '- Only SELECT statements allowed\n' +
    '- Always use LIMIT 100\n' +
    '- CRITICAL: ALL table names MUST be wrapped in double-quotes exactly as shown below.\n' +
    '  HANA is case-sensitive. Never reference tables without double-quotes.\n\n' +
    'Schema (always use double-quoted table names):\n' +
    '"smart_search_Customers"\n' +
    '  ID, name, email, country\n' +
    '"smart_search_Products"\n' +
    '  ID, name, category, price, currency, stock\n' +
    '"smart_search_SalesOrders"\n' +
    '  ID, orderDate, status, "customer_ID", totalAmount, currency\n' +
    '"smart_search_SalesOrderItems"\n' +
    '  ID, "salesOrder_ID", "product_ID", quantity, unitPrice, currency\n' +
    '"smart_search_Invoices"\n' +
    '  ID, invoiceDate, dueDate, status, "salesOrder_ID", amount, currency\n\n' +
    'Relationships:\n' +
    '"smart_search_Invoices"."salesOrder_ID" = "smart_search_SalesOrders".ID\n' +
    '"smart_search_SalesOrders"."customer_ID" = "smart_search_Customers".ID\n' +
    '"smart_search_SalesOrderItems"."salesOrder_ID" = "smart_search_SalesOrders".ID\n' +
    '"smart_search_SalesOrderItems"."product_ID" = "smart_search_Products".ID\n\n' +
    'CRITICAL: ALL column references must also use double-quotes to preserve case.\n' +
    'Example: SELECT P."category", SUM(SOI."unitPrice" * SOI."quantity") AS revenue\n' +
    'FROM "smart_search_SalesOrderItems" SOI\n' +
    'JOIN "smart_search_Products" P ON SOI."product_ID" = P."ID"\n' +
    'GROUP BY P."category" LIMIT 100';

const KNOWN_TABLES = [
    'smart_search_SalesOrderItems',
    'smart_search_SalesOrders',
    'smart_search_Customers',
    'smart_search_Products',
    'smart_search_Invoices',
];

/**
 * Wraps any unquoted known table name in double-quotes so HANA preserves case.
 * Skips names that are already quoted.
 * @param {string} sql
 * @returns {string}
 */
function quoteTableNames(sql) {
    let result = sql;
    for (const table of KNOWN_TABLES) {
        const pattern = new RegExp(`(?<!")(${table})(?!")`, 'g');
        result = result.replace(pattern, `"${table}"`);
    }
    return result;
}

/**
 * Quotes unquoted alias.column references (e.g. P.category → P."category").
 * HANA uppercases all unquoted identifiers, so mixed-case column names must be quoted.
 * Only transforms `alias.identifier` where the identifier is not already double-quoted.
 * @param {string} sql
 * @returns {string}
 */
function quoteColumnRefs(sql) {
    // Match word.word where the column part is NOT already preceded by a quote
    // e.g.  P.category  →  P."category"
    //       SOI.unitPrice  →  SOI."unitPrice"
    //       SOI."product_ID"  →  unchanged (already quoted)
    return sql.replace(/\b([A-Za-z_]\w*)\.(?!")([A-Za-z_]\w*)/g, '$1."$2"');
}

/**
 * Generates a HANA SQL SELECT statement for an analytical query.
 * @param {string} query
 * @returns {Promise<string>}
 */
async function generateSQL(query) {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'llama3.2',
            stream: false,
            options: { num_predict: 512 },
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: query },
            ],
        }),
    });

    if (!response.ok) {
        throw new Error(`Ollama SQL generation failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    const raw = (json.message?.content || '').trim();

    // Strip markdown code fences if the model ignores the instruction
    let sql = raw
        .replace(/^```[a-z]*\n?/i, '')
        .replace(/\n?```$/i, '')
        .trim();

    // Force-quote any unquoted known table names (HANA is case-sensitive)
    sql = quoteTableNames(sql);
    // Force-quote alias.column refs so mixed-case columns aren't uppercased by HANA
    sql = quoteColumnRefs(sql);

    console.log(`[sql-generator] Generated SQL: ${sql}`);
    return sql;
}

module.exports = { generateSQL };
