"use client";

import dynamic from "next/dynamic";

const LogsClient = dynamic(
  () => import("./client").then((module) => module.Client),
  {
    ssr: false,
    loading: () => <div>Loading...</div>,
  },
);

export function LogsPageClient() {
  return <LogsClient />;
}
