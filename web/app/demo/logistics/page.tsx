import { DemoChrome } from "@/components/demo/DemoChrome";
import { SwiftDropApp } from "@/components/demo/sectors/SwiftDropApp";

export const metadata = {
  title: "SwiftDrop — NetIQ demo",
  description:
    "Last-mile delivery with NetIQ-verified courier identity and route readiness.",
};

export default function LogisticsDemoPage() {
  return (
    <DemoChrome
      sectorId="logistics"
      brand="SwiftDrop"
      tagline="A Bolt-style courier dispatcher. Drivers sign in through their carrier and each pickup or rural run is gated by a NetIQ location + reachability check."
      intentLabel="logistics intent"
    >
      <SwiftDropApp />
    </DemoChrome>
  );
}
