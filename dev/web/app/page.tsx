"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Crank } from "../anchor/crank";
import crankIdl from "../anchor/crank.json";
import { MAGIC_PROGRAM_ID, MAGIC_CONTEXT_ID } from "@magicblock-labs/ephemeral-rollups-sdk";
import { BN } from "@coral-xyz/anchor";

const PROGRAM_ID = new PublicKey("8RT6jMFXpLXcLLNNUUbC57sro7uLJuKHYZkVGRYtzt14");

// Pre-compute the counter PDA at module level (it never changes)
const [COUNTER_PDA] = PublicKey.findProgramAddressSync([Buffer.from("counter")], PROGRAM_ID);

export default function Home() {
  const { connection } = useConnection();
  const { publicKey, connected, connecting, disconnecting, signTransaction, signAllTransactions } = useWallet();
  
  // Use ref for ephemeral connection to avoid recreating
  const ephemeralConnection = useMemo(
    () =>
      new Connection("https://devnet-as.magicblock.app", {
        wsEndpoint: "wss://devnet-as.magicblock.app",
        commitment: "confirmed",
      }),
    []
  );

  const [isSolanaConnected, setIsSolanaConnected] = useState(false);
  const [isEphemeralConnected, setIsEphemeralConnected] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [solanaCounterValue, setSolanaCounterValue] = useState<number | null>(null);
  const [isSolanaCounterInitialized, setIsSolanaCounterInitialized] = useState(false);
  const [erCounterValue, setErCounterValue] = useState<number | null>(null);
  const [isErCounterInitialized, setIsErCounterInitialized] = useState(false);
  
  // Loading states
  const [isInitializing, setIsInitializing] = useState(false);
  const [isDelegating, setIsDelegating] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isIncrementing, setIsIncrementing] = useState(false);
  const [isAutoIncrementing, setIsAutoIncrementing] = useState(false);
  const [isUndelegating, setIsUndelegating] = useState(false);

  // Cache blockhash to avoid fetching on every tx
  const blockhashCache = useRef<{ blockhash: string; lastValidBlockHeight: number; timestamp: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Read-only program for Solana
  const readOnlyProgram = useMemo(() => {
    const provider = new AnchorProvider(
      connection,
      { publicKey: PublicKey.default, signTransaction: async (tx) => tx, signAllTransactions: async (txs) => txs },
      { commitment: "confirmed" }
    );
    return new Program<Crank>(crankIdl as Crank, provider);
  }, [connection]);

  // Read-only program for ER
  const readOnlyErProgram = useMemo(() => {
    const provider = new AnchorProvider(
      ephemeralConnection,
      { publicKey: PublicKey.default, signTransaction: async (tx) => tx, signAllTransactions: async (txs) => txs },
      { commitment: "confirmed" }
    );
    return new Program<Crank>(crankIdl as Crank, provider);
  }, [ephemeralConnection]);

  // User's program instance (only created when wallet connected)
  const program = useMemo(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    const provider = new AnchorProvider(
      connection,
      { publicKey, signTransaction, signAllTransactions },
      { commitment: "confirmed", skipPreflight: true }
    );
    return new Program<Crank>(crankIdl as Crank, provider);
  }, [connection, publicKey, signTransaction, signAllTransactions]);

  // Ephemeral program instance
  const ephemeralProgram = useMemo(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    const provider = new AnchorProvider(
      ephemeralConnection,
      { publicKey, signTransaction, signAllTransactions },
      { commitment: "confirmed", skipPreflight: true }
    );
    return new Program<Crank>(crankIdl as Crank, provider);
  }, [ephemeralConnection, publicKey, signTransaction, signAllTransactions]);

  // Helper to get cached or fresh blockhash
  const getBlockhash = useCallback(async (conn: Connection) => {
    const now = Date.now();
    // Cache blockhash for 30 seconds
    if (blockhashCache.current && now - blockhashCache.current.timestamp < 30000) {
      return blockhashCache.current;
    }
    const result = await conn.getLatestBlockhash("confirmed");
    blockhashCache.current = { ...result, timestamp: now };
    return result;
  }, []);

  // ============ ACTIONS ============

  const initializeCounter = useCallback(async () => {
    if (!program || !publicKey) return;
    setIsInitializing(true);
    try {
      // Use rpc() for simplicity - it handles everything
      const tx = await program.methods
        .initialize()
        .accounts({ counter: COUNTER_PDA, user: publicKey, systemProgram: SystemProgram.programId })
        .rpc({ skipPreflight: true });
      console.log("Counter initialized:", tx);
    } catch (error) {
      console.error("Failed to initialize counter:", error);
    } finally {
      setIsInitializing(false);
    }
  }, [program, publicKey]);

  const delegateCounter = useCallback(async () => {
    if (!program || !publicKey || !signTransaction) return;
    setIsDelegating(true);
    try {
      console.log("Delegating counter PDA:", COUNTER_PDA.toBase58());

      // Build and send in one flow
      const tx = await program.methods
        .delegate()
        .accounts({ payer: publicKey, pda: COUNTER_PDA })
        .remainingAccounts([])
        .transaction();

      tx.feePayer = publicKey;
      const { blockhash } = await getBlockhash(connection);
      tx.recentBlockhash = blockhash;

      const signed = await signTransaction(tx);
      const txHash = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
      
      console.log("Delegation tx sent:", txHash);
      await connection.confirmTransaction(txHash, "confirmed");
      console.log("Delegation confirmed!");

      // Wait for ER sync (with shorter timeout)
      console.log("Waiting for ER sync...");
      for (let i = 0; i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const accountInfo = await ephemeralConnection.getAccountInfo(COUNTER_PDA);
        if (accountInfo) {
          console.log("ER synced! Owner:", accountInfo.owner.toBase58());
          break;
        }
      }
    } catch (error) {
      console.error("Failed to delegate:", error);
    } finally {
      setIsDelegating(false);
    }
  }, [program, publicKey, signTransaction, connection, ephemeralConnection, getBlockhash]);

  const undelegateCounter = useCallback(async () => {
    if (!ephemeralProgram || !publicKey || !signTransaction) return;
    setIsUndelegating(true);
    try {
      const tx = await ephemeralProgram.methods
        .undelegate()
        .accounts({ payer: publicKey })
        .transaction();

      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight } = await ephemeralConnection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      const signed = await signTransaction(tx);
      const txHash = await ephemeralConnection.sendRawTransaction(signed.serialize(), { skipPreflight: true });

      console.log("Undelegate tx sent:", txHash);
      await ephemeralConnection.confirmTransaction({ signature: txHash, blockhash, lastValidBlockHeight }, "confirmed");
      console.log("Undelegate confirmed!");
    } catch (error) {
      console.error("Failed to undelegate:", error);
    } finally {
      setIsUndelegating(false);
    }
  }, [ephemeralProgram, publicKey, signTransaction, ephemeralConnection]);

  const incrementOnER = useCallback(async () => {
    if (!ephemeralProgram || !publicKey || !signTransaction) return;
    setIsIncrementing(true);
    try {
      const tx = await ephemeralProgram.methods
        .increment()
        .accounts({ counter: COUNTER_PDA })
        .transaction();

      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight } = await ephemeralConnection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      const signed = await signTransaction(tx);
      const txHash = await ephemeralConnection.sendRawTransaction(signed.serialize(), { skipPreflight: true });

      console.log("Increment tx sent:", txHash);
      await ephemeralConnection.confirmTransaction({ signature: txHash, blockhash, lastValidBlockHeight }, "confirmed");
      console.log("Increment confirmed!");
    } catch (error) {
      console.error("Failed to increment:", error);
    } finally {
      setIsIncrementing(false);
    }
  }, [ephemeralProgram, publicKey, signTransaction, ephemeralConnection]);

  const autoIncrementOnER = useCallback(async () => {
    if (!ephemeralProgram || !publicKey || !signTransaction) return;
    setIsAutoIncrementing(true);
    try {
      // Pre-fetch blockhash once for all transactions
      const { blockhash } = await ephemeralConnection.getLatestBlockhash();

      for (let i = 0; i < 5; i++) {
        const tx = await ephemeralProgram.methods
          .increment()
          .accounts({ counter: COUNTER_PDA })
          .transaction();

        tx.feePayer = publicKey;
        tx.recentBlockhash = blockhash;

        const signed = await signTransaction(tx);
        const txHash = await ephemeralConnection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
        console.log(`[${i + 1}/5] Increment tx sent:`, txHash);
      }
      console.log("Auto increment complete!");
    } catch (error) {
      console.error("Failed to auto increment:", error);
    } finally {
      setIsAutoIncrementing(false);
    }
  }, [ephemeralProgram, publicKey, signTransaction, ephemeralConnection]);

  const scheduleIncrement = useCallback(async () => {
    if (!ephemeralProgram || !publicKey || !signTransaction) return;
    setIsScheduling(true);
    try {
      const taskId = Date.now();
      console.log("Scheduling crank with taskId:", taskId);

      const tx = await ephemeralProgram.methods
        .scheduleIncrement({
          taskId: new BN(taskId),
          executionIntervalMillis: new BN(200),
          iterations: new BN(5),
        })
        .accounts({
          magicProgram: MAGIC_PROGRAM_ID,
          magicContext: MAGIC_CONTEXT_ID,
          payer: publicKey,
          program: PROGRAM_ID,
        })
        .transaction();

      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight } = await ephemeralConnection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      const signed = await signTransaction(tx);
      const txHash = await ephemeralConnection.sendRawTransaction(signed.serialize(), { skipPreflight: true });

      console.log("Schedule tx sent:", txHash);
      const confirmation = await ephemeralConnection.confirmTransaction(
        { signature: txHash, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      if (confirmation.value.err) {
        console.error("Schedule tx failed:", confirmation.value.err);
      } else {
        console.log("Schedule tx confirmed! Watching for counter updates...");
        
        // Fetch logs
        try {
          const txDetails = await ephemeralConnection.getTransaction(txHash, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
          });
          txDetails?.meta?.logMessages?.forEach(log => console.log("  ", log));
        } catch {
          // Ignore log fetch errors
        }
      }
    } catch (error) {
      console.error("Failed to schedule:", error);
    } finally {
      setIsScheduling(false);
    }
  }, [ephemeralProgram, publicKey, signTransaction, ephemeralConnection]);

  // ============ EFFECTS ============

  // Check connection status once on mount
  useEffect(() => {
    Promise.all([
      connection.getLatestBlockhash().then(() => setIsSolanaConnected(true)).catch(() => setIsSolanaConnected(false)),
      ephemeralConnection.getLatestBlockhash().then(() => setIsEphemeralConnected(true)).catch(() => setIsEphemeralConnected(false)),
    ]);
  }, [connection, ephemeralConnection]);

  // Watch wallet balance via WebSocket
  useEffect(() => {
    if (!publicKey) return;

    connection.getBalance(publicKey).then((lamports) => setBalance(lamports / LAMPORTS_PER_SOL));

    const subId = connection.onAccountChange(publicKey, (info) => {
      setBalance(info.lamports / LAMPORTS_PER_SOL);
    }, "confirmed");

    return () => { connection.removeAccountChangeListener(subId); };
  }, [connection, publicKey]);

  // Watch Solana counter via WebSocket only
  useEffect(() => {
    const fetchCounter = async () => {
      try {
        const counter = await readOnlyProgram.account.counter.fetch(COUNTER_PDA);
        setSolanaCounterValue(Number(counter.count));
        setIsSolanaCounterInitialized(true);
      } catch {
        setIsSolanaCounterInitialized(false);
        setSolanaCounterValue(null);
      }
    };

    fetchCounter();

    const subId = connection.onAccountChange(COUNTER_PDA, (accountInfo) => {
      try {
        const counter = readOnlyProgram.coder.accounts.decode("counter", accountInfo.data);
        setSolanaCounterValue(Number(counter.count));
        setIsSolanaCounterInitialized(true);
      } catch {
        fetchCounter();
      }
    }, "confirmed");

    return () => { connection.removeAccountChangeListener(subId); };
  }, [connection, readOnlyProgram]);

  // Watch ER counter via WebSocket + slower polling (1s instead of 100ms)
  useEffect(() => {
    if (!isEphemeralConnected) return;

    let isMounted = true;

    const fetchCounter = async () => {
      try {
        const counter = await readOnlyErProgram.account.counter.fetch(COUNTER_PDA);
        if (isMounted) {
          setErCounterValue(Number(counter.count));
          setIsErCounterInitialized(true);
        }
      } catch {
        if (isMounted) {
          setIsErCounterInitialized(false);
          setErCounterValue(null);
        }
      }
    };

    fetchCounter();

    // WebSocket subscription
    let subId: number | undefined;
    try {
      subId = ephemeralConnection.onAccountChange(COUNTER_PDA, (accountInfo) => {
        try {
          const counter = readOnlyErProgram.coder.accounts.decode("counter", accountInfo.data);
          if (isMounted) {
            setErCounterValue(Number(counter.count));
            setIsErCounterInitialized(true);
          }
        } catch {
          fetchCounter();
        }
      }, "confirmed");
    } catch (error) {
      console.error("Failed to subscribe to ER:", error);
    }

    // Poll every 1 second as fallback (was 100ms - way too aggressive)
    const pollInterval = setInterval(fetchCounter, 1000);

    return () => {
      isMounted = false;
      if (subId !== undefined) ephemeralConnection.removeAccountChangeListener(subId);
      clearInterval(pollInterval);
    };
  }, [ephemeralConnection, readOnlyErProgram, isEphemeralConnected]);

  // ============ RENDER ============

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
              
              <div className="mb-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Status: {isSolanaConnected ? (
                    <span className="text-green-600 dark:text-green-400 font-semibold">● Connected</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400 font-semibold">● Not Connected</span>
                  )}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-white dark:bg-zinc-900 mb-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Counter Value</p>
                {isSolanaCounterInitialized ? (
                  <p className="text-4xl font-bold text-purple-600 dark:text-purple-400">{solanaCounterValue}</p>
                ) : (
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">Not Initialized</p>
                )}
              </div>

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
              
              <div className="mb-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Status: {isEphemeralConnected ? (
                    <span className="text-green-600 dark:text-green-400 font-semibold">● Connected</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400 font-semibold">● Not Connected</span>
                  )}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-white dark:bg-zinc-900 mb-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Counter Value</p>
                {isErCounterInitialized ? (
                  <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">{erCounterValue}</p>
                ) : (
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">Not Available</p>
                )}
              </div>

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
                    {isAutoIncrementing ? "Auto Incrementing..." : "Auto Increment (5x)"}
                  </button>
                  
                  <button
                    onClick={scheduleIncrement}
                    disabled={isScheduling || !ephemeralProgram}
                    className="w-full px-4 py-3 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isScheduling ? "Scheduling..." : "Schedule Crank (5x @ 200ms)"}
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
