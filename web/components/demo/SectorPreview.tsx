"use client";

import { PhoneFrame } from "./PhoneFrame";

/**
 * Static splash-screen mockup used in the hub previews. Each variant
 * mirrors its sector's onboarding splash so the hub gives a faithful
 * peek into the real demo.
 */
export function SectorPreview({
  sector,
}: {
  sector: "fintech" | "logistics" | "health" | "agri";
}) {
  if (sector === "fintech")
    return (
      <PhoneFrame bg="#00d54b" statusBarTone="light" variant="preview">
        <div className="flex h-full flex-col items-center justify-between px-3 pb-4 pt-6 text-white">
          <div className="mt-4 flex flex-col items-center">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
              <span className="text-[20px] font-black leading-none">₵</span>
            </div>
            <p className="text-base font-bold tracking-tight">PawaSend</p>
            <p className="mt-1 text-center text-[8px] opacity-80">
              Send and receive cedis
            </p>
          </div>
          <div className="w-full">
            <div className="rounded-full bg-white py-1.5 text-center text-[9px] font-semibold text-[#003a13]">
              Get started
            </div>
          </div>
        </div>
      </PhoneFrame>
    );

  if (sector === "logistics")
    return (
      <PhoneFrame bg="#0e0f12" statusBarTone="light" variant="preview">
        <div className="flex h-full flex-col justify-between px-3 pb-4 pt-6 text-white">
          <div>
            <div
              className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg"
              style={{ background: "#ffd83a", color: "#1c1300" }}
            >
              <span className="material-symbols-outlined text-[14px]">
                local_shipping
              </span>
            </div>
            <p className="text-base font-bold tracking-tight">SwiftDrop</p>
            <p className="mt-1 text-[8px] leading-snug text-white/70">
              Drive. Drop. Done.
            </p>
          </div>
          <div
            className="rounded-full py-1.5 text-center text-[9px] font-semibold"
            style={{ background: "#ffd83a", color: "#1c1300" }}
          >
            Continue as courier
          </div>
        </div>
      </PhoneFrame>
    );

  if (sector === "health")
    return (
      <PhoneFrame bg="#eef5fb" statusBarTone="dark" variant="preview">
        <div
          className="flex h-full flex-col justify-between px-3 pb-4 pt-6"
          style={{ color: "#0f3a55" }}
        >
          <div>
            <div
              className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg text-white"
              style={{ background: "#1f6f99" }}
            >
              <span className="material-symbols-outlined text-[14px]">
                stethoscope
              </span>
            </div>
            <p className="text-base font-bold tracking-tight">CareLink</p>
            <p className="mt-1 text-[8px] leading-snug opacity-80">
              Doctor in 60 seconds
            </p>
          </div>
          <div
            className="rounded-xl py-1.5 text-center text-[9px] font-semibold text-white"
            style={{ background: "#1f6f99" }}
          >
            Continue
          </div>
        </div>
      </PhoneFrame>
    );

  return (
    <PhoneFrame bg="#fbf6ec" statusBarTone="dark" variant="preview">
      <div
        className="flex h-full flex-col justify-between px-3 pb-4 pt-6"
        style={{ color: "#1f3a1d" }}
      >
        <div>
          <div
            className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg text-white"
            style={{ background: "#3f7d3a" }}
          >
            <span className="material-symbols-outlined text-[14px]">
              agriculture
            </span>
          </div>
          <p className="text-base font-bold tracking-tight">FarmRoute</p>
          <p className="mt-1 text-[8px] leading-snug opacity-80">
            Co-op tools for the field
          </p>
        </div>
        <div
          className="rounded-xl py-1.5 text-center text-[9px] font-semibold text-white"
          style={{ background: "#3f7d3a" }}
        >
          Sign in to your co-op
        </div>
      </div>
    </PhoneFrame>
  );
}
