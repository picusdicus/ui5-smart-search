'use strict';

const { getConnection } = require('./hana-vector');
const { fetchBusinessPartners, fetchBPAddress } = require('./s4-client');
const { embedText } = require('./embeddings');

function execSQL(conn, sql, params) {
    return new Promise((resolve, reject) => {
        conn.exec(sql, params, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}

async function ensureSyncLogTable() {
    const conn = await getConnection();
    const rows = await execSQL(conn,
        `SELECT COUNT(*) AS "cnt" FROM SYS.TABLES WHERE TABLE_NAME = 'smart_search_SyncLog' AND SCHEMA_NAME = CURRENT_SCHEMA`,
        []
    );
    if (rows[0].cnt > 0) return;
    await execSQL(conn,
        `CREATE TABLE "smart_search_SyncLog" (` +
        `"entityName" NVARCHAR(50) NOT NULL PRIMARY KEY, ` +
        `"lastSyncTime" TIMESTAMP, ` +
        `"recordsSynced" INTEGER)`,
        []
    );
    console.log('[s4-sync] Created smart_search_SyncLog table');
}

async function getLastSyncTime(entityName) {
    const conn = await getConnection();
    const rows = await execSQL(
        conn,
        `SELECT "lastSyncTime" FROM "smart_search_SyncLog" WHERE "entityName" = ?`,
        [entityName]
    );
    if (!rows || rows.length === 0) return null;
    const raw = rows[0].lastSyncTime;
    return raw ? new Date(raw) : null;
}

async function updateSyncLog(entityName, count) {
    const conn = await getConnection();
    const now = new Date().toISOString();
    await execSQL(
        conn,
        `UPSERT "smart_search_SyncLog" ("entityName", "lastSyncTime", "recordsSynced") VALUES (?, ?, ?) WITH PRIMARY KEY`,
        [entityName, now, count]
    );
}

async function fullSync() {
    console.log('[s4-sync] Starting fullSync for Customers');
    await ensureSyncLogTable();
    let successCount = 0;
    let errorCount = 0;

    try {
        const bps = await fetchBusinessPartners(500);
        const conn = await getConnection();

        for (let i = 0; i < bps.length; i++) {
            const bp = bps[i];

            if (bp.isBlocked === true) continue;

            try {
                const country = await fetchBPAddress(bp.id);
                const text = `${bp.name} ${country} ${bp.language}`.trim();
                const vector = await embedText(text, false);
                const vecStr = '[' + Array.from(vector).join(',') + ']';

                await execSQL(
                    conn,
                    `UPSERT "smart_search_Customers" ("ID", "name", "country", "EMBEDDING") VALUES (?, ?, ?, TO_REAL_VECTOR(?)) WITH PRIMARY KEY`,
                    [bp.id, bp.name, country, vecStr]
                );

                successCount++;

                if (successCount % 20 === 0) {
                    console.log(`[s4-sync] Progress: ${successCount} records synced`);
                }
            } catch (err) {
                console.error(`[s4-sync] Error syncing BP ${bp.id}:`, err.message);
                errorCount++;
            }
        }

        await updateSyncLog('Customers', successCount);
        console.log(`[s4-sync] fullSync complete — synced: ${successCount}, errors: ${errorCount}`);
        return { synced: successCount, errors: errorCount };
    } catch (err) {
        console.error('[s4-sync] fullSync failed:', err.message);
        throw err;
    }
}

async function deltaSync() {
    console.log('[s4-sync] Starting deltaSync for Customers');

    try {
        await ensureSyncLogTable();
        const lastSync = await getLastSyncTime('Customers');

        if (!lastSync) {
            console.log('[s4-sync] No previous sync found, falling back to fullSync');
            return fullSync();
        }

        const bps = await fetchBusinessPartners(500);
        const changed = bps.filter(bp => bp.lastChanged && new Date(bp.lastChanged) > lastSync);
        console.log(`[s4-sync] deltaSync: ${changed.length} records changed since ${lastSync.toISOString()}`);

        const conn = await getConnection();
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < changed.length; i++) {
            const bp = changed[i];

            if (bp.isBlocked === true) continue;

            try {
                const text = `${bp.name} ${bp.language}`;
                const vector = await embedText(text, false);
                const vecStr = '[' + Array.from(vector).join(',') + ']';

                await execSQL(
                    conn,
                    `UPSERT "smart_search_Customers" ("ID", "name", "EMBEDDING") VALUES (?, ?, TO_REAL_VECTOR(?)) WITH PRIMARY KEY`,
                    [bp.id, bp.name, vecStr]
                );

                successCount++;

                if (successCount % 20 === 0) {
                    console.log(`[s4-sync] Progress: ${successCount} records synced`);
                }
            } catch (err) {
                console.error(`[s4-sync] Error syncing BP ${bp.id}:`, err.message);
                errorCount++;
            }
        }

        await updateSyncLog('Customers', successCount);
        console.log(`[s4-sync] deltaSync complete — synced: ${successCount}, errors: ${errorCount}`);
        return { synced: successCount };
    } catch (err) {
        console.error('[s4-sync] deltaSync failed:', err.message);
        throw err;
    }
}

module.exports = { getLastSyncTime, updateSyncLog, fullSync, deltaSync };
