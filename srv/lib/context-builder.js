'use strict';

const cds = require('@sap/cds');

const KEYWORD_MAP = {
    Invoices:    ['invoice', 'invoices', 'bill', 'payment', 'overdue', 'paid', 'unpaid', 'due', 'amount'],
    Customers:   ['customer', 'customers', 'client', 'buyer', 'company', 'account', 'german', 'spain', 'country'],
    Products:    ['product', 'products', 'material', 'stock', 'inventory', 'item', 'category', 'price'],
    SalesOrders: ['order', 'orders', 'sales', 'delivery', 'confirmed', 'shipped', 'cancelled'],
};

/**
 * Detects which SAP entities are relevant to the query by scoring keyword matches.
 * Returns all matched entities. If none match, returns all four with weight 0.8.
 *
 * @param {string} query - Natural language query.
 * @returns {Array<{name: string, weight: number}>}
 */
function detectEntities(query) {
    const q = query.toLowerCase();
    const matched = [];

    for (const [entity, keywords] of Object.entries(KEYWORD_MAP)) {
        const hits = keywords.filter(kw => q.includes(kw)).length;
        if (hits > 0) {
            const weight = Math.min(0.5 + hits * 0.1, 1.0);
            matched.push({ name: entity, weight });
        }
    }

    if (matched.length === 0) {
        return Object.keys(KEYWORD_MAP).map(name => ({ name, weight: 0.8 }));
    }

    return matched;
}

/**
 * Merges per-entity result arrays into a single deduplicated, score-sorted array.
 * Each row receives an `entityType` field and EMBEDDING is stripped.
 *
 * @param {Map<string, Array>} entityResults - Map of entity name → rows array.
 * @returns {Array}
 */
function mergeResults(entityResults) {
    const seen = new Set();
    const flat = [];

    for (const [entityType, rows] of entityResults) {
        for (const row of rows) {
            const key = `${entityType}:${row.ID}`;
            if (!seen.has(key)) {
                seen.add(key);
                // Strip binary embedding to avoid JSON serialization issues
                const { EMBEDDING, embedding, ...safeRow } = row;
                flat.push({ ...safeRow, entityType });
            }
        }
    }

    return flat.sort((a, b) => (b.SCORE || 0) - (a.SCORE || 0));
}

/**
 * Enriches Invoice and SalesOrder rows with their linked Customer name.
 * Adds a `relatedData` field to each row. Fails gracefully per row.
 *
 * @param {Array}  mergedRows - Output from mergeResults().
 * @param {object} db         - CAP db service (cds.connect.to('db')).
 * @returns {Promise<Array>}
 */
async function enrichWithRelationships(mergedRows, db) {
    const { SELECT } = cds.ql;

    const enriched = await Promise.all(
        mergedRows.map(async (row) => {
            try {
                if (row.entityType === 'Invoices' && row['salesOrder_ID']) {
                    // Invoice → SalesOrder → Customer
                    const [so] = await db.run(
                        SELECT.from('smart.search.SalesOrders').columns('customer_ID').where({ ID: row['salesOrder_ID'] })
                    );
                    if (so && so['customer_ID']) {
                        const [cust] = await db.run(
                            SELECT.from('smart.search.Customers').columns('name').where({ ID: so['customer_ID'] })
                        );
                        return { ...row, relatedData: cust ? { customerName: cust.name } : null };
                    }
                }

                if (row.entityType === 'SalesOrders' && row['customer_ID']) {
                    const [cust] = await db.run(
                        SELECT.from('smart.search.Customers').columns('name').where({ ID: row['customer_ID'] })
                    );
                    return { ...row, relatedData: cust ? { customerName: cust.name } : null };
                }

                return { ...row, relatedData: null };
            } catch (err) {
                console.warn(`[context-builder] Relationship fetch skipped for ${row.entityType} ${row.ID}:`, err.message);
                return { ...row, relatedData: null };
            }
        })
    );

    return enriched;
}

/**
 * Builds a structured, human-readable context block for the Llama prompt.
 * Grouped by entity type, max 2000 characters total.
 *
 * @param {Array} enrichedRows - Output from enrichWithRelationships().
 * @returns {string}
 */
function buildContextBlock(enrichedRows) {
    const groups = {};
    for (const row of enrichedRows) {
        const et = row.entityType;
        if (!groups[et]) groups[et] = [];
        groups[et].push(row);
    }

    const sections = [];

    for (const [entityType, rows] of Object.entries(groups)) {
        const header = `=== ${entityType.toUpperCase()} (${rows.length} records) ===`;
        const lines = rows.map(row => {
            const customerInfo = row.relatedData?.customerName
                ? ` | Customer: ${row.relatedData.customerName}`
                : '';

            if (entityType === 'Invoices') {
                const amt = row.amount !== undefined && row.amount !== null ? row.amount : 'N/A';
                return `- ID: ${row.ID} | Amount: ${row.currency || ''}${amt} | Status: ${row.status || 'N/A'}${customerInfo}`;
            }
            if (entityType === 'SalesOrders') {
                const amt = row.totalAmount !== undefined && row.totalAmount !== null ? row.totalAmount : 'N/A';
                return `- ID: ${row.ID} | Total: ${row.currency || ''}${amt} | Status: ${row.status || 'N/A'}${customerInfo}`;
            }
            if (entityType === 'Customers') {
                return `- ID: ${row.ID} | Name: ${row.name || 'N/A'} | Country: ${row.country || 'N/A'}`;
            }
            if (entityType === 'Products') {
                return `- ID: ${row.ID} | Name: ${row.name || 'N/A'} | Price: ${row.currency || ''}${row.price || 'N/A'} | Stock: ${row.stock || 'N/A'}`;
            }
            return `- ID: ${row.ID}`;
        });

        sections.push([header, ...lines].join('\n'));
    }

    let result = sections.join('\n\n');

    if (result.length > 2000) {
        result = result.substring(0, 1997) + '...';
    }

    return result;
}

module.exports = { detectEntities, mergeResults, enrichWithRelationships, buildContextBlock };
