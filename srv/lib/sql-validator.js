'use strict';

const ALLOWED_TABLES = new Set([
    'smart_search_Customers',
    'smart_search_Products',
    'smart_search_SalesOrders',
    'smart_search_SalesOrderItems',
    'smart_search_Invoices',
]);

const DANGEROUS_KEYWORDS = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE',
    'ALTER', 'EXEC', 'EXECUTE', '--', ';--',
];

/**
 * Validates a generated SQL string for safety before execution.
 * @param {string} sql
 * @returns {{ valid: boolean, error: string }}
 */
function validateSQL(sql) {
    if (!sql || typeof sql !== 'string') {
        return _reject('SQL is empty or not a string');
    }

    const trimmed = sql.trim();

    if (!/^SELECT\b/i.test(trimmed)) {
        return _reject('SQL must start with SELECT');
    }

    const upper = trimmed.toUpperCase();
    for (const kw of DANGEROUS_KEYWORDS) {
        if (upper.includes(kw)) {
            return _reject(`Forbidden keyword: ${kw}`);
        }
    }

    if (!/\bLIMIT\b|\bTOP\b/i.test(trimmed)) {
        return _reject('SQL must contain LIMIT or TOP');
    }

    // Extract table references: quoted "smart_search_X" or unquoted smart_search_X
    const tablePattern = /(?:FROM|JOIN)\s+"?(smart_search_\w+)"?/gi;
    let match;
    while ((match = tablePattern.exec(trimmed)) !== null) {
        const table = match[1];
        if (!ALLOWED_TABLES.has(table)) {
            return _reject(`Unauthorized table reference: ${table}`);
        }
    }

    const result = { valid: true, error: '' };
    console.log(`[sql-validator] valid=${result.valid} sql="${trimmed}"`);
    return result;
}

function _reject(reason) {
    const result = { valid: false, error: reason };
    console.log(`[sql-validator] valid=false error="${reason}"`);
    return result;
}

module.exports = { validateSQL };
