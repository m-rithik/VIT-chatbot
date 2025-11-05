import { ClerkProvider } from "@clerk/nextjs";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], display: "swap" });

export const metadata = {
  title: "VIT CHAT BOT",
  description: "Ask about everything happening around campus.",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${manrope.className} ${spaceGrotesk.className}`}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
