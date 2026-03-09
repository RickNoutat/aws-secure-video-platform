import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import pg from "pg";

const { Pool } = pg;

const secretsClient = new SecretsManagerClient();
let pool = null;
let cachedSecret = null;

/**
 * Retrieves DB credentials from AWS Secrets Manager.
 * Caches the secret for reuse across Lambda invocations.
 */
async function getDbCredentials() {
  if (cachedSecret) return cachedSecret;

  const command = new GetSecretValueCommand({
    SecretId: process.env.DB_SECRET_ARN,
  });

  const response = await secretsClient.send(command);
  cachedSecret = JSON.parse(response.SecretString);
  return cachedSecret;
}

/**
 * Returns a PostgreSQL connection pool.
 * Reuses the pool across invocations within the same Lambda container.
 */
export async function getPool() {
  if (pool) return pool;

  const credentials = await getDbCredentials();

  pool = new Pool({
    host: credentials.host,
    port: credentials.port,
    database: credentials.dbname,
    user: credentials.username,
    password: credentials.password,
    max: 5,
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 10000,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  pool.on("error", (err) => {
    console.error("Unexpected pool error:", err);
    pool = null;
    cachedSecret = null;
  });

  return pool;
}

/**
 * Executes a query using the connection pool.
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
export async function query(text, params) {
  const db = await getPool();
  const start = Date.now();
  const result = await db.query(text, params);
  const duration = Date.now() - start;
  console.log("Query executed", { text, duration, rows: result.rowCount });
  return result;
}
