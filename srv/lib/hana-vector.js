'use strict';

const hana = require('@sap/hana-client');

/** @type {Record<string, string>} Maps CAP entity names to HANA table names. */
const ENTITY_TABLE_MAP = {
    'Customers':   'smart_search_Customers',
    'Products':    'smart_search_Products',
    'SalesOrders': 'smart_search_SalesOrders',
    'Invoices':    'smart_search_Invoices',
};

/** Connection parameters read once at module load from environment variables. */
const CONN_PARAMS = {
    serverNode:             `${process.env.HANA_HOST}:${process.env.HANA_PORT || 443}`,
    uid:                    process.env.HANA_USER || 'DBADMIN',
    pwd:                    process.env.HANA_PASSWORD,
    encrypt:                'true',
    sslValidateCertificate: 'false',
};

/** Singleton HANA connection shared across all callers. */
let _connection = null;

/**
 * Returns a live HANA connection, creating or reconnecting as needed.
 * Verifies liveness with SELECT 1 FROM DUMMY before returning.
 *
 * @returns {Promise<object>} Connected hana-client connection.
 */
async function getConnection() {
    if (_connection) {
        try {
            await new Promise((resolve, reject) => {
                _connection.exec('SELECT 1 FROM DUMMY', [], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            return _connection;
        } catch (err) {
            console.warn('[hana-vector] Connection ping failed, reconnecting:', err.message);
            _connection = null;
        }
    }

    const conn = hana.createConnection();
    await new Promise((resolve, reject) => {
        conn.connect(CONN_PARAMS, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
    _connection = conn;
    console.log('[hana-vector] New HANA connection established.');
    return _connection;
}

/**
 * Executes a parameterised SQL statement on an existing connection.
 *
 * @param {object}   conn   - An open hana-client connection.
 * @param {string}   sql    - Parameterised SQL string.
 * @param {Array}    params - Bind parameters.
 * @returns {Promise<Array>}
 */
function execOnConn(conn, sql, params) {
    return new Promise((resolve, reject) => {
        conn.exec(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
}

/**
 * Performs a cosine-similarity vector search using a provided connection.
 *
 * @param {object}       conn        - An open hana-client connection.
 * @param {string}       entityName  - One of: 'Customers', 'Products', 'SalesOrders', 'Invoices'.
 * @param {Float32Array} queryVector - The query embedding (768 dims from nomic-embed-text).
 * @param {number}       [topK=10]   - Number of top results to return.
 * @returns {Promise<Array<object>>} Array of row objects each containing a SCORE property.
 */
async function vectorSearchWithConn(conn, entityName, queryVector, topK = 10) {
    const tableName = ENTITY_TABLE_MAP[entityName];
    if (!tableName) {
        throw new Error(
            `[hana-vector] Unknown entity: ${entityName}. Valid values: ${Object.keys(ENTITY_TABLE_MAP).join(', ')}`
        );
    }

    const queryVecStr = '[' + Array.from(queryVector).join(',') + ']';
    const sql =
        `SELECT TOP ${topK} *, COSINE_SIMILARITY("EMBEDDING", TO_REAL_VECTOR(?)) AS "SCORE" ` +
        `FROM "${tableName}" WHERE "EMBEDDING" IS NOT NULL ORDER BY "SCORE" DESC`;

    return execOnConn(conn, sql, [queryVecStr]);
}

/**
 * Performs a cosine-similarity vector search against a HANA Cloud table.
 * Reuses the module-level singleton connection.
 *
 * @param {string}       entityName  - One of: 'Customers', 'Products', 'SalesOrders', 'Invoices'.
 * @param {Float32Array} queryVector - The query embedding (768 dims from nomic-embed-text).
 * @param {number}       [topK=10]   - Number of top results to return.
 * @returns {Promise<Array<object>>} Array of row objects each containing a SCORE property.
 * @throws {Error} If the entity name is unknown or the HANA query fails.
 */
async function vectorSearch(entityName, queryVector, topK = 10) {
    const conn = await getConnection();
    return vectorSearchWithConn(conn, entityName, queryVector, topK);
}

/**
 * Runs vectorSearchWithConn() for multiple entities sequentially on a single connection.
 * Applies entity weight to scores. Failures for individual entities are logged and skipped.
 *
 * @param {Array<{name: string, weight: number}>} entities       - Entities to search.
 * @param {Float32Array}                          queryVector    - The query embedding.
 * @param {number}                                [topKPerEntity=5] - Results per entity.
 * @returns {Promise<Map<string, Array>>} Map of entity name → weighted rows.
 */
async function parallelVectorSearch(entities, queryVector, topKPerEntity = 5) {
    const results = new Map();
    const conn = await getConnection();

    for (const { name, weight } of entities) {
        try {
            const rows = await vectorSearchWithConn(conn, name, queryVector, topKPerEntity);
            const weighted = rows.map(row => ({ ...row, SCORE: (row.SCORE || 0) * weight }));
            results.set(name, weighted);
        } catch (err) {
            console.error(`[hana-vector] Search failed for ${name}:`, err.message);
        }
    }

    return results;
}

module.exports = { vectorSearch, parallelVectorSearch, getConnection };
