import { afterAll, beforeAll, expect, test } from "bun:test"
import mysql from "mysql2/promise"
import type { Connection, RowDataPacket, ResultSetHeader } from "mysql2/promise"
import { spawn, type ChildProcess } from "node:child_process"
import { connect } from "node:net"

const HOST = process.env.HOST ?? "127.0.0.1"
const PORT = Number(process.env.PORT ?? 13307)
const DB = process.env.DB ?? "dolt_test"
const DOLT_DIR = process.env.DOLT_DIR ?? ""

let server: ChildProcess | null = null
let conn: Connection

function waitForPort(port: number, timeoutMs = 15_000): Promise<void> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    function poll() {
      const sock = connect(port, HOST, () => { sock.end(); resolve() })
      sock.on("error", () => {
        sock.destroy()
        if (Date.now() - start > timeoutMs) reject(new Error("port did not open"))
        else setTimeout(poll, 300)
      })
    }
    poll()
  })
}

async function createSchemaAndSeed(conn: Connection) {
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\``)
  await conn.query(`USE \`${DB}\``)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS employees (
      id INT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      department VARCHAR(50) NOT NULL,
      skills JSON,
      metadata JSON
    )
  `)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS skill_summary (
      skill VARCHAR(100) PRIMARY KEY,
      employee_count INT NOT NULL
    )
  `)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS debug_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      msg TEXT
    )
  `)
  // Idempotent seed — ignore duplicates so re-runs are safe
  await conn.query(`DELETE FROM employees`)
  await conn.query(`DELETE FROM skill_summary`)
  await conn.query(`DELETE FROM debug_log`)
  await conn.query(`
    INSERT INTO employees VALUES
      (1, 'Alice Chen',   'Engineering', JSON_ARRAY('python', 'sql', 'k8s'), JSON_OBJECT('level', 'senior', 'mentor', true)),
      (2, 'Bob Martinez', 'Engineering', JSON_ARRAY('java', 'aws', 'terraform'), JSON_OBJECT('level', 'staff', 'mentor', true)),
      (3, 'Carol Smith',  'Design',      JSON_ARRAY('figma', 'sketch', 'prototyping'), JSON_OBJECT('level', 'mid', 'remote', true)),
      (4, 'Dave Johnson', 'Product',     JSON_ARRAY('analytics', 'sql', 'user-research'), JSON_OBJECT('level', 'senior', 'remote', false)),
      (5, 'Eve Williams', 'Engineering', JSON_ARRAY('rust', 'python', 'distributed-systems'), JSON_OBJECT('level', 'senior', 'mentor', true)),
      (6, 'Frank Brown',  'Marketing',   JSON_ARRAY('content', 'seo', 'analytics'), JSON_OBJECT('level', 'mid', 'remote', true))
  `)
}

beforeAll(async () => {
  // If DOLT_DIR is set, start a local dolt sql-server for convenience
  if (DOLT_DIR) {
    server = spawn("dolt", ["sql-server", "--host", HOST, "--port", String(PORT)], {
      cwd: DOLT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    })
    server.stderr!.on("data", () => {})
    server.stdout!.on("data", () => {})
    await waitForPort(PORT)
  } else {
    // Assume server is already running (Docker, CI service, or manual)
    await waitForPort(PORT)
  }
  conn = await mysql.createConnection({ host: HOST, port: PORT, user: "root" })
  await createSchemaAndSeed(conn)
})

afterAll(async () => {
  try { await conn?.end() } catch {}
  if (server) server.kill("SIGTERM")
})

test("(A)  SELECT with CTE + JSON_TABLE works", async () => {
  const [rows] = await conn.query<RowDataPacket[]>(`
    WITH skill_list AS (
      SELECT e.id, e.name, s.value AS skill
      FROM employees e
      JOIN JSON_TABLE(e.skills, '$[*]' COLUMNS (value TEXT PATH '$')) s
    )
    SELECT sl.id, sl.name, sl.skill
    FROM skill_list sl
    WHERE sl.id = 1
  `)
  expect(rows).toHaveLength(3)
  const skills = (rows as any[]).map((r: any) => r.skill).sort()
  expect(skills).toEqual(["k8s", "python", "sql"])
})

test("(B)  INSERT … SELECT wrapping CTE + JSON_TABLE crashes Dolt", async () => {
  // BUG: Dolt should insert 15 aggregated skill rows into skill_summary, but
  // instead the server severs the MySQL connection (ECONNRESET).
  const sql = `
    INSERT INTO skill_summary (skill, employee_count)
    SELECT skill, COUNT(*) AS cnt
    FROM (
      WITH skill_list AS (
        SELECT e.id, e.name, s.value AS skill
        FROM employees e
        JOIN JSON_TABLE(e.skills, '$[*]' COLUMNS (value TEXT PATH '$')) s
      )
      SELECT * FROM skill_list
    ) AS subq
    GROUP BY skill
  `
  try {
    await conn.query<ResultSetHeader>(sql)
    // If we reach here the bug is fixed — verify the data was written
    const [rows] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS cnt FROM skill_summary")
    expect((rows as any[])[0]!.cnt).toBe(15)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    expect(msg).toMatch(/Connection lost|closed|ECONNRESET|invalid connection|cannot enqueue/)
    // Reconnect for subsequent tests
    try { await conn.ping() } catch {
      conn = await mysql.createConnection({ host: HOST, port: PORT, user: "root" })
      await conn.query(`USE \`${DB}\``)
    }
  }
})

test("(C)  INSERT … SELECT with CTE but NO JSON_TABLE works", async () => {
  const [result] = await conn.query<ResultSetHeader>(`
    INSERT INTO debug_log (msg)
    SELECT CONCAT(name, ' works in ', department)
    FROM (
      WITH dept AS (
        SELECT id, name, department FROM employees WHERE department = 'Engineering'
      )
      SELECT * FROM dept
    ) AS subq
  `)
  expect(result.affectedRows).toBe(3)
})

test("(D)  INSERT … SELECT with JSON_TABLE but NO CTE works", async () => {
  const [result] = await conn.query<ResultSetHeader>(`
    INSERT INTO debug_log (msg)
    SELECT CONCAT(e.name, ' knows ', s.value)
    FROM employees e
    JOIN JSON_TABLE(e.skills, '$[*]' COLUMNS (value TEXT PATH '$')) s
    WHERE e.id = 2
  `)
  expect(result.affectedRows).toBe(3)
})
