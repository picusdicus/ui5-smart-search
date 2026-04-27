'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const hana = require('@sap/hana-client');

const { embedText, serializeEmbedding } = require('./embeddings');

// ---------------------------------------------------------------------------
// CSV helpers (no extra npm dependencies)
// ---------------------------------------------------------------------------

/**
 * Parses a CSV string into an array of objects keyed by the header row.
 * Handles fields quoted with double-quotes (including embedded commas).
 *
 * @param {string} csvText - Raw CSV content.
 * @returns {Array<object>} Parsed rows as plain objects.
 */
function parseCsv(csvText) {
    const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const headers = splitCsvLine(lines[0]);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = splitCsvLine(line);
        const row = {};
        headers.forEach((header, idx) => {
            row[header.trim()] = (values[idx] || '').trim();
        });
        rows.push(row);
    }
    return rows;
}

/**
 * Splits a single CSV line respecting double-quoted fields.
 *
 * @param {string} line - A single CSV line.
 * @returns {string[]} Array of field values with surrounding quotes removed.
 */
function splitCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

// ---------------------------------------------------------------------------
// HANA helpers
// ---------------------------------------------------------------------------

/**
 * Opens an async HANA connection from environment variables.
 *
 * @returns {Promise<object>} Connected hana-client connection.
 */
async function createConnection() {
    const conn = hana.createConnection();
    await new Promise((resolve, reject) => {
        conn.connect(
            {
                serverNode:             `${process.env.HANA_HOST}:${process.env.HANA_PORT || 443}`,
                uid:                    process.env.HANA_USER || 'DBADMIN',
                pwd:                    process.env.HANA_PASSWORD,
                encrypt:                'true',
                sslValidateCertificate: 'false',
            },
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
    return conn;
}

/**
 * Executes a parameterised SQL statement and returns a Promise.
 *
 * @param {object} conn   - An open hana-client connection.
 * @param {string} sql    - Parameterised SQL string.
 * @param {Array}  params - Bind parameters.
 * @returns {Promise<void>}
 */
function execSql(conn, sql, params) {
    return new Promise((resolve, reject) => {
        conn.exec(sql, params, (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

// ---------------------------------------------------------------------------
// Seed configuration
// ---------------------------------------------------------------------------

const SEED_DIR = path.join(__dirname, '../../db/src/seed-data');

/**
 * Entity configurations: CSV file, HANA table, and text-builder for embedding input.
 */
const ENTITIES = [
    {
        name:   'Customers',
        file:   'smart.search.Customers.csv',
        table:  'smart_search_Customers',
        textFn: (r) => `${r.name} customer from ${r.country}. Email: ${r.email}. Address: ${r.address}`,
        upsertCols: (r, buf) => ({
            cols:   ['"ID"', '"name"', '"email"', '"phone"', '"address"', '"country"', '"EMBEDDING"'],
            params: [r.ID, r.name, r.email, r.phone, r.address, r.country, buf],
        }),
    },
    {
        name:   'Products',
        file:   'smart.search.Products.csv',
        table:  'smart_search_Products',
        textFn: (r) => `${r.name}. Category: ${r.category}. Description: ${r.description}. Price: ${r.price} ${r.currency}. Stock: ${r.stock} units`,
        upsertCols: (r, buf) => ({
            cols:   ['"ID"', '"name"', '"description"', '"category"', '"price"', '"currency"', '"stock"', '"EMBEDDING"'],
            params: [r.ID, r.name, r.description, r.category, parseFloat(r.price)||0, r.currency, parseInt(r.stock)||0, buf],
        }),
    },
    {
        name:   'SalesOrders',
        file:   'smart.search.SalesOrders.csv',
        table:  'smart_search_SalesOrders',
        textFn: (r) => `Sales order status ${r.status} dated ${r.orderDate}. Total amount: ${r.totalAmount} ${r.currency}. Notes: ${r.notes}`,
        upsertCols: (r, buf) => ({
            cols:   ['"ID"', '"orderDate"', '"status"', '"customer_ID"', '"totalAmount"', '"currency"', '"notes"', '"EMBEDDING"'],
            params: [r.ID, r.orderDate, r.status, r.customer_ID, parseFloat(r.totalAmount)||0, r.currency, r.notes, buf],
        }),
    },
    {
        name:   'SalesOrderItems',
        file:   'smart.search.SalesOrderItems.csv',
        table:  'smart_search_SalesOrderItems',
        textFn: (r) => `quantity ${r.quantity} units at ${r.unitPrice} ${r.currency}`,
        upsertCols: (r, buf) => ({
            cols:   ['"ID"', '"salesOrder_ID"', '"product_ID"', '"quantity"', '"unitPrice"', '"currency"', '"EMBEDDING"'],
            params: [r.ID, r.salesOrder_ID, r.product_ID, parseInt(r.quantity)||0, parseFloat(r.unitPrice)||0, r.currency, buf],
        }),
    },
    {
        name:   'Invoices',
        file:   'smart.search.Invoices.csv',
        table:  'smart_search_Invoices',
        textFn: (r) => `${r.status} invoice of ${r.amount} ${r.currency}. Due date: ${r.dueDate}. Invoice date: ${r.invoiceDate}. Notes: ${r.notes}`,
        upsertCols: (r, buf) => ({
            cols:   ['"ID"', '"invoiceDate"', '"dueDate"', '"status"', '"salesOrder_ID"', '"amount"', '"currency"', '"notes"', '"EMBEDDING"'],
            params: [r.ID, r.invoiceDate, r.dueDate, r.status, r.salesOrder_ID, parseFloat(r.amount)||0, r.currency, r.notes, buf],
        }),
    },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const conn = await createConnection();
    console.log('[seed] Connected to HANA.');

    try {
        for (const entity of ENTITIES) {
            const csvPath = path.join(SEED_DIR, entity.file);
            const csvText = fs.readFileSync(csvPath, 'utf8');
            const rows    = parseCsv(csvText);
            const total   = rows.length;

            console.log(`[seed] Processing ${total} rows for ${entity.name} ...`);

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const vec = await embedText(entity.textFn(row), false);
                // TO_REAL_VECTOR() expects a JSON array string, not binary
                const vecStr = '[' + Array.from(vec).join(',') + ']';

                const { cols, params } = entity.upsertCols(row, vecStr);
                // Replace last placeholder with TO_REAL_VECTOR(?) for the embedding column
                const placeholders = cols.map((_, idx) =>
                    idx === cols.length - 1 ? 'TO_REAL_VECTOR(?)' : '?'
                );
                const sql = `UPSERT "${entity.table}" (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) WITH PRIMARY KEY`;
                await execSql(conn, sql, params);

                console.log(`[seed] ${entity.name} ${i + 1}/${total}`);
            }
        }
    } finally {
        await new Promise((resolve) => conn.disconnect(() => resolve()));
    }

    console.log('[seed] Done.');
    process.exit(0);
}

main().catch((err) => {
    console.error('[seed] Fatal error:', err);
    process.exit(1);
});
