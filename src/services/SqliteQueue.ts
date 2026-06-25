import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDiagnosticLog } from './Logger';

let db: any = null;
let isSqliteAvailable = false;

/**
 * Initialize the SQLite database for offline transaction storage.
 * Seamlessly falls back to AsyncStorage if SQLite is unavailable (e.g. web dashboards or headless runs).
 */
export const initQueueDatabase = async (): Promise<void> => {
  try {
    // Detect environment capability
    if (SQLite && (SQLite as any).openDatabaseAsync) {
      db = await (SQLite as any).openDatabaseAsync('find_my_family_queue.db');
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS location_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          payload TEXT NOT NULL,
          createdAt INTEGER NOT NULL
        );
      `);
      isSqliteAvailable = true;
      console.log('[SqliteQueue] SQLite Async Database initialized successfully.');
      await addDiagnosticLog('[SqliteQueue] SQLite database initialized successfully.');
    } else if (SQLite && (SQLite as any).openDatabase) {
      // Legacy Expo SQLite fallback support
      db = (SQLite as any).openDatabase('find_my_family_queue.db');
      await new Promise<void>((resolve) => {
        db.transaction(
          (tx: any) => {
            tx.executeSql(
              'CREATE TABLE IF NOT EXISTS location_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, createdAt INTEGER NOT NULL);',
              [],
              () => {
                isSqliteAvailable = true;
                console.log('[SqliteQueue] SQLite Legacy Database initialized successfully.');
                resolve();
              },
              (_: any, err: any) => {
                console.warn('[SqliteQueue] SQLite legacy query failed:', err);
                resolve();
              }
            );
          },
          (err: any) => {
            console.warn('[SqliteQueue] SQLite transaction failed:', err);
            resolve();
          }
        );
      });
    } else {
      isSqliteAvailable = false;
      console.log(
        '[SqliteQueue] SQLite is not supported in this runtime. Falling back to AsyncStorage.'
      );
    }
  } catch (err) {
    console.warn('[SqliteQueue] Failed to initialize SQLite, falling back to AsyncStorage:', err);
    isSqliteAvailable = false;
  }
};

/**
 * Push an unsynced transaction payload to the offline-first queue.
 */
export const queueTransaction = async (payload: any): Promise<void> => {
  const payloadStr = JSON.stringify(payload);
  const createdAt = Date.now();

  if (isSqliteAvailable && db) {
    try {
      if (db.runAsync) {
        await db.runAsync('INSERT INTO location_queue (payload, createdAt) VALUES (?, ?);', [
          payloadStr,
          createdAt,
        ]);
        console.log('[SqliteQueue] Queued transaction in SQLite.');
        await addDiagnosticLog('[SqliteQueue] Location cached offline in SQLite.');
        return;
      } else {
        await new Promise<void>((resolve, reject) => {
          db.transaction((tx: any) => {
            tx.executeSql(
              'INSERT INTO location_queue (payload, createdAt) VALUES (?, ?);',
              [payloadStr, createdAt],
              () => resolve(),
              (_: any, err: any) => reject(err)
            );
          });
        });
        console.log('[SqliteQueue] Queued transaction in SQLite (Legacy).');
        await addDiagnosticLog('[SqliteQueue] Location cached offline in SQLite.');
        return;
      }
    } catch (err) {
      console.warn(
        '[SqliteQueue] SQLite queue insertion failed, falling back to AsyncStorage:',
        err
      );
    }
  }

  // AsyncStorage fallback
  try {
    const queueStr = await AsyncStorage.getItem('location_queue_fallback');
    const queue = queueStr ? JSON.parse(queueStr) : [];
    queue.push({ id: createdAt, payload: payloadStr, createdAt });
    await AsyncStorage.setItem('location_queue_fallback', JSON.stringify(queue));
    console.log('[SqliteQueue] Queued transaction in AsyncStorage.');
    await addDiagnosticLog('[SqliteQueue] Location cached offline in AsyncStorage fallback.');
  } catch (err) {
    console.error('[SqliteQueue] Fallback queue insertion failed:', err);
  }
};

/**
 * Get all queued transactions ordered by creation date (FIFO).
 */
export const getQueuedTransactions = async (): Promise<{ id: number; payload: any }[]> => {
  if (isSqliteAvailable && db) {
    try {
      if (db.getAllAsync) {
        const rows = await db.getAllAsync(
          'SELECT id, payload FROM location_queue ORDER BY id ASC;'
        );
        return rows.map((r: any) => ({ id: r.id, payload: JSON.parse(r.payload) }));
      } else {
        return await new Promise<{ id: number; payload: any }[]>((resolve, reject) => {
          db.transaction((tx: any) => {
            tx.executeSql(
              'SELECT id, payload FROM location_queue ORDER BY id ASC;',
              [],
              (_: any, result: any) => {
                const items: any[] = [];
                for (let i = 0; i < result.rows.length; i++) {
                  const row = result.rows.item(i);
                  items.push({ id: row.id, payload: JSON.parse(row.payload) });
                }
                resolve(items);
              },
              (_: any, err: any) => reject(err)
            );
          });
        });
      }
    } catch (err) {
      console.warn('[SqliteQueue] SQLite select failed, trying AsyncStorage fallback:', err);
    }
  }

  // AsyncStorage fallback
  try {
    const queueStr = await AsyncStorage.getItem('location_queue_fallback');
    if (queueStr) {
      const queue = JSON.parse(queueStr);
      return queue.map((q: any) => ({ id: q.id, payload: JSON.parse(q.payload) }));
    }
  } catch (err) {
    console.error('[SqliteQueue] Fallback queue retrieval failed:', err);
  }
  return [];
};

/**
 * Remove a successfully synced transaction from the offline queue.
 */
export const removeQueuedTransaction = async (id: number): Promise<void> => {
  if (isSqliteAvailable && db) {
    try {
      if (db.runAsync) {
        await db.runAsync('DELETE FROM location_queue WHERE id = ?;', [id]);
        return;
      } else {
        await new Promise<void>((resolve, reject) => {
          db.transaction((tx: any) => {
            tx.executeSql(
              'DELETE FROM location_queue WHERE id = ?;',
              [id],
              () => resolve(),
              (_: any, err: any) => reject(err)
            );
          });
        });
        return;
      }
    } catch (err) {
      console.warn('[SqliteQueue] SQLite delete failed, trying AsyncStorage fallback:', err);
    }
  }

  // AsyncStorage fallback
  try {
    const queueStr = await AsyncStorage.getItem('location_queue_fallback');
    if (queueStr) {
      const queue = JSON.parse(queueStr);
      const filtered = queue.filter((q: any) => q.id !== id);
      await AsyncStorage.setItem('location_queue_fallback', JSON.stringify(filtered));
    }
  } catch (err) {
    console.error('[SqliteQueue] Fallback queue delete failed:', err);
  }
};
