import { describe, expect, it } from "vitest";
import { assertNotProductionByAccident, endpointOf } from "@cumsevoteaza/db";

const production = "ep-steep-fire-al2fv8u7-pooler.c-3.eu-central-1.aws.neon.tech";
const productionUrl = `postgresql://user:secret@${production}/neondb?sslmode=require`;
const devUrl = "postgresql://user:secret@ep-plain-frog-alpf26wn-pooler.c-3.eu-central-1.aws.neon.tech/neondb";

describe("production guard", () => {
  it("refuses the production endpoint, pooled or direct, unless the wrapper allowed it", () => {
    expect(() => assertNotProductionByAccident(productionUrl, {}, production)).toThrow(/npm run prod/);
    expect(() => assertNotProductionByAccident(productionUrl.replace("-pooler", ""), {}, production)).toThrow(/production/);
    expect(() => assertNotProductionByAccident(productionUrl, { ALLOW_PRODUCTION: "1" }, production)).not.toThrow();
  });

  it("lets every other database through, and does nothing when no production host is configured", () => {
    expect(() => assertNotProductionByAccident(devUrl, {}, production)).not.toThrow();
    expect(() => assertNotProductionByAccident(productionUrl, {}, undefined)).not.toThrow();
    expect(endpointOf(productionUrl)).toBe("ep-steep-fire-al2fv8u7");
    expect(endpointOf("not a url")).toBeUndefined();
  });
});
