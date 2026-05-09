"use client";

/**
 * PhoneFrame — device chrome around a sector demo app.
 *
 * Renders a tall iPhone-style frame: dark bezel, dynamic-island notch,
 * status bar (9:41 + signal/wifi/battery), home indicator. The inner
 * screen background and status-bar tone are sector-driven so each demo
 * app's brand colour shows through to the chrome.
 */

type Props = {
  children: React.ReactNode;
  /** App background colour visible behind the screen content. */
  bg?: string;
  /** Status-bar text/icons colour. Use "light" on dark/colourful apps. */
  statusBarTone?: "dark" | "light";
  /** Compact card-sized frame for the hub previews. */
  variant?: "full" | "preview";
  className?: string;
};

export function PhoneFrame({
  children,
  bg = "#ffffff",
  statusBarTone = "dark",
  variant = "full",
  className = "",
}: Props) {
  const isPreview = variant === "preview";
  const wrap = isPreview
    ? "h-[420px] w-[210px] rounded-[34px] p-[6px]"
    : "h-[760px] w-[370px] rounded-[52px] p-[12px]";
  const screen = isPreview ? "rounded-[28px]" : "rounded-[42px]";
  const notch = isPreview
    ? "top-[7px] h-[16px] w-[68px] rounded-[10px]"
    : "top-[10px] h-[28px] w-[110px] rounded-[20px]";
  const statusBar = isPreview ? "h-[20px] px-3 pb-0.5" : "h-[44px] px-7 pb-1";
  const statusFont = isPreview ? "text-[9px]" : "text-[13px]";
  const statusIcon = isPreview ? "text-[10px]" : "text-[14px]";
  const home = isPreview
    ? "bottom-[6px] h-[3px] w-[70px]"
    : "bottom-[8px] h-[4px] w-[120px]";

  return (
    <div
      className={`relative shrink-0 bg-gradient-to-br from-[#1f1f1f] to-[#070707] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)_inset] ${wrap} ${className}`}
    >
      <div
        className={`relative h-full w-full overflow-hidden ${screen}`}
        style={{ background: bg }}
      >
        <div className={`absolute left-1/2 z-30 -translate-x-1/2 bg-black ${notch}`} />

        <div
          className={`pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-end justify-between ${statusBar} ${
            statusBarTone === "dark" ? "text-black" : "text-white"
          }`}
        >
          <span className={`${statusFont} font-semibold tracking-tight`}>
            9:41
          </span>
          <div className="flex items-center gap-1">
            <span className={`material-symbols-outlined ${statusIcon}`}>
              network_cell
            </span>
            <span className={`material-symbols-outlined ${statusIcon}`}>
              wifi
            </span>
            <span className={`material-symbols-outlined ${statusIcon}`}>
              battery_full
            </span>
          </div>
        </div>

        <div
          className={`no-scrollbar h-full w-full overflow-y-auto ${
            isPreview ? "pt-5" : "pt-11"
          }`}
        >
          {children}
        </div>

        <div
          className={`pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 rounded-full bg-black/40 ${home} ${
            statusBarTone === "light" ? "bg-white/70" : "bg-black/30"
          }`}
        />
      </div>
    </div>
  );
}
