"use client";

import { ReactNode, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getEmbeddedConnectedWallet, PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { http } from "wagmi";
import { ThemeProvider } from "next-themes";
import { baseSepolia } from "wagmi/chains";

const queryClient = new QueryClient();
const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";
const hasValidPrivyAppId = Boolean(appId && !appId.includes("<"));

const config = createConfig({
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http(),
  },
  ssr: true,
});

const Providers = ({ children }: { children: ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      const serialized = args
        .map((arg) => {
          if (typeof arg === "string") return arg;
          try {
            return JSON.stringify(arg);
          } catch {
            return String(arg);
          }
        })
        .join(" ");
      const lower = serialized.toLowerCase();
      if (
        lower.includes("react does not recognize the `isactive` prop on a dom element") ||
        (lower.includes("react does not recognize the") && lower.includes("prop on a dom element")) ||
        lower.includes("cannot be a descendant of <p>") ||
        lower.includes("<p> cannot contain a nested <div>")
      ) {
        return;
      }
      originalConsoleError(...args);
    };
    return () => {
      console.error = originalConsoleError;
    };
  }, []);

  if (!mounted) {
    return (
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <div />
      </ThemeProvider>
    );
  }

  const core = (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider
        config={config}
        setActiveWalletForWagmi={({ wallets }) => getEmbeddedConnectedWallet(wallets) || wallets[0]}
      >
        {children}
      </WagmiProvider>
    </QueryClientProvider>
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      {hasValidPrivyAppId ? (
        <PrivyProvider
          appId={appId}
          config={{
            appearance: {
              theme: "dark",
            },
            embeddedWallets: {
              createOnLogin: "users-without-wallets",
            },
            defaultChain: baseSepolia,
            supportedChains: [baseSepolia],
          }}
        >
          {core}
        </PrivyProvider>
      ) : (
        <div className="min-h-screen bg-[#0A0A0A] p-6 text-white">
          <div className="mx-auto mt-20 w-full max-w-[420px] rounded-2xl border border-[#1F1F1F] bg-[#111111] p-5">
            <p className="text-lg font-semibold">Missing Privy Config</p>
            <p className="mt-2 text-sm text-[#A0A0A0]">
              Set <code className="text-[#FF8C3A]">NEXT_PUBLIC_PRIVY_APP_ID</code> in your environment and redeploy.
            </p>
          </div>
        </div>
      )}
    </ThemeProvider>
  );
};

export { Providers };
