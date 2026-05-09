import { DemoChrome } from "@/components/demo/DemoChrome";
import { PawaSendApp } from "@/components/demo/sectors/PawaSendApp";

export const metadata = {
  title: "PawaSend — NetIQ demo",
  description:
    "Mobile-money transfers protected by NetIQ's network-aware fraud signals.",
};

export default function FintechDemoPage() {
  return (
    <DemoChrome
      sectorId="fintech"
      brand="PawaSend"
      tagline="A Cash-App-style mobile-money wallet. Sign-in is gated by NetIQ; transfers run a network-trust check before any cedi leaves your balance."
      intentLabel="fraud_prevention intent"
    >
      <PawaSendApp />
    </DemoChrome>
  );
}
