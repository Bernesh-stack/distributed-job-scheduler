const fs = require('fs');
const path = require('path');
const { pool } = require('./db');
async function migrate() {
  console.log('Running migrations...');
  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    console.log(`  Running: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await pool.query(sql);
      console.log(`  ✓ ${file} applied successfully`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log(`  ⊘ ${file} already applied (skipping)`);
      } else {
        console.error(`  ✗ ${file} failed:`, error.message);
        throw error;
      }
    }
  }
  console.log('Migrations complete!');
  await pool.end();
}
migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});