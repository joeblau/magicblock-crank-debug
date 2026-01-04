#!/bin/sh

lsof -ti:8899,8900 | xargs kill -9 2>/dev/null;


solana config set -ul

# Pre-fund the embedded wallet once the validator is reachable
AIRDROP_TARGET="6uRAouaynVhU87V9iMaWy616295tf2ZnZQv2YxAcPnhQ"
AIRDROP_AMOUNT=1000
(
  echo "Waiting for local validator to fund ${AIRDROP_TARGET} with ${AIRDROP_AMOUNT} SOL..."
  sleep 2
  until solana cluster-version --url http://localhost:8899 >/dev/null 2>&1; do
    sleep 1
  done
  if solana airdrop "${AIRDROP_AMOUNT}" "${AIRDROP_TARGET}" --url http://localhost:8899 >/dev/null; then
    echo "Airdropped ${AIRDROP_AMOUNT} SOL to ${AIRDROP_TARGET}"
  else
    echo "Failed to airdrop SOL to ${AIRDROP_TARGET}"
  fi
) &

mkdir -p ./bpf-programs

# Dump the program from mainnet
echo "Dumping program from mainnet..."

solana-test-validator \
  --clone 8zGuJQqwhZafTah7Uc7Z4tXRnguqkn5KLFAP8oV6PHe2 `# Drift USDC Mint` \
  --clone A5TtJFy3PgCSg9MdBHLCHtewa7Sx613heaJ5atjNZCtJ `# Drift Faucet State Account` \
  --clone mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev `# MagicBlock Local ER Validator Account` \
  --clone EpJnX7ueXk7fKojBymqmVuCuwyhDQsYcLVL1XMsBbvDX `# Example Vault Account #1` \
  --clone 7JrkjmZPprHwtuvtuGTXp9hwfGYFAQLnLeFM52kqAgXg `# Example Vault Account #2` \
  --clone noopb9bkMVfRPU8AsbpTUg8AQkHtKwMYZiFUjNRtMmV `# SPL Noop Program` \
  --clone-upgradeable-program DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh `# MagicBlock Delegation Program` \
  --clone Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh `# MagicBlock VRF Oracle Queue Account` \
  --clone 5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc `# MagicBlock VRF Oracles/State Account` \
  --clone F72HqCR8nwYsVyeVd38pgKkjXmXFzVAM8rjZZsXWbdE `# MagicBlock VRF Program State (Global)` \
  --clone vrfkfM4uoisXZQPrFiS2brY4oMkU9EWjyvmvqaFd5AS `# MagicBlock VRF Signer PDA` \
  --clone 71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr `# MagicBlock BTC Price Feed` \
  --clone-upgradeable-program V4v1mQiAdLz4qwckEb45WqHYceYizoib39cDBHSWfaB `# Drift Faucet` \
  --clone-upgradeable-program Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz `# MagicBlock VRF Program` \
  --clone-upgradeable-program BTWAqWNBmF2TboMh3fxMJfgR16xGHYD7Kgr2dPwbRPBi `# MagicBlock Permission Program` \
  --url https://jillie-ji0a1l-fast-devnet.helius-rpc.com \
  --rpc-port 8899 \
  --reset


