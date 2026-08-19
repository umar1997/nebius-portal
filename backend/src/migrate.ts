import db from './db';

type ColumnInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

const tables = ['apps', 'users', 'refresh_tokens'] as const;

console.log('Running migrations...\n');

for (const table of tables) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
  console.log(`✓  ${table}  (${cols.length} columns)`);
  for (const col of cols) {
    const parts = [col.name.padEnd(16), col.type.padEnd(12)];
    if (col.pk)        parts.push('PRIMARY KEY');
    if (col.notnull)   parts.push('NOT NULL');
    if (col.dflt_value !== null) parts.push(`DEFAULT ${col.dflt_value}`);
    console.log(`   ${parts.join(' ')}`);
  }
  console.log();
}

console.log('All tables ready.');
db.close();
