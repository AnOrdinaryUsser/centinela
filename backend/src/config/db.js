import pg from 'pg'
import 'dotenv/config'

const { Pool } = pg

// Connection pool to the PostgreSQL/PostGIS database. All spatial queries
// and statistics queries in this backend go through this pool.
export const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB || 'centinela_cyl',
  user: process.env.POSTGRES_USER || 'centinela',
  password: process.env.POSTGRES_PASSWORD || 'change_me',
})

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err)
})

export default pool
