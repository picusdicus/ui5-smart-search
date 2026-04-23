'use strict';

require('dotenv').config();

const hana = require('@sap/hana-client');

const CONN_PARAMS = {
    serverNode:             `${process.env.HANA_HOST}:${process.env.HANA_PORT || 443}`,
    uid:                    process.env.HANA_USER || 'DBADMIN',
    pwd:                    process.env.HANA_PASSWORD,
    encrypt:                'true',
    sslValidateCertificate: 'false',
};

const CHECK_TABLE_SQL = `
SELECT COUNT(*) AS CNT FROM SYS.TABLES
WHERE TABLE_NAME = 'smart_search_SalesOrderItems'
  AND SCHEMA_NAME = CURRENT_SCHEMA
`;

const CREATE_TABLE_SQL = `
CREATE COLUMN TABLE "smart_search_SalesOrderItems" (
  "ID"             NVARCHAR(36)    NOT NULL,
  "createdAt"      TIMESTAMP,
  "createdBy"      NVARCHAR(255),
  "modifiedAt"     TIMESTAMP,
  "modifiedBy"     NVARCHAR(255),
  "salesOrder_ID"  NVARCHAR(36),
  "product_ID"     NVARCHAR(36),
  "quantity"       INTEGER,
  "unitPrice"      DECIMAL(15, 2),
  "currency"       NVARCHAR(3),
  "EMBEDDING"      REAL_VECTOR(768),
  PRIMARY KEY("ID")
)
`;

async function run() {
    const conn = hana.createConnection();

    await new Promise((resolve, reject) => {
        conn.connect(CONN_PARAMS, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    console.log('[create-table] Connected to HANA.');

    try {
        const rows = await new Promise((resolve, reject) => {
            conn.exec(CHECK_TABLE_SQL, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });

        const exists = rows && rows[0] && parseInt(rows[0].CNT) > 0;
        if (exists) {
            console.log('[create-table] Table "smart_search_SalesOrderItems" already exists — skipping.');
        } else {
            await new Promise((resolve, reject) => {
                conn.exec(CREATE_TABLE_SQL, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            console.log('[create-table] Table "smart_search_SalesOrderItems" created successfully.');
        }
    } finally {
        await new Promise((resolve) => conn.disconnect(() => resolve()));
    }
}

run().catch((err) => {
    console.error('[create-table] Failed:', err.message);
    process.exit(1);
});
