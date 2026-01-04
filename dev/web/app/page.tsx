"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Crank } from "../anchor/crank";
import crankIdl from "../anchor/crank.json";
import { DELEGATION_PROGRAM_ID, MAGIC_PROGRAM_ID, MAGIC_CONTEXT_ID } from "@magicblock-labs/ephemeral-rollups-sdk";
import { BN } from "@coral-xyz/anchor";

const PROGRAM_ID = new PublicKey("8RT6jMFXpLXcLLNNUUbC57sro7uLJuKHYZkVGRYtzt14");

// MagicBlock devnet validator identity (for devnet.magicblock.app)
const MAGICBLOCK_DEVNET_VALIDATOR = new PublicKey("MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57");

export default function Home() {
  const { connection } = useConnection();
  const { publicKey, connected, connecting, disconnecting, signTransaction, signAllTransactions } = useWallet();
  const ephemeralConnection = useMemo(
    () =>
      new Connection("https://devnet.magicblock.app", {
        wsEndpoint: "wss://devnet.magicblock.app",
      }),
    []
  );
  const [isSolanaConnected, setIsSolanaConnected] = useState(false);
  const [isEphemeralConnected, setIsEphemeralConnected] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [solanaCounterValue, setSolanaCounterValue] = useState<number | null>(null);
  const [isSolanaCounterInitialized, setIsSolanaCounterInitialized] = useState(false);
  const [erCounterValue, setErCounterValue] = useState<number | null>(null);
  const [isErCounterInitialized, setIsErCounterInitialized] = useState(false);
  const [isDelegating, setIsDelegating] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isIncrementing, setIsIncrementing] = useState(false);
  const [isAutoIncrementing, setIsAutoIncrementing] = useState(false);
  const [isUndelegating, setIsUndelegating] = useState(false);

  // Fix hydration mismatch by only rendering wallet button after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Read-only program for fetching data without wallet (Solana)
  const readOnlyProgram = useMemo(() => {
    const provider = new AnchorProvider(
      connection,
      // Dummy wallet for read-only operations
      {
        publicKey: PublicKey.default,
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
      },
      { commitment: "confirmed" }
    );
    return new Program<Crank>(crankIdl as Crank, provider);
  }, [connection]);

  // Read-only program for fetching data without wallet (ER)
  const readOnlyErProgram = useMemo(() => {
    const provider = new AnchorProvider(
      ephemeralConnection,
      // Dummy wallet for read-only operations
      {
        publicKey: PublicKey.default,
        signTransaction: async (tx) => tx,
        signAllTransactions: async (txs) => txs,
      },
      { commitment: "confirmed" }
    );
    return new Program<Crank>(crankIdl as Crank, provider);
  }, [ephemeralConnection]);

  const program = useMemo(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    
    const provider = new AnchorProvider(
      connection,
      { publicKey, signTransaction, signAllTransactions },
      { commitment: "confirmed" }
    );
    
    return new Program<Crank>(crankIdl as Crank, provider);
  }, [connection, publicKey, signTransaction, signAllTransactions]);

  // Program for ephemeral rollup operations
  const ephemeralProgram = useMemo(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    
    const provider = new AnchorProvider(
      ephemeralConnection,
      { publicKey, signTransaction, signAllTransactions },
      { commitment: "confirmed" }
    );
    
    return new Program<Crank>(crankIdl as Crank, provider);
  }, [ephemeralConnection, publicKey, signTransaction, signAllTransactions]);

  const [counterPda] = useMemo(() => {
    return PublicKey.findProgramAddressSync([Buffer.from("counter")], PROGRAM_ID);
  }, []);


  const initializeCounter = useCallback(async () => {
    if (!program || !publicKey) return;

    setIsInitializing(true);
    try {
      const tx = await program.methods
        .initialize()
        .accounts({
          counter: counterPda,
          user: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("Counter initialized:", tx);
    } catch (error) {
      console.error("Failed to initialize counter:", error);
    } finally {
      setIsInitializing(false);
    }
  }, [program, publicKey, counterPda]);

  const delegateCounter = useCallback(async () => {
    if (!program || !publicKey || !signTransaction) return;

    setIsDelegating(true);
    try {
      console.log("Delegating counter PDA:", counterPda.toBase58());
      
      // Build transaction manually to avoid wallet adapter issues
      // Pass the devnet validator as remainingAccounts to target specific ER
      let tx = await program.methods
        .delegate()
        .accounts({
          payer: publicKey,
          pda: counterPda,
        })
        .remainingAccounts([
          {
            pubkey: MAGICBLOCK_DEVNET_VALIDATOR,
            isSigner: false,
            isWritable: false,
          },
        ])
        .transaction();
      
      tx.feePayer = publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      
      tx = await signTransaction(tx);
      
      const txHash = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
      });
      
      console.log("Counter delegated to ER:", txHash);
      console.log("View on explorer: https://explorer.solana.com/tx/" + txHash + "?cluster=devnet");
      
      // Wait for confirmation
      await connection.confirmTransaction(txHash, "confirmed");
      console.log("Delegation confirmed on Solana!");
      
      // Wait for the ER to pick up the delegated account
      console.log("Waiting for ER to sync the delegated account...");
      let erReady = false;
      for (let i = 0; i < 30; i++) { // Try for up to 30 seconds
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          const accountInfo = await ephemeralConnection.getAccountInfo(counterPda);
          if (accountInfo) {
            console.log("Account found on ER! Owner:", accountInfo.owner.toBase58());
            erReady = true;
            break;
          }
        } catch (e) {
          // Account not ready yet
        }
        console.log(`Waiting for ER sync... (${i + 1}/30)`);
      }
      
      if (erReady) {
        console.log("ER is ready! You can now increment.");
      } else {
        console.log("ER sync timed out. The account may still be syncing.");
      }
    } catch (error) {
      console.error("Failed to delegate counter:", error);
    } finally {
      setIsDelegating(false);
    }
  }, [program, publicKey, signTransaction, counterPda, connection, ephemeralConnection]);

  // Undelegate counter from ER back to Solana
  const undelegateCounter = useCallback(async () => {
    if (!ephemeralProgram || !publicKey || !signTransaction) return;

    setIsUndelegating(true);
    try {
      let tx = await ephemeralProgram.methods
        .undelegate()
        .accounts({
          payer: publicKey,
        })
        .transaction();

      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight } = await ephemeralConnection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      tx = await signTransaction(tx);

      const txHash = await ephemeralConnection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
      });

      console.log("Undelegate tx sent:", txHash);

      const confirmation = await ephemeralConnection.confirmTransaction({
        signature: txHash,
        blockhash,
        lastValidBlockHeight,
      }, "confirmed");

      if (confirmation.value.err) {
        console.error("Undelegate tx failed:", confirmation.value.err);
      } else {
        console.log("Undelegate tx confirmed:", txHash);
      }
    } catch (error) {
      console.error("Failed to undelegate:", error);
    } finally {
      setIsUndelegating(false);
    }
  }, [ephemeralProgram, publicKey, signTransaction, ephemeralConnection]);

  // Manual increment on ER (for testing)
  const incrementOnER = useCallback(async () => {
    if (!ephemeralProgram || !publicKey || !signTransaction) return;

    setIsIncrementing(true);
    try {
      // First check the account info on ER
      const accountInfo = await ephemeralConnection.getAccountInfo(counterPda);
      if (accountInfo) {
        console.log("Account on ER - Owner:", accountInfo.owner.toBase58());
        console.log("Account on ER - Lamports:", accountInfo.lamports);
        console.log("Account on ER - Data length:", accountInfo.data.length);
        console.log("Account on ER - Executable:", accountInfo.executable);
      } else {
        console.log("Account NOT FOUND on ER!");
      }

      let tx = await ephemeralProgram.methods
        .increment()
        .accounts({
          counter: counterPda,
        })
        .transaction();

      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight } = await ephemeralConnection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      tx = await signTransaction(tx);

      const txHash = await ephemeralConnection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
      });

      console.log("Increment tx sent:", txHash);

      const confirmation = await ephemeralConnection.confirmTransaction({
        signature: txHash,
        blockhash,
        lastValidBlockHeight,
      }, "confirmed");

      if (confirmation.value.err) {
        console.error("Increment tx failed:", confirmation.value.err);
      } else {
        console.log("Increment tx confirmed:", txHash);
      }
    } catch (error) {
      console.error("Failed to increment:", error);
    } finally {
      setIsIncrementing(false);
    }
  }, [ephemeralProgram, publicKey, signTransaction, ephemeralConnection, counterPda]);

  // Auto increment on ER (simulates crank)
  const autoIncrementOnER = useCallback(async () => {
    if (!ephemeralProgram || !publicKey || !signTransaction) return;

    setIsAutoIncrementing(true);
    try {
      for (let i = 0; i < 100; i++) {
        let tx = await ephemeralProgram.methods
          .increment()
          .accounts({
            counter: counterPda,
          })
          .transaction();

        tx.feePayer = publicKey;
        const { blockhash } = await ephemeralConnection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;

        tx = await signTransaction(tx);

        const txHash = await ephemeralConnection.sendRawTransaction(tx.serialize(), {
          skipPreflight: true,
        });

        console.log(`[${i + 1}/100] Increment tx sent:`, txHash);

        // Small delay between transactions
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      console.log("Auto increment complete!");
    } catch (error) {
      console.error("Failed to auto increment:", error);
    } finally {
      setIsAutoIncrementing(false);
    }
  }, [ephemeralProgram, publicKey, signTransaction, ephemeralConnection, counterPda]);

  const scheduleIncrement = useCallback(async () => {
    if (!ephemeralProgram || !publicKey || !signTransaction) return;

    setIsScheduling(true);
    try {
      // Build the transaction
      let tx = await ephemeralProgram.methods
        .scheduleIncrement({
          taskId: new BN(Date.now()), // Use timestamp as unique task ID
          executionIntervalMillis: new BN(200), // 200ms between executions
          iterations: new BN(100), // 100 iterations
        })
        .accounts({
          magicProgram: MAGIC_PROGRAM_ID,
          magicContext: MAGIC_CONTEXT_ID,
          payer: publicKey,
          program: PROGRAM_ID,
        })
        .transaction();

      // Set fee payer and recent blockhash from ephemeral connection
      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight } = await ephemeralConnection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      // Sign the transaction
      tx = await signTransaction(tx);

      // Send to ephemeral rollup
      const txHash = await ephemeralConnection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
      });

      console.log("Schedule increment tx sent:", txHash);

      // Wait for confirmation
      const confirmation = await ephemeralConnection.confirmTransaction({
        signature: txHash,
        blockhash,
        lastValidBlockHeight,
      }, "confirmed");

      if (confirmation.value.err) {
        console.error("Schedule increment tx failed:", confirmation.value.err);
      } else {
        console.log("Schedule increment tx confirmed:", txHash);
      }
    } catch (error) {
      console.error("Failed to schedule increment:", error);
    } finally {
      setIsScheduling(false);
    }
  }, [ephemeralProgram, publicKey, signTransaction, ephemeralConnection]);

  useEffect(() => {
    connection.getLatestBlockhash().then(() => {
      setIsSolanaConnected(true);
    }).catch(() => {
      setIsSolanaConnected(false);
    });
    ephemeralConnection.getLatestBlockhash().then(() => {
      setIsEphemeralConnected(true);
    }).catch(() => {
      setIsEphemeralConnected(false);
    });
  }, [connection, ephemeralConnection]);

  // Watch account balance
  useEffect(() => {
    if (!publicKey) {
      // setBalance(null);
      return;
    }

    // Fetch initial balance
    connection.getBalance(publicKey).then((lamports) => {
      setBalance(lamports / LAMPORTS_PER_SOL);
    }).catch((error) => {
      console.error("Failed to fetch balance:", error);
    });

    // Subscribe to account changes
    const subscriptionId = connection.onAccountChange(
      publicKey,
      (accountInfo) => {
        setBalance(accountInfo.lamports / LAMPORTS_PER_SOL);
      },
      "confirmed"
    );

    return () => {
      connection.removeAccountChangeListener(subscriptionId);
    };
  }, [connection, publicKey]);

  // Watch Solana counter account status with WebSocket subscription
  useEffect(() => {
    const fetchCounter = async () => {
      try {
        const counter = await readOnlyProgram.account.counter.fetch(counterPda);
        setSolanaCounterValue(Number(counter.count));
        setIsSolanaCounterInitialized(true);
      } catch {
        setIsSolanaCounterInitialized(false);
        setSolanaCounterValue(null);
      }
    };

    fetchCounter();

    // Subscribe to account changes via WebSocket
    const subscriptionId = connection.onAccountChange(
      counterPda,
      async (accountInfo) => {
        try {
          // Decode the account data directly from the callback
          const counter = readOnlyProgram.coder.accounts.decode("counter", accountInfo.data);
          setSolanaCounterValue(Number(counter.count));
          setIsSolanaCounterInitialized(true);
        } catch {
          // Fallback to fetch if decode fails
          try {
            const counter = await readOnlyProgram.account.counter.fetch(counterPda);
            setSolanaCounterValue(Number(counter.count));
            setIsSolanaCounterInitialized(true);
          } catch {
            setIsSolanaCounterInitialized(false);
            setSolanaCounterValue(null);
          }
        }
      },
      "confirmed"
    );

    return () => {
      connection.removeAccountChangeListener(subscriptionId);
    };
  }, [connection, readOnlyProgram, counterPda]);

  // Watch ER counter account status with WebSocket + polling fallback
  useEffect(() => {
    if (!isEphemeralConnected) return;

    let pollingInterval: ReturnType<typeof setInterval> | null = null;
    let isMounted = true;

    const fetchCounter = async () => {
      try {
        const counter = await readOnlyErProgram.account.counter.fetch(counterPda);
        if (isMounted) {
          console.log("[ER] Counter value:", Number(counter.count));
          setErCounterValue(Number(counter.count));
          setIsErCounterInitialized(true);
        }
      } catch (error) {
        if (isMounted) {
          console.log("[ER] Counter not found or error:", error);
          setIsErCounterInitialized(false);
          setErCounterValue(null);
        }
      }
    };

    fetchCounter();

    // Subscribe to account changes via WebSocket
    let subscriptionId: number | undefined;
    try {
      subscriptionId = ephemeralConnection.onAccountChange(
        counterPda,
        async (accountInfo) => {
          try {
            const counter = readOnlyErProgram.coder.accounts.decode("counter", accountInfo.data);
            if (isMounted) {
              console.log("[ER WebSocket] Counter value:", Number(counter.count));
              setErCounterValue(Number(counter.count));
              setIsErCounterInitialized(true);
            }
          } catch {
            await fetchCounter();
          }
        },
        "confirmed"
      );
      console.log("[ER] WebSocket subscription created:", subscriptionId);
    } catch (error) {
      console.error("Failed to subscribe to ER account changes:", error);
    }

    // Also poll every 100ms as a fallback for fast updates
    pollingInterval = setInterval(fetchCounter, 100);

    return () => {
      isMounted = false;
      if (subscriptionId !== undefined) {
        ephemeralConnection.removeAccountChangeListener(subscriptionId);
      }
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [ephemeralConnection, readOnlyErProgram, counterPda, isEphemeralConnected]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-5xl flex-col py-16 px-8 bg-white dark:bg-black">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-zinc-800 dark:text-zinc-200">MagicBlock Crank Debug</h1>
          {mounted && <WalletMultiButton />}
        </div>

        {/* Wallet Info */}
        {connected && publicKey && (
          <div className="mb-6 p-4 rounded-lg bg-zinc-100 dark:bg-zinc-900">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Wallet: <span className="font-mono">{publicKey.toBase58().slice(0, 8)}...{publicKey.toBase58().slice(-8)}</span>
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Balance: <span className="font-semibold">{balance !== null ? `${balance.toFixed(4)} SOL` : "Loading..."}</span>
            </p>
          </div>
        )}

        {connecting && <p className="text-sm text-zinc-500 mb-4">Connecting wallet...</p>}
        {disconnecting && <p className="text-sm text-zinc-500 mb-4">Disconnecting wallet...</p>}

        {/* Two Column Layout */}
        <div className="grid grid-cols-2 gap-8">
          {/* Left Column - Solana */}
          <div className="flex flex-col gap-4">
            <div className="p-4 rounded-lg border-2 border-purple-500 bg-purple-50 dark:bg-purple-950/20">
              <h2 className="text-lg font-bold text-purple-700 dark:text-purple-400 mb-4">Solana (Base Layer)</h2>
              
              {/* Connection Status */}
              <div className="mb-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Status: {isSolanaConnected ? (
                    <span className="text-green-600 dark:text-green-400 font-semibold">● Connected</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400 font-semibold">● Not Connected</span>
                  )}
                </p>
              </div>

              {/* Counter Display */}
              <div className="p-4 rounded-lg bg-white dark:bg-zinc-900 mb-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Counter Value</p>
                {isSolanaCounterInitialized ? (
                  <p className="text-4xl font-bold text-purple-600 dark:text-purple-400">{solanaCounterValue}</p>
                ) : (
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">Not Initialized</p>
                )}
              </div>

              {/* Solana Actions */}
              {connected && publicKey && (
                <div className="flex flex-col gap-2">
                  {!isSolanaCounterInitialized && (
                    <button
                      onClick={initializeCounter}
                      disabled={isInitializing || !program}
                      className="w-full px-4 py-3 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isInitializing ? "Initializing..." : "Initialize Counter"}
                    </button>
                  )}

                  {isSolanaCounterInitialized && (
                    <button
                      onClick={delegateCounter}
                      disabled={isDelegating || !program}
                      className="w-full px-4 py-3 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isDelegating ? "Delegating..." : "Delegate to ER →"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Ephemeral Rollup */}
          <div className="flex flex-col gap-4">
            <div className="p-4 rounded-lg border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/20">
              <h2 className="text-lg font-bold text-blue-700 dark:text-blue-400 mb-4">Ephemeral Rollup</h2>
              
              {/* Connection Status */}
              <div className="mb-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Status: {isEphemeralConnected ? (
                    <span className="text-green-600 dark:text-green-400 font-semibold">● Connected</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400 font-semibold">● Not Connected</span>
                  )}
                </p>
              </div>

              {/* Counter Display */}
              <div className="p-4 rounded-lg bg-white dark:bg-zinc-900 mb-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Counter Value</p>
                {isErCounterInitialized ? (
                  <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">{erCounterValue}</p>
                ) : (
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">Not Available</p>
                )}
              </div>

              {/* ER Actions */}
              {connected && publicKey && isSolanaCounterInitialized && (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={incrementOnER}
                    disabled={isIncrementing || !ephemeralProgram}
                    className="w-full px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isIncrementing ? "Incrementing..." : "Increment (+1)"}
                  </button>
                  
                  <button
                    onClick={autoIncrementOnER}
                    disabled={isAutoIncrementing || !ephemeralProgram}
                    className="w-full px-4 py-3 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isAutoIncrementing ? "Auto Incrementing..." : "Auto Increment (100x)"}
                  </button>
                  
                  <button
                    onClick={scheduleIncrement}
                    disabled={isScheduling || !ephemeralProgram}
                    className="w-full px-4 py-3 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isScheduling ? "Scheduling..." : "Schedule Crank (100x @ 200ms)"}
                  </button>
                  
                  <div className="border-t border-blue-300 dark:border-blue-800 my-2"></div>
                  
                  <button
                    onClick={undelegateCounter}
                    disabled={isUndelegating || !ephemeralProgram}
                    className="w-full px-4 py-3 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isUndelegating ? "Undelegating..." : "← Undelegate to Solana"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
