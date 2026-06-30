#!/usr/bin/env bash
set -euo pipefail

# Install Dolt CLI binary for local setup
if ! command -v dolt &>/dev/null; then
  echo "Installing dolt..."
  curl -fsSL https://github.com/dolthub/dolt/releases/latest/download/install.sh | sudo bash
fi

echo "dolt $(dolt version) ready"

# Create and seed the Dolt database
mkdir -p dolt-test
cd dolt-test
dolt init 2>/dev/null
dolt sql < ../seed.sql
cd ..

echo ""
echo "Start the server with:  dolt sql-server --host 127.0.0.1 --port 13307 --data-dir dolt-test/.dolt"
echo "Then run:                bun test"
