import type { Metadata } from "next";
import { Schibsted_Grotesk, Martian_Mono, Geist } from "next/font/google";
import "./globals.css";
import LightRays from '@/components/LightRays';
import { cn } from "@/lib/utils";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import { ViewTransition } from "react";

// A fixed year, not new Date(): reading the clock while prerendering is a build error with
// Cache Components, and the year in a footer doesn't need to be live.
const COPYRIGHT_YEAR = 2026;

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

const schibstedGrotesk = Schibsted_Grotesk({
  variable: "--font-schibsted-grotesk",
  subsets: ["latin"],
});

const martianMono = Martian_Mono({
  variable: "--font-martian-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DevEvents",
  description: "The Hub for Every Developers Event You Must Attend",
  // Google Search Console ownership check (needed for Google sign-in brand verification):
  // paste the code from the "HTML tag" method into GOOGLE_SITE_VERIFICATION and redeploy.
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", schibstedGrotesk.variable, martianMono.variable, "font-sans", geist.variable)}
    >
      {/* Extensions like Grammarly inject attributes on <body> before hydration; ignore those mismatches here only. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>

        <Navbar />

        <div className="absolute inset-0 top-0 z-[-1] min-h-full">
          <LightRays
            raysOrigin="top-center"
            raysColor="#5dfeca"
            raysSpeed={0.5}
            lightSpread={0.9}
            rayLength={1.4}
            followMouse={true}
            mouseInfluence={0.02}
            noiseAmount={0}
            distortion={0.1}
            className="custom-rays"
            pulsating={false}
            fadeDistance={1}
            saturation={1}
          />
        </div>

        {/* flex-1: the main area always fills the screen, so the footer stays at the bottom
            instead of rising into view while a page is still loading, then jumping down. */}
        <main className="w-full flex-1">
          {/* A short, browser-native crossfade between pages (see the view-transition rules in
              globals.css). No animation library, and nothing runs on first load. */}
          <ViewTransition>
            {children}
          </ViewTransition>
        </main>

        {/* Google, GitHub and LinkedIn sign-in reviews check that every page links to these. */}
        <footer style={{ viewTransitionName: "site-footer" }} className="text-light-200 flex flex-wrap justify-center gap-6 py-8 text-sm">
          <span>&copy; {COPYRIGHT_YEAR} DevEvent</span>
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
          <Link href="/terms" className="hover:underline">Terms and Conditions</Link>
        </footer>

      </body>
    </html>
  );
}
