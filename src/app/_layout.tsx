import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { C } from "../lib/theme";
import { useTranscriptWorker } from "../lib/useTranscriptWorker";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!url) throw new Error("Set EXPO_PUBLIC_CONVEX_URL in .env.local (npx convex dev writes it)");
const convex = new ConvexReactClient(url, { unsavedChangesWarning: false });

function TranscriptWorker() {
  useTranscriptWorker();
  return null;
}

export default function RootLayout() {
  return (
    <ConvexProvider client={convex}>
      <TranscriptWorker />
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: C.bg },
          animation: "slide_from_right",
        }}
      />
    </ConvexProvider>
  );
}
