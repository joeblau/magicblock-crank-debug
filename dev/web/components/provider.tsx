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

// Connect to devnet
const DEVNET_ENDPOINT = `https://devnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`;
const DEVNET_WS_ENDPOINT = `wss://atlas-devnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`;

export const SolanaProvider: FC<SolanaProviderProps> = ({ children }) => {
  return (
    <ConnectionProvider endpoint={DEVNET_ENDPOINT} config={{ wsEndpoint: DEVNET_WS_ENDPOINT }}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};