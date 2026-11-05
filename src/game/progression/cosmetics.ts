export type CosmeticKind = "title" | "badge" | "elimination" | "trail";

export interface CosmeticUnlock {
  id: string;
  kind: CosmeticKind;
  name: string;
  description: string;
  level: number;
}

export interface EquippedCosmetics {
  titleId: string;
  badgeId: string;
  eliminationId: string;
  trailId: string;
}

/**
 * Small, level-based collection. Levels are intentionally close together so
 * the first few matches produce a visible reward.
 */
export const COSMETIC_UNLOCKS: readonly CosmeticUnlock[] = [
  {
    id: "title-rookie",
    kind: "title",
    name: "ROOKIE",
    description: "Fresh out of the drop bay.",
    level: 1,
  },
  {
    id: "title-drop-ready",
    kind: "title",
    name: "DROP READY",
    description: "First match banked. The drop bay knows you now.",
    level: 2,
  },
  {
    id: "title-field-tested",
    kind: "title",
    name: "FIELD TESTED",
    description: "Survived the first real firefight.",
    level: 3,
  },
  {
    id: "title-vibe-veteran",
    kind: "title",
    name: "VIBE VETERAN",
    description: "A familiar face in Sector 07.",
    level: 6,
  },
  {
    id: "title-sector-legend",
    kind: "title",
    name: "SECTOR LEGEND",
    description: "The arena knows the name.",
    level: 10,
  },
  {
    id: "badge-lime-recruit",
    kind: "badge",
    name: "LIME RECRUIT",
    description: "Signal-lime recruit chevron.",
    level: 1,
  },
  {
    id: "badge-copper-strike",
    kind: "badge",
    name: "COPPER STRIKE",
    description: "Copper strike badge for confirmed eliminations.",
    level: 5,
  },
  {
    id: "badge-sky-runner",
    kind: "badge",
    name: "SKY RUNNER",
    description: "Sky-mist wings for vertical play.",
    level: 8,
  },
  {
    id: "badge-sector-icon",
    kind: "badge",
    name: "SECTOR ICON",
    description: "A bright ring for the arena regulars.",
    level: 12,
  },
  {
    id: "elimination-lime",
    kind: "elimination",
    name: "LIME BURST",
    description: "Default lime voxel elimination burst.",
    level: 1,
  },
  {
    id: "elimination-copper",
    kind: "elimination",
    name: "COPPER SHATTER",
    description: "Warm copper shards on elimination.",
    level: 4,
  },
  {
    id: "elimination-toxic",
    kind: "elimination",
    name: "TOXIC POP",
    description: "Green pop with a toxic edge.",
    level: 7,
  },
  {
    id: "trail-lime",
    kind: "trail",
    name: "LIME EXHAUST",
    description: "Default lime jetpack exhaust.",
    level: 1,
  },
  {
    id: "trail-copper",
    kind: "trail",
    name: "COPPER COMET",
    description: "Copper comet trail while thrusting.",
    level: 6,
  },
  {
    id: "trail-sky",
    kind: "trail",
    name: "SKY STREAK",
    description: "Cool sky streak while thrusting.",
    level: 9,
  },
];

export const DEFAULT_EQUIPPED: EquippedCosmetics = {
  titleId: "title-rookie",
  badgeId: "badge-lime-recruit",
  eliminationId: "elimination-lime",
  trailId: "trail-lime",
};

export function cosmeticById(id: string): CosmeticUnlock | null {
  return COSMETIC_UNLOCKS.find((entry) => entry.id === id) ?? null;
}

export function unlockedCosmetics(level: number): CosmeticUnlock[] {
  const safeLevel = Math.max(1, Math.floor(level));
  return COSMETIC_UNLOCKS.filter((entry) => entry.level <= safeLevel);
}

export function unlockedIds(level: number): string[] {
  return unlockedCosmetics(level).map((entry) => entry.id);
}

export function isCosmeticUnlocked(id: string, level: number): boolean {
  const cosmetic = cosmeticById(id);
  return Boolean(cosmetic && cosmetic.level <= Math.max(1, Math.floor(level)));
}

/**
 * Validates a requested loadout against the player's level. Any invalid or
 * locked slot falls back to the default for that kind, never to paid content.
 */
export function validateEquipped(
  requested: Partial<EquippedCosmetics> | null | undefined,
  level: number,
): EquippedCosmetics {
  const next = { ...DEFAULT_EQUIPPED };
  if (!requested) return next;
  const slots: Array<keyof EquippedCosmetics> = [
    "titleId",
    "badgeId",
    "eliminationId",
    "trailId",
  ];
  const kindBySlot: Record<keyof EquippedCosmetics, CosmeticKind> = {
    titleId: "title",
    badgeId: "badge",
    eliminationId: "elimination",
    trailId: "trail",
  };
  for (const slot of slots) {
    const candidate = requested[slot];
    if (typeof candidate !== "string") continue;
    const cosmetic = cosmeticById(candidate);
    if (
      cosmetic &&
      cosmetic.kind === kindBySlot[slot] &&
      cosmetic.level <= Math.max(1, Math.floor(level))
    ) {
      next[slot] = candidate;
    }
  }
  return next;
}

export function cosmeticTint(id: string): number {
  switch (id) {
    case "elimination-copper":
      return 0xc7692f;
    case "elimination-toxic":
      return 0x9bff5a;
    case "trail-copper":
      return 0xc7692f;
    case "trail-sky":
      return 0x9bd8f2;
    default:
      return 0xd7ff2e;
  }
}
