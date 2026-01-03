#!/bin/sh

# Kill any existing ephemeral validator processes
lsof -ti:7799,7800 | xargs kill -9 2>/dev/null

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Clear the MagicBlock ER ledger to prevent stale account data
# This ensures fresh account cloning from Solana L1 on each restart
LEDGER_DIR="${SCRIPT_DIR}/test-ledger-magicblock"
if [ -d "$LEDGER_DIR" ]; then
  echo "Clearing MagicBlock ER ledger at ${LEDGER_DIR}..."
  rm -rf "$LEDGER_DIR"
  echo "Ledger cleared."
fi

# Spinner while sleeping for 5 seconds
i=0
sp='|/-\'
printf "Loading "
while [ $i -lt 5 ]; do
  printf "\b${sp:i%${#sp}:1}"
  sleep 1
  i=$((i+1))
done

solana config set -ul

RUST_LOG=magicblock=debug,ephemeral=debug,solana_runtime=info \
  ephemeral-validator \
  --accounts-lifecycle ephemeral \
  --remote-cluster devnet \
  --remote-url http://127.0.0.1:8899 \
  --remote-ws-url ws://127.0.0.1:8900 \
  --rpc-port 7799

