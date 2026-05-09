import type { Metadata } from "next";

import { DemoSessionProvider } from "@/components/demo/DemoSessionProvider";

export const metadata: Metadata = {
  title: "NetIQ — Sector demos",
  description:
    "Four sector apps (fintech, logistics, health, agritech) sharing one NetIQ trust layer.",
};

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DemoSessionProvider>{children}</DemoSessionProvider>;
}
