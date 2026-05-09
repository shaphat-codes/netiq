import { DemoChrome } from "@/components/demo/DemoChrome";
import { CareLinkApp } from "@/components/demo/sectors/CareLinkApp";

export const metadata = {
  title: "CareLink — NetIQ demo",
  description:
    "Telehealth consults gated by NetIQ patient identity and network-quality checks.",
};

export default function HealthDemoPage() {
  return (
    <DemoChrome
      sectorId="health"
      brand="CareLink"
      tagline="A telehealth patient app. Patients sign in through their carrier; consults check network quality first, and prescriptions match identity to the SIM's KYC."
      intentLabel="health intent"
    >
      <CareLinkApp />
    </DemoChrome>
  );
}
