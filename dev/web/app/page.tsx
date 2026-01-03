"use client";
import { useState, useEffect, useMemo } from "react";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export default function Home() {
  const { connection } = useConnection();
  const { publicKey, connected, connecting, disconnecting } = useWallet();
  const ephemeralConnection = useMemo(() => new Connection("http://localhost:7799"), []);
  const [isSolanaConnected, setIsSolanaConnected] = useState(false);
  const [isEphemeralConnected, setIsEphemeralConnected] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <WalletMultiButton />
          </div>
          
          {connected && publicKey && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Wallet: {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Balance: {balance !== null ? `${balance.toFixed(4)} SOL` : "Loading..."}
              </p>
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
        </div>
      </main>
    </div>
  );
}
