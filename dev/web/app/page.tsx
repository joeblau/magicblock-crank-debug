"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Crank } from "../anchor/crank";
import crankIdl from "../anchor/crank.json";

const PROGRAM_ID = new PublicKey("8RT6jMFXpLXcLLNNUUbC57sro7uLJuKHYZkVGRYtzt14");
const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

export default function Home() {
  const { connection } = useConnection();
  const { publicKey, connected, connecting, disconnecting, signTransaction, signAllTransactions } = useWallet();
  const ephemeralConnection = useMemo(
    () =>
      new Connection("http://localhost:7799", {
        wsEndpoint: "ws://localhost:7800",
      }),
    []
  );
  const [isSolanaConnected, setIsSolanaConnected] = useState(false);
  const [isEphemeralConnected, setIsEphemeralConnected] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [counterValue, setCounterValue] = useState<number | null>(null);
  const [isCounterInitialized, setIsCounterInitialized] = useState(false);
  const [isDelegating, setIsDelegating] = useState(false);

  // Fix hydration mismatch by only rendering wallet button after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Read-only program for fetching data without wallet
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

  const program = useMemo(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    
    const provider = new AnchorProvider(
      connection,
      { publicKey, signTransaction, signAllTransactions },
      { commitment: "confirmed" }
    );
    
    return new Program<Crank>(crankIdl as Crank, provider);
  }, [connection, publicKey, signTransaction, signAllTransactions]);

  const [counterPda] = useMemo(() => {
    return PublicKey.findProgramAddressSync([Buffer.from("counter")], PROGRAM_ID);
  }, []);

  // Local validator identity for delegation on localhost
  const LOCAL_VALIDATOR_IDENTITY = new PublicKey("mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev");

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
    if (!program || !publicKey) return;

    setIsDelegating(true);
    try {
      const tx = await program.methods
        .delegate()
        .accounts({
          payer: publicKey,
          pda: counterPda,
        })
        .remainingAccounts([
          {
            pubkey: LOCAL_VALIDATOR_IDENTITY,
            isSigner: false,
            isWritable: false,
          },
        ])
        .rpc();
      console.log("Counter delegated to ER:", tx);
    } catch (error) {
      console.error("Failed to delegate counter:", error);
    } finally {
      setIsDelegating(false);
    }
  }, [program, publicKey, counterPda]);

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

  // Watch counter account status (uses read-only program, no wallet needed)
  useEffect(() => {
    // Fetch initial counter state
    const fetchCounter = async () => {
      try {
        const counter = await readOnlyProgram.account.counter.fetch(counterPda);
        setCounterValue(Number(counter.count));
        setIsCounterInitialized(true);
      } catch {
        setIsCounterInitialized(false);
        setCounterValue(null);
      }
    };

    fetchCounter();

    // Subscribe to counter account changes
    const subscriptionId = connection.onAccountChange(
      counterPda,
      async () => {
        try {
          const counter = await readOnlyProgram.account.counter.fetch(counterPda);
          setCounterValue(Number(counter.count));
          setIsCounterInitialized(true);
        } catch {
          setIsCounterInitialized(false);
          setCounterValue(null);
        }
      },
      "confirmed"
    );

    return () => {
      connection.removeAccountChangeListener(subscriptionId);
    };
  }, [connection, readOnlyProgram, counterPda]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            {mounted && <WalletMultiButton />}
          </div>
          
          {connected && publicKey && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Wallet: {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Balance: {balance !== null ? `${balance.toFixed(4)} SOL` : "Loading..."}
              </p>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Counter:</span>
                {isCounterInitialized ? (
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                    Initialized (count: {counterValue})
                  </span>
                ) : (
                  <span className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                    Not Initialized
                  </span>
                )}
              </div>

              {!isCounterInitialized && (
                <button
                  onClick={initializeCounter}
                  disabled={isInitializing || !program}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isInitializing ? "Initializing..." : "Initialize Counter"}
                </button>
              )}

              {isCounterInitialized && (
                <button
                  onClick={delegateCounter}
                  disabled={isDelegating || !program}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isDelegating ? "Delegating..." : "Delegate to ER"}
                </button>
              )}
            </div>
          )}
          
          {connecting && (
            <p className="text-sm text-zinc-500">Connecting...</p>
          )}
          
          {disconnecting && (
            <p className="text-sm text-zinc-500">Disconnecting...</p>
          )}

          <p>Solana Connection: {isSolanaConnected ? "Connected" : "Not Connected"}</p>
          <p>Ephemeral Connection: {isEphemeralConnected ? "Connected" : "Not Connected"}</p>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Counter Status:</span>
            {isCounterInitialized ? (
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                Initialized (count: {counterValue})
              </span>
            ) : (
              <span className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                Not Initialized
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
