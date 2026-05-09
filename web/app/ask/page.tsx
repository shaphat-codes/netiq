import Link from "next/link";

import { ChatExperience } from "@/components/chat/ChatExperience";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata = {
  title: "Ask NetIQ — should I trust this number?",
  description:
    "Free, no-signup phone-number trust check. Describe what you want to do (send money, deliver, onboard) and NetIQ uses live network signals to recommend allow / verify / block.",
};

export default function AskPage() {
  return (
    <div className="bg-background text-on-background flex min-h-screen flex-col">
      <header className="border-outline-variant bg-surface sticky top-0 z-20 border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 md:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-on-surface text-base font-semibold tracking-tight">NetIQ</span>
            <span className="text-on-surface-variant text-xs">/ ask</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/demo"
              className="text-on-surface-variant hover:text-on-surface hidden items-center gap-1.5 text-sm transition-colors sm:inline-flex"
            >
              <span className="material-symbols-outlined text-[16px] leading-none">apps</span>
              Demos
            </Link>
            <ThemeToggle variant="outline" />
            <Link
              href="/login"
              className="bg-on-surface text-surface inline-flex h-8 items-center rounded-md px-3 text-sm font-medium"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <ChatExperience mode={{ kind: "public" }} />
      </main>

      <footer className="border-outline-variant text-on-surface-variant border-t px-4 py-3 text-center text-[11px]">
        Powered by NetIQ — the agent-ready layer for Nokia Network as Code.
      </footer>
    </div>
  );
}
