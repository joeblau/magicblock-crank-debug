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

// Connect to localnet where the crank program is deployed
const LOCALNET_ENDPOINT = "http://localhost:8899";

export const SolanaProvider: FC<SolanaProviderProps> = ({ children }) => {
  return (
    <ConnectionProvider endpoint={LOCALNET_ENDPOINT}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};