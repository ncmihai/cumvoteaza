import { describe, expect, it } from "vitest";
import { unmatchedRewrite } from "./unmatched-route";

describe("unmatchedRewrite", () => {
  it("sends a single unknown segment to the not-found page", () => {
    for (const path of ["/xx", "/about", "/login", "/nope/deeper"]) expect(unmatchedRewrite(path), path).toBe("/_unmatched/404");
  });

  it("leaves the languages, the API, assets and the bare root alone", () => {
    for (const path of ["/", "/ro", "/en/votes", "/ro/votes/abc", "/api/cron/daily-import", "/_next/static/x.js", "/favicon.ico", "/icon.svg", "/chambers/senate.svg"]) expect(unmatchedRewrite(path), path).toBeUndefined();
  });
});
