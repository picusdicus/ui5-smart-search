'use strict';

require('dotenv').config();
const hana = require('@sap/hana-client');

const TABLES = [
    {
        name: 'smart_search_Customers',
        ddl: `CREATE COLUMN TABLE "smart_search_Customers" (
  "ID"         NVARCHAR(36)   NOT NULL,
  "createdAt"  TIMESTAMP,
  "createdBy"  NVARCHAR(255),
  "modifiedAt" TIMESTAMP,
  "modifiedBy" NVARCHAR(255),
  "name"       NVARCHAR(100),
  "email"      NVARCHAR(200),
  "phone"      NVARCHAR(50),
  "address"    NVARCHAR(500),
  "country"    NVARCHAR(100),
  "EMBEDDING"  REAL_VECTOR(768),
  PRIMARY KEY("ID")
)`,
    },
    {
        name: 'smart_search_Products',
        ddl: `CREATE COLUMN TABLE "smart_search_Products" (
  "ID"          NVARCHAR(36)    NOT NULL,
  "createdAt"   TIMESTAMP,
  "createdBy"   NVARCHAR(255),
  "modifiedAt"  TIMESTAMP,
  "modifiedBy"  NVARCHAR(255),
  "name"        NVARCHAR(200),
  "description" NVARCHAR(1000),
  "category"    NVARCHAR(100),
  "price"       DECIMAL(15,2),
  "currency"    NVARCHAR(3),
  "stock"       INTEGER,
  "EMBEDDING"   REAL_VECTOR(768),
  PRIMARY KEY("ID")
)`,
    },
    {
        name: 'smart_search_SalesOrders',
        ddl: `CREATE COLUMN TABLE "smart_search_SalesOrders" (
  "ID"          NVARCHAR(36)  NOT NULL,
  "createdAt"   TIMESTAMP,
  "createdBy"   NVARCHAR(255),
  "modifiedAt"  TIMESTAMP,
  "modifiedBy"  NVARCHAR(255),
  "orderDate"   DATE,
  "status"      NVARCHAR(50),
  "customer_ID" NVARCHAR(36),
  "totalAmount" DECIMAL(15,2),
  "currency"    NVARCHAR(3),
  "notes"       NVARCHAR(1000),
  "EMBEDDING"   REAL_VECTOR(768),
  PRIMARY KEY("ID")
)`,
    },
    {
        name: 'smart_search_Invoices',
        ddl: `CREATE COLUMN TABLE "smart_search_Invoices" (
  "ID"             NVARCHAR(36)  NOT NULL,
  "createdAt"      TIMESTAMP,
  "createdBy"      NVARCHAR(255),
  "modifiedAt"     TIMESTAMP,
  "modifiedBy"     NVARCHAR(255),
  "invoiceDate"    DATE,
  "dueDate"        DATE,
  "status"         NVARCHAR(50),
  "salesOrder_ID"  NVARCHAR(36),
  "amount"         DECIMAL(15,2),
  "currency"       NVARCHAR(3),
  "notes"          NVARCHAR(1000),
  "EMBEDDING"      REAL_VECTOR(768),
  PRIMARY KEY("ID")
)`,
    },
];

function exec(conn, sql, params = []) {
    return new Promise((resolve, reject) => {
        conn.exec(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function tableExists(conn, name) {
    const rows = await exec(
        conn,
        `SELECT COUNT(*) AS CNT FROM TABLES WHERE SCHEMA_NAME = CURRENT_SCHEMA AND TABLE_NAME = ?`,
        [name]
    );
    return rows[0].CNT > 0;
}

async function main() {
    const conn = hana.createConnection();
    await new Promise((resolve, reject) => {
        conn.connect({
            serverNode:             `${process.env.HANA_HOST}:${process.env.HANA_PORT || 443}`,
            uid:                    process.env.HANA_USER || 'DBADMIN',
            pwd:                    process.env.HANA_PASSWORD,
            encrypt:                'true',
            sslValidateCertificate: 'false',
        }, (err) => err ? reject(err) : resolve());
    });
    console.log('[deploy] Connected to HANA.');

    try {
        for (const table of TABLES) {
            const exists = await tableExists(conn, table.name);
            if (exists) {
                console.log(`[deploy] SKIP  ${table.name} (already exists)`);
            } else {
                await exec(conn, table.ddl);
                console.log(`[deploy] OK    ${table.name} created`);
            }
        }
    } finally {
        await new Promise((resolve) => conn.disconnect(() => resolve()));
    }

    console.log('[deploy] Done.');
    process.exit(0);
}

main().catch((err) => {
    console.error('[deploy] Fatal error:', err.message);
    process.exit(1);
});
