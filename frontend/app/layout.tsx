import "./globals.css";
import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import { Providers } from "@/components/Providers";
import { Toaster } from "sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Confidential Payments",
  description: "Private wallet payments and local fiat off-ramp on Base Sepolia with Inco Lightning",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang="en">
      <body suppressHydrationWarning className={`min-h-screen bg-background font-sans ${inter.variable} ${sora.variable}`}>
        <Providers>
          {children}
        </Providers>
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: "#111111",
              color: "#FFFFFF",
              border: "1px solid #1F1F1F",
              fontFamily: "var(--font-sans), sans-serif",
              fontSize: "14px",
            },
          }}
        />
      </body>
    </html>
  );
}
