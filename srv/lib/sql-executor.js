'use strict';

/**
 * Executes a validated SQL statement on an existing HANA connection.
 * @param {string} sql
 * @param {object} conn  - hana-client connection (singleton from getConnection())
 * @returns {Promise<Array>}
 */
async function executeSQL(sql, conn) {
    const rows = await new Promise((resolve, reject) => {
        conn.exec(sql, (err, result) => {
            if (err) reject(new Error(`SQL execution failed: ${err.message}`));
            else resolve(result || []);
        });
    });

    console.log(`[sql-executor] Returned ${rows.length} rows`);
    return rows;
}

/**
 * Formats raw SQL result rows as a labeled text block for Llama.
 * @param {Array}  rows
 * @param {string} query
 * @returns {string}
 */
function formatSQLContext(rows, query) {
    const rowLines = rows.map(r => JSON.stringify(r)).join('\n');
    return (
        `=== ANALYTICAL RESULTS (${rows.length} rows) ===\n` +
        `These are exact database results. Do not recalculate.\n` +
        rowLines
    );
}

module.exports = { executeSQL, formatSQLContext };
