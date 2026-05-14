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
      <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 md:px-10 lg:px-12 lg:py-10 text-left">
        <div className="mx-auto w-full max-w-5xl min-w-0">{children}</div>
      </main>
    </>
  );
}
