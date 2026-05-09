import { DemoChrome } from "@/components/demo/DemoChrome";
import { FarmRouteApp } from "@/components/demo/sectors/FarmRouteApp";

export const metadata = {
  title: "FarmRoute — NetIQ demo",
  description:
    "Co-op payouts and field-officer visits protected by NetIQ network signals.",
};

export default function AgriDemoPage() {
  return (
    <DemoChrome
      sectorId="agri"
      brand="FarmRoute"
      tagline="A field-officer + co-op app. Payouts confirm reachability and location before any cedi moves; visits are logged against the SIM's carrier location."
      intentLabel="agri intent"
    >
      <FarmRouteApp />
    </DemoChrome>
  );
}
