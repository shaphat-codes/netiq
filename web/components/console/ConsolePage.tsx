"use client";

import { TopBar } from "./TopBar";

export function ConsolePage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <TopBar title={title} />
      <main className="min-w-0 flex-1 overflow-auto px-12 py-10 text-left">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </>
  );
}
