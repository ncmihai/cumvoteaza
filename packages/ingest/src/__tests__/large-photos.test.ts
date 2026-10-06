import { describe, expect, it } from "vitest";
import { largePhotoPath } from "../assets/large-photos";

describe("largePhotoPath", () => {
  it("finds the larger portrait a profile links from its photo", () => {
    const html = `<a href="/parlamentari/l2024/mari/MititeluEduardTatian.JPG"><img src="/parlamentari/l2024/MititeluEduardTatian.JPG"></a>`;
    expect(largePhotoPath(html)).toBe("/parlamentari/l2024/mari/MititeluEduardTatian.JPG");
  });
  it("returns nothing when the profile has no large version", () => {
    expect(largePhotoPath(`<img src="/parlamentari/l2024/Barbu.jpg">`)).toBeUndefined();
  });
  it("does not take a link to another legislature's folder pattern by accident", () => {
    expect(largePhotoPath(`<a href="/parlamentari/mari/x.jpg">x</a>`)).toBeUndefined();
  });
});
