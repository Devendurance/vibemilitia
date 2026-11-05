import { createHash } from "node:crypto";
import {
  DEFAULT_EQUIPPED,
  validateEquipped,
  type EquippedCosmetics,
} from "../../src/game/progression/cosmetics";

export const TOKEN_PREFIX = "vm_guest_";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeName(value: string): string {
  const cleaned = value.replace(/[^\w .-]/g, "").trim().slice(0, 18);
  return cleaned.length > 0 ? cleaned : "VIBER-GUEST";
}

/**
 * Normalizes a self-declared X handle. This is syntax validation only. Vibe
 * Militia has no X OAuth verification, so a valid handle is never presented as
 * verified.
 */
export function normalizeXHandle(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().replace(/^@+/, "");
  if (cleaned.length === 0) return null;
  if (!/^[A-Za-z0-9_]{1,15}$/.test(cleaned)) return undefined;
  return cleaned;
}

export function parseEquipped(value: string): EquippedCosmetics {
  try {
    const parsed = JSON.parse(value) as Partial<EquippedCosmetics>;
    return validateEquipped(parsed, 999);
  } catch {
    return { ...DEFAULT_EQUIPPED };
  }
}
