import { describe, expect, it } from "vitest";
import { tidySlug } from "../identity/member-slug-repair";

describe("member profile addresses that carry a source key", () => {
  it("get the address the record id gives, and nothing else changes", () => {
    expect(tidySlug("aurel-oprinoiu-senate-4fc59328-a7c5-40d2-ad99-27599b0bd880", "member-senate-2020-89")).toBe("aurel-oprinoiu-senate-2020-89");
    expect(tidySlug("emil-boc-deputies-2012-12", "member-deputies-2012-12")).toBeUndefined();
    expect(tidySlug("emil-boc", "member-deputies-2012-12")).toBeUndefined();
  });
});
