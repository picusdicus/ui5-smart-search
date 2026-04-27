'use strict';

const cds = require('@sap/cds');
const { embedText }             = require('./lib/embeddings');
const { vectorSearch,
        parallelVectorSearch,
        getConnection }         = require('./lib/hana-vector');
const { askGroq,
        askGroqMultiEntity }    = require('./lib/groq-client');
const { detectEntities,
        mergeResults,
        enrichWithRelationships,
        buildContextBlock }     = require('./lib/context-builder');
const { detectIntent }          = require('./lib/intent-detector');
const { fetchBusinessPartnerById,
        createBusinessPartner }    = require('./lib/s4-client');
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
        this.on('searchAI',        this._handleSearchAI.bind(this));
        this.on('suggestCustomer', this._handleSuggestCustomer.bind(this));
        this.on('createCustomer',  this._handleCreateCustomer.bind(this));
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
                    const { answer } = await askGroqMultiEntity(query, context, ['Analytics']);
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
                const vector = await embedText(query, true);

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
                const { answer } = await askGroqMultiEntity(query, contextBlock, entityNames);
                console.log(`[search-service] Groq answered (multi-entity: ${entityNames.join(', ')})`);

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

                const queryVector = await embedText(query, true);
                const rows = await vectorSearch(entityName, queryVector);
                console.log(`[search-service] Vector search returned ${rows.length} rows`);

                if (!rows || rows.length === 0) {
                    return {
                        answer: 'No matching records found for your query.',
                        results: [],
                        entityTypes: [entityName],
                        isMultiEntity: false,
                        generatedSQL: null,
                    };
                }

                const { answer } = await askGroq(query, rows.slice(0, 3), entityName);
                console.log(`[search-service] Groq answered for entity: ${entityName}`);

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
            console.error('[search-service] searchAI error:', err);
            let answer = 'Search is currently unavailable. Please try again.';
            if (err.message && err.message.includes('AI service unavailable')) {
                answer = 'AI service unavailable. Please check your Groq API key.';
            } else if (err.message && err.message.includes('timed out')) {
                answer = 'AI response timed out. Please try again.';
            } else if (err.message && err.message.includes('SAP system')) {
                answer = 'SAP system temporarily unavailable. Please try again later.';
            }
            return { answer, results: [], entityTypes: [], isMultiEntity: false, generatedSQL: null };
        }
    }

    async _handleSuggestCustomer(req) {
        try {
            const { query } = req.data;

            // Best-effort: vector search for similar BP (requires HANA)
            let topMatch = null;
            let bp = null;
            let isDuplicate = false;
            try {
                const vector  = await embedText(query, true);
                const matches = await vectorSearch('Customers', vector, 1);
                if (matches && matches.length > 0) {
                    topMatch    = matches[0];
                    isDuplicate = topMatch.SCORE > 0.95;
                    bp = await fetchBusinessPartnerById(topMatch.ID);
                }
            } catch (hanaErr) {
                console.warn('[search-service] suggestCustomer: vector search unavailable, proceeding without reference BP:', hanaErr.message);
            }

            const prompt =
                `Suggest a realistic company name for:\n"${query}"\nReturn ONLY JSON, no markdown:\n{"name":"..."}`;

            const { answer } = await askGroq(prompt, [], 'Customers');

            let parsed = { name: '', language: 'EN', grouping: 'BP01' };
            try {
                const jsonMatch = answer.match(/\{[\s\S]*\}/);
                if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
            } catch (parseErr) {
                console.warn('[suggest] JSON parse failed, using defaults');
            }

            const suggested = {
                name:        parsed.name,
                language:    (bp && bp.language)    || 'EN',
                industry:    (bp && bp.industry)    || '',
                partnerType: (bp && bp.partnerType) || '2',
                grouping:    (bp && bp.grouping)    || 'BP01',
            };

            console.log(`[search-service] suggestCustomer complete — duplicate=${isDuplicate}, similarBP=${topMatch ? topMatch.ID : 'none'}`);

            return {
                suggestedFields:  JSON.stringify(suggested),
                similarBPId:      topMatch ? topMatch.ID   : '',
                similarBPName:    topMatch ? (topMatch.NAME || (bp && bp.name) || '') : '',
                duplicateWarning: isDuplicate,
            };
        } catch (err) {
            console.error('[search-service] suggestCustomer error:', err);
            let message = 'Suggestion service is currently unavailable. Please try again.';
            if (err.message && err.message.includes('AI service unavailable')) {
                message = 'AI service unavailable. Please check your Groq API key.';
            } else if (err.message && err.message.includes('timed out')) {
                message = 'AI response timed out. Please try again.';
            }
            req.error(503, message);
        }
    }

    async _handleCreateCustomer(req) {
        try {
            const { name, language, grouping, industry, partnerType } = req.data;

            const result = await createBusinessPartner({ name, language, grouping });

            try {
                const conn = await getConnection();
                const text = `${name} ${language || ''} ${grouping || ''}`.trim();
                const embedding = await embedText(text, false);
                const vectorStr = `[${embedding.join(',')}]`;
                await conn.exec(
                    `INSERT INTO SMART_SEARCH_CUSTOMERS (ID, NAME, LANGUAGE, GROUPING, EMBEDDING)
                     VALUES (?, ?, ?, ?, TO_REAL_VECTOR(?))`,
                    [result.id, name, language || 'EN', grouping || 'BP01', vectorStr]
                );
            } catch (syncErr) {
                console.warn('[search-service] createCustomer: vector sync skipped:', syncErr.message);
            }

            console.log(`[search-service] createCustomer complete — id=${result.id}`);
            return { id: result.id, success: true, message: `Business Partner ${result.id} created successfully` };

        } catch (err) {
            console.error('[search-service] createCustomer error:', err);
            let message = 'Customer creation failed. Please try again.';
            if (err.message && err.message.includes('SAP system')) {
                message = 'SAP system temporarily unavailable. Please try again later.';
            } else if (err.message && err.message.includes('AI service unavailable')) {
                message = 'AI service unavailable. Please check your Groq API key.';
            }
            req.error(503, message);
        }
    }
};
