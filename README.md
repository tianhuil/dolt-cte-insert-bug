# Dolt `INSERT … SELECT` with CTE + `JSON_TABLE` disconnects

> `INSERT INTO … SELECT * FROM (WITH … JSON_TABLE(…))` severs the MySQL connection instead of inserting rows.
> **Notably, the same CTE+JSON_TABLE expression works fine as a standalone `SELECT`, and each feature works in isolation** — the bug is specific to the combination inside an `INSERT … SELECT`.

## Expected vs Actual

| Expression | Expected | Actual |
|---|---|---|
| `SELECT … CTE … JSON_TABLE` | Rows returned | ✅ Rows returned |
| `INSERT … SELECT … CTE … JSON_TABLE` (combined) | 15 rows inserted | ❌ Server disconnects (ECONNRESET) |
| `INSERT … SELECT … CTE` (no JSON_TABLE) | Rows inserted | ✅ Rows inserted |
| `INSERT … SELECT … JSON_TABLE` (no CTE) | Rows inserted | ✅ Rows inserted |

## Running

### Docker (replaces local dolt setup)

```bash
docker run -d --name dolt -p 13307:3306 dolthub/dolt-sql-server:latest
bun install
bun test
docker rm -f dolt
```

### Local binary

```bash
bash scripts/setup.sh
dolt sql-server --host 127.0.0.1 --port 13307 --data-dir dolt-test/.dolt &
bun test
kill %1
```

## Environment

- **dolt**: `2.1.9` (Docker: `dolthub/dolt-sql-server:latest`)
- **bun**: `1.3.14`
- **mysql2**: `3.22.5`
- **OS**: macOS / Linux
