import { describe, expect, it } from "vitest";
import { loadServerConfig } from "../../../server/config";

describe("server config", () => {
  it("uses development defaults", () => {
    const config = loadServerConfig({});
    expect(config.port).toBe(2567);
    expect(config.reconnectGraceSeconds).toBe(20);
    expect(config.allowedOrigins).toContain("http://localhost:3000");
    expect(config.production).toBe(false);
  });

  it("requires explicit origins in production", () => {
    expect(() => loadServerConfig({ NODE_ENV: "production" })).toThrow(
      "ALLOWED_ORIGINS",
    );
  });

  it("normalizes production origins and rejects wildcards", () => {
    const config = loadServerConfig({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://play.example.com, https://second.example.com/",
    });
    expect(config.allowedOrigins).toEqual([
      "https://play.example.com",
      "https://second.example.com",
    ]);
    expect(() =>
      loadServerConfig({
        NODE_ENV: "production",
        ALLOWED_ORIGINS: "*",
      }),
    ).toThrow("wildcard");
  });

  it("clamps reconnect grace and countdown", () => {
    const config = loadServerConfig({
      RECONNECT_GRACE_SECONDS: "999",
      MATCH_COUNTDOWN_MS: "999999",
    });
    expect(config.reconnectGraceSeconds).toBe(120);
    expect(config.matchCountdownMs).toBe(60_000);
  });

  it("rejects an invalid public URL", () => {
    expect(() =>
      loadServerConfig({ PUBLIC_GAME_SERVER_URL: "not-a-url" }),
    ).toThrow("absolute URL");
  });
});
