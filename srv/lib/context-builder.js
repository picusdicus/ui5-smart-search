'use strict';

const { getConnection } = require('./hana-vector');

const KEYWORD_MAP = {
    Invoices:        ['invoice', 'invoices', 'bill', 'payment', 'overdue', 'paid', 'unpaid', 'due', 'amount'],
    Customers:       ['customer', 'customers', 'client', 'buyer', 'company', 'account', 'german', 'spain', 'country'],
    Products:        ['product', 'products', 'material', 'stock', 'inventory', 'item', 'category', 'price'],
    SalesOrders:     ['order', 'orders', 'sales', 'delivery', 'confirmed', 'shipped', 'cancelled'],
    SalesOrderItems: ['item', 'items', 'line', 'lines', 'quantity', 'revenue', 'selling', 'purchases'],
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
 * Composite key (entityType-ID) is used; on duplicate the highest score wins.
 *
 * @param {Map<string, Array>} entityResults - Map of entity name → rows array.
 * @returns {Array}
 */
function mergeResults(entityResults) {
    // Map from composite key → best row seen so far
    const best = new Map();

    for (const [entityType, rows] of entityResults) {
        for (const row of rows) {
            const key = `${entityType}-${row.ID}`;
            const score = row.SCORE || 0;
            const existing = best.get(key);

            if (!existing || score > (existing.SCORE || 0)) {
                // Strip binary embedding to avoid JSON serialization issues
                const { EMBEDDING, embedding, ...safeRow } = row;
                best.set(key, { ...safeRow, entityType });
            }
        }
    }

    return Array.from(best.values()).sort((a, b) => (b.SCORE || 0) - (a.SCORE || 0));
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
    const conn = await getConnection();

    function execSql(sql, params) {
        return new Promise((resolve, reject) => {
            conn.exec(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async function fetchCustomerInfo(customerId) {
        const query  = `SELECT "name", "country" FROM "smart_search_Customers" WHERE "ID" = ?`;
        const params = [customerId];
        console.log('[enrich] Query:', query);
        console.log('[enrich] Params:', params);
        try {
            const rows = await execSql(query, params);
            const result = rows?.[0];
            console.log('[enrich] Result:', JSON.stringify(result));
            return {
                customerName:    result?.name    || 'Unknown',
                customerCountry: result?.country || '',
            };
        } catch (err) {
            console.log('[enrich] Error:', err?.message);
            throw err;
        }
    }

    // Sequential loop — a single HANA connection cannot handle concurrent queries
    const enriched = [];
    for (const row of mergedRows) {
        try {
            if (row.entityType === 'Invoices' && row['salesOrder_ID']) {
                // Invoice → SalesOrder → Customer
                const soQuery  = `SELECT "customer_ID" FROM "smart_search_SalesOrders" WHERE "ID" = ?`;
                const soParams = [row['salesOrder_ID']];
                console.log('[enrich] Query:', soQuery);
                console.log('[enrich] Params:', soParams);
                let so;
                try {
                    const soRows = await execSql(soQuery, soParams);
                    so = soRows?.[0];
                    console.log('[enrich] Result:', JSON.stringify(so));
                } catch (err) {
                    console.log('[enrich] Error:', err?.message);
                    throw err;
                }
                const customerId = so?.['customer_ID'];
                const info = customerId
                    ? await fetchCustomerInfo(customerId)
                    : { customerName: 'Unknown', customerCountry: '' };
                enriched.push({ ...row, relatedData: info });

            } else if (row.entityType === 'SalesOrders' && row['customer_ID']) {
                const info = await fetchCustomerInfo(row['customer_ID']);
                enriched.push({ ...row, relatedData: info });

            } else if (row.entityType === 'SalesOrderItems' && row['salesOrder_ID']) {
                // SalesOrderItem → SalesOrder → Customer
                const soQuery  = `SELECT "customer_ID" FROM "smart_search_SalesOrders" WHERE "ID" = ?`;
                const soParams = [row['salesOrder_ID']];
                console.log('[enrich] Query:', soQuery);
                console.log('[enrich] Params:', soParams);
                let so;
                try {
                    const soRows = await execSql(soQuery, soParams);
                    so = soRows?.[0];
                    console.log('[enrich] Result:', JSON.stringify(so));
                } catch (err) {
                    console.log('[enrich] Error:', err?.message);
                    throw err;
                }
                const custId = so?.['customer_ID'];
                let customerName = 'Unknown';
                let customerCountry = '';
                if (custId) {
                    const custQuery  = `SELECT "name", "country" FROM "smart_search_Customers" WHERE "ID" = ?`;
                    const custParams = [custId];
                    console.log('[enrich] Query:', custQuery);
                    console.log('[enrich] Params:', custParams);
                    try {
                        const custRows = await execSql(custQuery, custParams);
                        const cust = custRows?.[0];
                        console.log('[enrich] Result:', JSON.stringify(cust));
                        customerName    = cust?.name    || 'Unknown';
                        customerCountry = cust?.country || '';
                    } catch (err) {
                        console.log('[enrich] Error:', err?.message);
                    }
                }
                enriched.push({
                    ...row,
                    relatedData: {
                        customerName,
                        customerCountry,
                        productName:     row.productName     || null,
                        productCategory: row.productCategory || null,
                    },
                });

            } else {
                enriched.push({ ...row, relatedData: null });
            }
        } catch (err) {
            console.log('[enrich] Error:', err?.message);
            enriched.push({ ...row, relatedData: { customerName: 'Unknown', customerCountry: '' } });
        }
    }

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
            const customerName    = row.relatedData?.customerName    || '';
            const customerCountry = row.relatedData?.customerCountry || '';
            const customerSuffix  = customerName
                ? ` | Customer: ${customerName}${customerCountry ? ` (${customerCountry})` : ''}`
                : '';

            if (entityType === 'Invoices') {
                const amt = row.amount !== undefined && row.amount !== null ? row.amount : 'N/A';
                const cur = row.currency || '';
                return `- ID: ${row.ID} | ${row.status || 'N/A'} | ${amt} ${cur} | Due: ${row.dueDate || 'N/A'}${customerSuffix}`;
            }
            if (entityType === 'SalesOrders') {
                const amt = row.totalAmount !== undefined && row.totalAmount !== null ? row.totalAmount : 'N/A';
                const cur = row.currency || '';
                return `- ID: ${row.ID} | ${row.status || 'N/A'} | ${amt} ${cur} | Date: ${row.orderDate || 'N/A'}${customerSuffix}`;
            }
            if (entityType === 'Customers') {
                return `- ${row.name || 'N/A'} | ${row.country || 'N/A'} | ${row.email || 'N/A'}`;
            }
            if (entityType === 'Products') {
                const cur = row.currency || '';
                return `- ${row.name || 'N/A'} | ${row.category || 'N/A'} | ${row.price || 'N/A'} ${cur} | Stock: ${row.stock || 'N/A'}`;
            }
            if (entityType === 'SalesOrderItems') {
                const cn  = row.relatedData?.customerName    || 'Unknown';
                const pn  = row.productName                  || row.relatedData?.productName     || 'N/A';
                const pc  = row.productCategory              || row.relatedData?.productCategory  || 'N/A';
                const cur = row.currency || '';
                return `- ${pn} | ${pc} | Qty: ${row.quantity || 'N/A'} | ${row.unitPrice || 'N/A'} ${cur} | Customer: ${cn}`;
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
