import { supabase } from './supabase';
import { getDB } from '../db/database';

export async function syncNow() {
  const db = await getDB();

  const [res] = await db.executeSql(
    `SELECT * FROM sync_queue WHERE synced = 0 ORDER BY created_at ASC;`
  );

  for (let i = 0; i < res.rows.length; i++) {
    const item = res.rows.item(i);

    const { error } = await supabase
      .from(item.table_name)
      .upsert(JSON.parse(item.payload));

    if (!error) {
      await db.executeSql(
        `UPDATE sync_queue SET synced = 1 WHERE id = ?;`,
        [item.id]
      );
    }
  }
}