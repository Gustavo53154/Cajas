"use client";

import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ReactNode } from "react";

let _convex: InstanceType<typeof ConvexReactClient> | null = null;
function getConvexClient() {
  if (_convex) return _convex;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  _convex = new ConvexReactClient(
    url && !url.includes("placeholder") ? url : "https://placeholder.convex.cloud",
    { unsavedChangesWarning: false, verbose: false }
  );
  return _convex;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const client = getConvexClient();
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
