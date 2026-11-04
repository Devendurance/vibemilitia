import rawRoster from "./roster.json";

export interface CharacterSkin {
  skinId: string;
  displayName: string;
  sourcePath: string;
  archivedSourcePath: string;
  cutoutPath: string;
  textureKey: string;
  reportPath: string;
  previewPath: string;
  sourceSha256: string;
  cutoutSha256: string;
  cutoutSize: [number, number];
  transparentRatio: number;
  validated: boolean;
}

interface RosterFile {
  version: number;
  generatedBy: string;
  humanDefaultSkinId: string;
  characters: CharacterSkin[];
}

const roster = rawRoster as RosterFile;

if (roster.characters.length === 0) {
  throw new Error("Character roster is empty");
}
if (!roster.characters.every((skin) => skin.validated)) {
  throw new Error("Character roster contains an unvalidated skin");
}
if (new Set(roster.characters.map((skin) => skin.skinId)).size !== roster.characters.length) {
  throw new Error("Character roster contains duplicate skin IDs");
}
if (
  !roster.characters.some(
    (skin) => skin.skinId === roster.humanDefaultSkinId,
  )
) {
  throw new Error("Human default skin is missing from the roster");
}

export const CHARACTER_ROSTER: readonly CharacterSkin[] = roster.characters;
export const HUMAN_DEFAULT_SKIN_ID = roster.humanDefaultSkinId;
export const CHARACTER_SKIN_IDS = CHARACTER_ROSTER.map((skin) => skin.skinId);
export const CHARACTER_TEXTURE_KEYS = CHARACTER_ROSTER.map(
  (skin) => skin.textureKey,
);

const byId = new Map(
  CHARACTER_ROSTER.map((skin) => [skin.skinId, skin] as const),
);
const defaultSkin =
  byId.get(HUMAN_DEFAULT_SKIN_ID) ?? CHARACTER_ROSTER[0];

export function getCharacterSkin(skinId: string | null | undefined): CharacterSkin {
  return (skinId ? byId.get(skinId) : undefined) ?? defaultSkin;
}
