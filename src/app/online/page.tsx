import type { Metadata } from "next";
import { OnlineShell } from "@/components/online/OnlineShell";

export const metadata: Metadata = {
  title: "Vibe Militia | Online Free-for-All",
  description:
    "Join a server-authoritative Vibe Militia free-for-all room with up to eight combatants.",
};

export default function OnlinePage() {
  return <OnlineShell />;
}
