/**
 * Sector definitions for the four demo apps.
 *
 * One source of truth for branding, copy, demo MSISDN, and the two
 * NetIQ-gated actions per sector. The sector route pages render against
 * these objects so we can split each sector into its own standalone
 * Next.js app later by copying just the relevant `SectorDef` plus the
 * shared kit under components/demo and lib/demo.
 */

import type { ContextPayload } from "./types";

export type SectorId = "fintech" | "logistics" | "health" | "agri";

export type SectorAction = {
  id: string;
  label: string;
  blurb: string;
  intent: string;
  context: ContextPayload;
  ctaLabel: string;
  successCopy: string;
  verifyCopy: string;
  blockCopy: string;
};

export type SectorDef = {
  id: SectorId;
  brand: string;
  tagline: string;
  oneLiner: string;
  icon: string; // Material Symbols glyph name
  accentVar: string; // CSS variable name (defined in globals.css per sector)
  defaultPhone: string;
  signInIntent: string; // intent used by NetIQSignInPanel for this sector
  signInBlurb: string;
  actions: [SectorAction, SectorAction];
};

const ACCRA = { lat: 5.6037, lng: -0.187 };
const KUMASI = { lat: 6.6885, lng: -1.6244 };

export const SECTORS: Record<SectorId, SectorDef> = {
  fintech: {
    id: "fintech",
    brand: "PawaSend",
    tagline: "Mobile-money transfers, network-verified.",
    oneLiner:
      "PawaSend stops account-takeover and SIM-swap fraud before any cedi leaves your wallet.",
    icon: "payments",
    accentVar: "--demo-accent-fintech",
    defaultPhone: "+9999999103",
    signInIntent: "onboarding",
    signInBlurb:
      "Verify the subscriber on the network before opening your wallet session.",
    actions: [
      {
        id: "quick_send",
        label: "Quick send",
        blurb:
          "A small everyday transfer. NetIQ runs a light fraud check on the sender before approving.",
        intent: "fraud_prevention",
        context: { amount: 25 },
        ctaLabel: "Send 25 GHS",
        successCopy: "Transfer approved. Funds will arrive in seconds.",
        verifyCopy:
          "We need a quick step-up confirmation before sending. Check your authenticator.",
        blockCopy: "We can't send this transfer right now. Contact support.",
      },
      {
        id: "high_value",
        label: "High-value send",
        blurb:
          "A large transfer triggers a deeper signal ladder — SIM swap, device swap, recycling, call forwarding.",
        intent: "fraud_prevention",
        context: { amount: 12000, amount_band: "high" },
        ctaLabel: "Send 12,000 GHS",
        successCopy:
          "Large transfer approved. We checked the SIM, device, and call-forwarding state.",
        verifyCopy:
          "This is a high-value transfer — please complete step-up verification on your other device.",
        blockCopy:
          "We blocked this transfer. The line shows risk signals consistent with takeover.",
      },
    ],
  },

  logistics: {
    id: "logistics",
    brand: "SwiftDrop",
    tagline: "Last-mile delivery you can trust.",
    oneLiner:
      "SwiftDrop verifies that the courier is the real subscriber and is actually at the pickup or drop-off point.",
    icon: "local_shipping",
    accentVar: "--demo-accent-logistics",
    defaultPhone: "+9999999104",
    signInIntent: "onboarding",
    signInBlurb:
      "Confirm the courier's SIM identity before they accept a job.",
    actions: [
      {
        id: "verify_pickup",
        label: "Verify pickup at hub",
        blurb:
          "Before handing the parcel over, confirm the courier is physically at the hub coordinates.",
        intent: "logistics",
        context: {
          location: ACCRA,
          verification_radius_m: 2500,
        },
        ctaLabel: "Confirm pickup",
        successCopy:
          "Courier confirmed at the Accra hub. Parcel handover authorised.",
        verifyCopy:
          "We can't fully confirm the courier's location yet. Run a manual check before handover.",
        blockCopy:
          "Courier is not at the hub. Do not release the parcel.",
      },
      {
        id: "rural_dispatch",
        label: "Rural dispatch readiness",
        blurb:
          "For runs into low-coverage areas, NetIQ checks reachability and QoS before the courier sets off.",
        intent: "logistics",
        context: {
          location: { lat: 5.56, lng: -0.205 },
        },
        ctaLabel: "Dispatch run",
        successCopy: "Network looks healthy on this route. Cleared to dispatch.",
        verifyCopy:
          "Network is patchy on this route — assign a backup courier or ask the recipient to call ahead.",
        blockCopy:
          "Connectivity on this route is too weak for a safe handover right now.",
      },
    ],
  },

  health: {
    id: "health",
    brand: "CareLink",
    tagline: "Telehealth that knows the patient and the network.",
    oneLiner:
      "CareLink confirms patient identity and that the consult call can actually run before billing the visit.",
    icon: "medical_services",
    accentVar: "--demo-accent-health",
    defaultPhone: "+9999999106",
    signInIntent: "onboarding",
    signInBlurb:
      "Bind the patient identity to the SIM before opening the consult.",
    actions: [
      {
        id: "start_consult",
        label: "Start consult",
        blurb:
          "Before the doctor joins, NetIQ checks reachability and QoS so the call won't drop mid-visit.",
        intent: "health",
        context: {},
        ctaLabel: "Start telehealth call",
        successCopy:
          "Call quality and reachability look good. Joining the consult now.",
        verifyCopy:
          "Network looks weak — fall back to an audio-only consult or reschedule.",
        blockCopy:
          "We can't reach the patient on the network. Try again later.",
      },
      {
        id: "verify_patient",
        label: "Verify patient identity",
        blurb:
          "Match the claimed identity against the carrier's KYC record before issuing a prescription.",
        intent: "health",
        context: {
          claimed_identity: { name: "Ama Mensah", dob: "1995-04-12" },
        },
        ctaLabel: "Verify patient",
        successCopy:
          "Identity matches the carrier KYC record. Prescription cleared.",
        verifyCopy:
          "Identity is partially confirmed — request a secondary ID before prescribing.",
        blockCopy:
          "Identity does not match the carrier record. Do not prescribe.",
      },
    ],
  },

  agri: {
    id: "agri",
    brand: "FarmRoute",
    tagline: "Agritech payouts and field operations, network-aware.",
    oneLiner:
      "FarmRoute protects co-op payouts and field-officer visits where rural connectivity is the real risk.",
    icon: "agriculture",
    accentVar: "--demo-accent-agri",
    defaultPhone: "+9999999108",
    signInIntent: "onboarding",
    signInBlurb:
      "Bind the farmer or field officer to their SIM before issuing benefits.",
    actions: [
      {
        id: "coop_payout",
        label: "Co-op payout",
        blurb:
          "Disburse a fertilizer subsidy. NetIQ checks reachability, location, and prior risk before paying.",
        intent: "agri",
        context: {
          amount: 500,
          location: KUMASI,
        },
        ctaLabel: "Disburse 500 GHS",
        successCopy:
          "Payout sent. Reachability and location look consistent with the co-op.",
        verifyCopy:
          "We're not confident this farmer is reachable. Hold the payout pending a callback.",
        blockCopy:
          "Risk signals on this number suggest holding the payout for review.",
      },
      {
        id: "field_check_in",
        label: "Field officer check-in",
        blurb:
          "Confirm the field officer is actually at the farm location and reachable.",
        intent: "agri",
        context: {
          location: KUMASI,
        },
        ctaLabel: "Confirm visit",
        successCopy:
          "Field officer confirmed at the farm. Visit logged.",
        verifyCopy:
          "Officer's location is unclear — request a photo or a callback.",
        blockCopy:
          "We can't confirm the officer is at this farm.",
      },
    ],
  },
};

export const SECTOR_LIST: SectorDef[] = [
  SECTORS.fintech,
  SECTORS.logistics,
  SECTORS.health,
  SECTORS.agri,
];
