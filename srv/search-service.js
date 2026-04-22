'use strict';

const cds = require('@sap/cds');
const { embedText }    = require('./lib/embeddings');
const { vectorSearch } = require('./lib/hana-vector');
const { askLlama }     = require('./lib/ollama-client');

/**
 * Detects the most relevant SAP entity based on keywords in the query.
 * Checked in priority order: Invoices → SalesOrders → Products → Customers.
 *
 * @param {string} query - The user's natural-language question.
 * @returns {'Invoices'|'SalesOrders'|'Products'|'Customers'} The detected entity name.
 */
function detectEntity(query) {
    const q = query.toLowerCase();

    if (/invoice|invoices|billing|overdue|due date/.test(q)) {
        return 'Invoices';
    }
    if (/order|orders|sales order|purchase/.test(q)) {
        return 'SalesOrders';
    }
    if (/product|products|item|stock|inventory/.test(q)) {
        return 'Products';
    }
    if (/customer|customers|client|contact/.test(q)) {
        return 'Customers';
    }
    return 'Customers';
}

module.exports = class SearchService extends cds.ApplicationService {

    async init() {
        this.on('searchAI', this._handleSearchAI.bind(this));
        return super.init();
    }

    /**
     * Handles the searchAI action: embeds the query, performs HANA vector search,
     * calls Ollama llama3.2 with the top-k results, and returns a structured response.
     *
     * @param {object} req - CAP request object; req.data.query is the user question.
     * @returns {Promise<{ answer: string, results: Array<object> }>}
     */
    async _handleSearchAI(req) {
        try {
            const { query } = req.data;

            // 1. Detect which entity the question is about
            const entityName = detectEntity(query);
            console.log(`[search-service] Detected entity: ${entityName} for query: "${query}"`);

            // 2. Generate a query embedding via Ollama nomic-embed-text
            const queryVector = await embedText(query);

            // 3. Run HANA cosine-similarity vector search (top-10)
            const rows = await vectorSearch(entityName, queryVector);
            console.log(`[search-service] Vector search returned ${rows.length} rows`);

            // 4. Ask Ollama llama3.2 to synthesise an answer from the top-3 rows only
            const { answer } = await askLlama(query, rows.slice(0, 3), entityName);
            console.log(`[search-service] Ollama answered for entity: ${entityName}`);

            // 5. Map raw HANA rows to the typed results array expected by the CDS action
            const results = rows.map((row) => ({
                entity:  entityName,
                id:      row.ID,
                title:   row.NAME || row.ID,
                excerpt: (row.NOTES || row.DESCRIPTION || '').substring(0, 200),
                score:   row.SCORE,
            }));

            return { answer, results };
        } catch (err) {
            console.error('[search-service] Error:', err);
            req.error(500, `Search failed: ${err.message}`);
        }
    }
};
