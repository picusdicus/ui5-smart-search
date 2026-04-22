'use strict';

const hana = require('@sap/hana-client');

/** @type {Record<string, string>} Maps CAP entity names to HANA table names. */
const ENTITY_TABLE_MAP = {
    'Customers':   'smart_search_Customers',
    'Products':    'smart_search_Products',
    'SalesOrders': 'smart_search_SalesOrders',
    'Invoices':    'smart_search_Invoices',
};

/**
 * Performs a cosine-similarity vector search against a HANA Cloud table.
 * Connection parameters are read exclusively from environment variables.
 *
 * @param {string}       entityName  - One of: 'Customers', 'Products', 'SalesOrders', 'Invoices'.
 * @param {Float32Array} queryVector - The query embedding (768 dims from nomic-embed-text).
 * @param {number}       [topK=10]   - Number of top results to return.
 * @returns {Promise<Array<object>>} Array of row objects each containing a SCORE property.
 * @throws {Error} If the entity name is unknown or the HANA query fails.
 */
async function vectorSearch(entityName, queryVector, topK = 10) {
    const tableName = ENTITY_TABLE_MAP[entityName];
    if (!tableName) {
        throw new Error(
            `[hana-vector] Unknown entity: ${entityName}. Valid values: ${Object.keys(ENTITY_TABLE_MAP).join(', ')}`
        );
    }

    const connParams = {
        serverNode:             `${process.env.HANA_HOST}:${process.env.HANA_PORT || 443}`,
        uid:                    process.env.HANA_USER || 'DBADMIN',
        pwd:                    process.env.HANA_PASSWORD,
        encrypt:                'true',
        sslValidateCertificate: 'false',
    };

    // TO_REAL_VECTOR() expects a JSON array string: '[0.1, 0.2, ...]'
    const queryVecStr = '[' + Array.from(queryVector).join(',') + ']';

    const sql =
        `SELECT TOP ${topK} *, COSINE_SIMILARITY("EMBEDDING", TO_REAL_VECTOR(?)) AS "SCORE" ` +
        `FROM "${tableName}" WHERE "EMBEDDING" IS NOT NULL ORDER BY "SCORE" DESC`;

    const conn = hana.createConnection();

    try {
        // Connect (callback → Promise)
        await new Promise((resolve, reject) => {
            conn.connect(connParams, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Execute query (callback → Promise)
        const rows = await new Promise((resolve, reject) => {
            conn.exec(sql, [queryVecStr], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        return rows;
    } finally {
        // Always close connection
        await new Promise((resolve) => {
            conn.disconnect(() => resolve());
        });
    }
}

module.exports = { vectorSearch };
