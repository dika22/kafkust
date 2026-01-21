import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface SecurityConfigPlaintext {
  type: 'Plaintext';
}

export interface SecurityConfigSsl {
  type: 'Ssl';
  config: {
    ca_location?: string;
    certificate_location?: string;
    key_location?: string;
    key_password?: string;
  };
}

export interface SecurityConfigSaslSsl {
  type: 'SaslSsl';
  config: {
    mechanism: 'Plain' | 'ScramSha256' | 'ScramSha512' | 'Gssapi' | 'OAuthBearer';
    username: string;
    ca_location?: string;
  };
}

export type SecurityConfig = SecurityConfigPlaintext | SecurityConfigSsl | SecurityConfigSaslSsl;

export interface Cluster {
  id: string;
  name: string;
  brokers: string;
  security: SecurityConfig;
}

interface ClusterRow {
  id: string;
  name: string;
  brokers: string;
  security_json: string;
  password: string | null;
}

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'kafkust.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS clusters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    brokers TEXT NOT NULL,
    security_json TEXT NOT NULL,
    password TEXT
  )
`);

export function listClusters(): Cluster[] {
  const rows = db.prepare('SELECT id, name, brokers, security_json FROM clusters').all() as ClusterRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    brokers: row.brokers,
    security: JSON.parse(row.security_json) as SecurityConfig,
  }));
}

export function getCluster(id: string): Cluster | null {
  const row = db
    .prepare('SELECT id, name, brokers, security_json FROM clusters WHERE id = ?')
    .get(id) as ClusterRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    brokers: row.brokers,
    security: JSON.parse(row.security_json) as SecurityConfig,
  };
}

export function saveCluster(cluster: Cluster, password?: string): void {
  const stmt = db.prepare(`
    INSERT INTO clusters (id, name, brokers, security_json, password)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      brokers = excluded.brokers,
      security_json = excluded.security_json,
      password = COALESCE(excluded.password, clusters.password)
  `);
  stmt.run(cluster.id, cluster.name, cluster.brokers, JSON.stringify(cluster.security), password ?? null);
}

export function updateCluster(cluster: Cluster, password?: string): void {
  const stmt = db.prepare(`
    UPDATE clusters
    SET name = ?, brokers = ?, security_json = ?, password = COALESCE(?, password)
    WHERE id = ?
  `);
  stmt.run(cluster.name, cluster.brokers, JSON.stringify(cluster.security), password ?? null, cluster.id);
}

export function deleteCluster(id: string): void {
  db.prepare('DELETE FROM clusters WHERE id = ?').run(id);
}

export function getPassword(clusterId: string): string | null {
  const row = db.prepare('SELECT password FROM clusters WHERE id = ?').get(clusterId) as { password: string | null } | undefined;
  return row?.password ?? null;
}

export function seedDefaultCluster(): void {
  const clusters = listClusters();
  if (clusters.length === 0) {
    const { v4: uuidv4 } = require('uuid');
    const defaultCluster: Cluster = {
      id: uuidv4(),
      name: 'Local Kafka',
      brokers: 'localhost:9092',
      security: { type: 'Plaintext' },
    };
    saveCluster(defaultCluster);
    console.log('Seeded default Local Kafka cluster');
  }
}
