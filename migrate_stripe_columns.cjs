const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
});

async function runMigrations() {
    const client = await pool.connect();
    console.log('Conectado ao banco de dados para migração...');

    const migrations = [
        {
            name: 'Add stripe_account_id to restaurantes',
            sql: `ALTER TABLE restaurantes ADD COLUMN IF NOT EXISTS stripe_account_id VARCHAR(100) NULL`
        },
        {
            name: 'Add stripe_transfer_id to pagamentos',
            sql: `ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS stripe_transfer_id VARCHAR(100) NULL`
        },
        {
            name: 'Add transfer_status to pagamentos',
            sql: `ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS transfer_status VARCHAR(20) NULL`
        }
    ];

    try {
        for (const migration of migrations) {
            console.log(`Executando: ${migration.name}...`);
            await client.query(migration.sql);
            console.log(`Sucesso: ${migration.name}`);
        }
        console.log('\nTodas as migrações foram concluídas com sucesso!');
    } catch (err) {
        console.error('\nErro durante a migração:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runMigrations();
