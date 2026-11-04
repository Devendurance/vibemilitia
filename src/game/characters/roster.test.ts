import { describe, expect, it } from "vitest";
import {
  CHARACTER_ROSTER,
  CHARACTER_TEXTURE_KEYS,
  HUMAN_DEFAULT_SKIN_ID,
  getCharacterSkin,
} from "./roster";

describe("validated character roster", () => {
  it("contains ten distinct validated official skins", () => {
    expect(CHARACTER_ROSTER).toHaveLength(10);
    expect(new Set(CHARACTER_ROSTER.map((skin) => skin.skinId)).size).toBe(10);
    expect(CHARACTER_ROSTER.every((skin) => skin.validated)).toBe(true);
    expect(new Set(CHARACTER_TEXTURE_KEYS).size).toBe(10);
  });

  it("includes the VIBER-010 human default and resolves it by ID", () => {
    const defaultSkin = getCharacterSkin(HUMAN_DEFAULT_SKIN_ID);
    expect(defaultSkin.skinId).toBe("viber-010");
    expect(defaultSkin.textureKey).toBe("character-viber-010");
  });

  it("falls back to VIBER-010 for an unknown skin ID", () => {
    expect(getCharacterSkin("unknown-skin").skinId).toBe(HUMAN_DEFAULT_SKIN_ID);
    expect(getCharacterSkin(null).skinId).toBe(HUMAN_DEFAULT_SKIN_ID);
  });

  it("keeps every cutout under the public sprite path", () => {
    expect(
      CHARACTER_ROSTER.every((skin) =>
        skin.cutoutPath.startsWith("/sprites/"),
      ),
    ).toBe(true);
  });
});
