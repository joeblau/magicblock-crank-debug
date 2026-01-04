"use client";

import React, { FC, ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

interface SolanaProviderProps {
  children: ReactNode;
}

export const SolanaProvider: FC<SolanaProviderProps> = ({ children }) => {
  return (
    <ConnectionProvider endpoint={process.env.NEXT_PUBLIC_RPC_HTTP || "https://api.devnet.solana.com"} config={{ wsEndpoint: process.env.NEXT_PUBLIC_RPC_WS || "wss://api.devnet.solana.com" }}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};