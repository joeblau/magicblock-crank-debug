"use client";
import { useState, useEffect, useMemo } from "react";
import { Connection } from "@solana/web3.js";

export default function Home() {

  const solanaConnection = useMemo(() => new Connection("http://localhost:8899"), []);
  const ephemeralConnection = useMemo(() => new Connection("http://localhost:7799"), []);
  const [isSolanaConnected, setIsSolanaConnected] = useState(false);
  const [isEphemeralConnected, setIsEphemeralConnected] = useState(false);

  useEffect(() => {
    solanaConnection.getLatestBlockhash().then(() => {
      setIsSolanaConnected(true);
    });
    ephemeralConnection.getLatestBlockhash().then(() => {
      setIsEphemeralConnected(true);
      });
  }, [solanaConnection, ephemeralConnection]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <div className="flex flex-col gap-4"> 
          <p>Solana Connection: {isSolanaConnected ? "Connected" : "Not Connected"}</p>
           <p>Ephemeral Connection: {isEphemeralConnected ? "Connected" : "Not Connected"}</p>
        </div>
      </main>
    </div>
  );
}
