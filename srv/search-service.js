'use strict';

const cds = require('@sap/cds');
const { embedText }             = require('./lib/embeddings');
const { vectorSearch,
        parallelVectorSearch,
        getConnection }         = require('./lib/hana-vector');
const { askLlama,
        askLlamaMultiEntity }   = require('./lib/ollama-client');
const { detectEntities,
        mergeResults,
        enrichWithRelationships,
        buildContextBlock }     = require('./lib/context-builder');
const { detectIntent }          = require('./lib/intent-detector');
const { generateSQL }           = require('./lib/sql-generator');
const { validateSQL }           = require('./lib/sql-validator');
const { executeSQL,
        formatSQLContext }      = require('./lib/sql-executor');

/**
 * Detects the single most relevant SAP entity (legacy single-entity path).
 *
 * @param {string} query - The user's natural-language question.
 * @returns {'Invoices'|'SalesOrders'|'Products'|'Customers'}
 */
function detectEntity(query) {
    const q = query.toLowerCase();

    if (/invoice|invoices|billing|overdue|due date/.test(q)) return 'Invoices';
    if (/order|orders|sales order|purchase/.test(q))         return 'SalesOrders';
    if (/product|products|item|stock|inventory/.test(q))     return 'Products';
    if (/customer|customers|client|contact/.test(q))         return 'Customers';
    return 'Customers';
}

module.exports = class SearchService extends cds.ApplicationService {

    async init() {
        this.on('searchAI', this._handleSearchAI.bind(this));
        return super.init();
    }

    /**
     * Handles the searchAI action.
     * Routes to multi-entity pipeline when more than one entity is detected,
     * falls back to the original single-entity path otherwise.
     *
     * @param {object} req - CAP request object; req.data.query is the user question.
     * @returns {Promise<{ answer: string, results: Array<string>, entityTypes: Array<string>, isMultiEntity: boolean }>}
     */
    async _handleSearchAI(req) {
        try {
            const { query } = req.data;

            // STEP 0: Detect intent — analytical queries go to SQL path
            const intent = await detectIntent(query);

            if (intent === 'analytical') {
                const sql = await generateSQL(query);
                const { valid, error } = validateSQL(sql);

                if (valid) {
                    const conn = await getConnection();
                    const rows = await executeSQL(sql, conn);
                    const context = formatSQLContext(rows, query);
                    const { answer } = await askLlamaMultiEntity(query, context, ['Analytics']);
                    console.log('[search-service] Analytical path complete');
                    return {
                        answer,
                        results:      rows.map(r => JSON.stringify(r)),
                        entityTypes:  ['Analytics'],
                        isMultiEntity: false,
                        generatedSQL: sql,
                    };
                }

                console.warn('[searchAI] Invalid SQL, falling back to RAG:', error);
            }

            // STEP 1: Detect relevant entities
            const entities = detectEntities(query);
            const isMultiEntity = entities.length > 1;

            console.log(`[search-service] Detected entities: ${entities.map(e => e.name).join(', ')} | multi=${isMultiEntity}`);

            if (isMultiEntity) {
                // ── MULTI-ENTITY PATH ──────────────────────────────────────────

                // STEP 2: Embed query once
                const vector = await embedText(query);

                // STEP 3: Search all relevant entities in parallel (5 results each)
                const entityResults = await parallelVectorSearch(entities, vector, 5);

                // STEP 4: Merge and deduplicate
                const mergedRows = mergeResults(entityResults);
                console.log(`[search-service] Merged ${mergedRows.length} rows across ${entities.length} entities`);

                // STEP 5: Enrich with relationship data
                const db = await cds.connect.to('db');
                const enrichedRows = await enrichWithRelationships(mergedRows, db);

                // STEP 6: Build context block
                const contextBlock = buildContextBlock(enrichedRows);

                // STEP 7: Ask Llama with multi-entity prompt
                const entityNames = entities.map(e => e.name);
                const { answer } = await askLlamaMultiEntity(query, contextBlock, entityNames);
                console.log(`[search-service] Ollama answered (multi-entity: ${entityNames.join(', ')})`);

                // STEP 8: Return enriched results (EMBEDDING already stripped in mergeResults)
                return {
                    answer,
                    results: enrichedRows.map(r => {
                        // eslint-disable-next-line no-unused-vars
                        const { relatedData, SCORE, ...rest } = r;
                        return JSON.stringify({
                            ...rest,
                            score:        SCORE,
                            customerName: relatedData?.customerName || null,
                        });
                    }),
                    entityTypes:  entityNames,
                    isMultiEntity: true,
                    generatedSQL:  null,
                };

            } else {
                // ── SINGLE-ENTITY PATH (original, unchanged) ──────────────────

                const entityName = detectEntity(query);
                console.log(`[search-service] Single-entity path: ${entityName} for query: "${query}"`);

                const queryVector = await embedText(query);
                const rows        = await vectorSearch(entityName, queryVector);
                console.log(`[search-service] Vector search returned ${rows.length} rows`);

                const { answer } = await askLlama(query, rows.slice(0, 3), entityName);
                console.log(`[search-service] Ollama answered for entity: ${entityName}`);

                const results = rows.map((row) => JSON.stringify({
                    entity:  entityName,
                    id:      row.ID,
                    title:   row.NAME || row.ID,
                    excerpt: (row.NOTES || row.DESCRIPTION || '').substring(0, 200),
                    score:   row.SCORE,
                }));

                return {
                    answer,
                    results,
                    entityTypes:  [entityName],
                    isMultiEntity: false,
                    generatedSQL:  null,
                };
            }

        } catch (err) {
            console.error('[search-service] Error:', err);
            req.error(500, `Search failed: ${err.message}`);
        }
    }
};
