function decisionLabel(d: string, friendly: boolean) {
  if (!friendly) return d === "OTP" ? "OTP" : d;
  if (d === "ALLOW") return "Approve";
  if (d === "BLOCK") return "Reject";
  if (d === "OTP") return "Challenge";
  if (d === "PRIORITIZE") return "Prioritize";
  return d;
}

type Tone = "success" | "warning" | "error" | "neutral";

function decisionTone(d: string): Tone {
  if (d === "ALLOW") return "success";
  if (d === "BLOCK") return "error";
  if (d === "OTP" || d === "PRIORITIZE") return "warning";
  return "neutral";
}

function toneClasses(tone: Tone): { text: string; dot: string } {
  if (tone === "success") return { text: "text-success", dot: "bg-success" };
  if (tone === "warning") return { text: "text-warning", dot: "bg-warning" };
  if (tone === "error") return { text: "text-error", dot: "bg-error" };
  return { text: "text-on-surface-variant", dot: "bg-on-surface-variant/40" };
}

export function DecisionBadge({
  d,
  variant = "tile",
  friendly = false,
}: {
  d: string;
  variant?: "tile" | "pill";
  friendly?: boolean;
}) {
  const tone = decisionTone(d);
  const { text, dot } = toneClasses(tone);
  const sizing = variant === "pill" ? "text-xs font-medium" : "text-xs font-medium";
  return (
    <span className={`inline-flex items-center gap-1.5 ${sizing} ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {decisionLabel(d, friendly)}
    </span>
  );
}
