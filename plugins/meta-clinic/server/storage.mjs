import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Connector credentials are not clinic records. Keep this store outside the
// checkout, encrypted with an operator-supplied key that is never saved here.
export function createStorage({ path, key }) {
  if (!path || !key || !/^[A-Za-z0-9+/]{43}=$/.test(key) || Buffer.from(key, 'base64').length !== 32)
    throw new Error('Configure an absolute connector store path and a base64 32-byte encryption key.');
  if (resolve(path) !== path) throw new Error('The connector store path must be absolute.');
  const encryptionKey = Buffer.from(key, 'base64');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  chmodSync(path, 0o600);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS connector_state (kind TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,key));');
  function encode(kind, id, value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    cipher.setAAD(Buffer.from(JSON.stringify([kind, id])));
    const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  }
  function decode(kind, id, encoded) {
    if (!encoded) return undefined;
    const bytes = Buffer.from(encoded, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(JSON.stringify([kind, id])));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
  }
  return {
    get: (kind, id) => decode(kind, id, db.prepare('SELECT value FROM connector_state WHERE kind=? AND key=?').get(kind, id)?.value),
    set: (kind, id, value) => { db.prepare('INSERT INTO connector_state(kind,key,value) VALUES(?,?,?) ON CONFLICT(kind,key) DO UPDATE SET value=excluded.value').run(kind, id, encode(kind, id, value)); },
    delete: (kind, id) => { db.prepare('DELETE FROM connector_state WHERE kind=? AND key=?').run(kind, id); },
    take: (kind, id) => decode(kind, id, db.prepare('DELETE FROM connector_state WHERE kind=? AND key=? RETURNING value').get(kind, id)?.value),
    list: kind => db.prepare('SELECT key,value FROM connector_state WHERE kind=?').all(kind).map(row => ({ key: row.key, value: decode(kind, row.key, row.value) })),
    transaction: action => {
      db.exec('BEGIN IMMEDIATE');
      try { const value = action(); db.exec('COMMIT'); return value; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close: () => { db.close(); encryptionKey.fill(0); },
  };
}
