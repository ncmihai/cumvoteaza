import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as schema from "@cumsevoteaza/db";

const state = vi.hoisted(() => ({ rows: new Map<unknown, unknown[]>(), calls: [] as Array<{ table: unknown; fields: unknown; condition?: unknown }>, close: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("drizzle-orm", async (original) => ({ ...await original<object>(), eq: (column: unknown, value: unknown) => ({ column, value }), inArray: (column: unknown, values: unknown[]) => ({ column, values }) }));
vi.mock("./server-db", () => ({
  CACHE_TAGS: {},
  createWebDbSession: () => ({ close: state.close, db: {
    select: (fields: unknown) => ({ from: (table: unknown) => {
      const call = { table, fields, condition: undefined as unknown };
      state.calls.push(call);
      const result = Promise.resolve(state.rows.get(table) ?? []);
      return { where: (condition: unknown) => { call.condition = condition; return Object.assign(result, { limit: () => result }); } };
    } })
  } })
}));
import { getGovernmentRolesForPerson } from "./ministry-data";

beforeEach(() => { state.rows.clear(); state.calls.length = 0; state.close.mockClear(); vi.stubEnv("DATABASE_URL", "configured"); });
afterEach(() => vi.unstubAllEnvs());

it("stops after the scoped roles query for a person with no roles", async () => {
  expect(await getGovernmentRolesForPerson("person-1")).toEqual([]);
  expect(state.calls).toHaveLength(1);
  expect(state.calls[0]?.condition).toEqual({ column: schema.governmentRoles.personId, value: "person-1" });
  expect(state.close).toHaveBeenCalledOnce();
});

it("loads only referenced source URLs and keeps role provenance", async () => {
  state.rows.set(schema.governmentRoles, [{ id: "role-1", personId: "person-1", governmentId: "gov-1", title: "Ministru", startsOn: "2024-01-01", sourceSnapshotId: "source-1" }]);
  state.rows.set(schema.people, [{ id: "person-1", displayName: "Example" }]);
  state.rows.set(schema.governments, [{ id: "gov-1", slug: "gov", name: "Government" }]);
  state.rows.set(schema.sourceSnapshots, [{ id: "source-1", sourceUrl: "https://example.org/source" }]);
  const result = await getGovernmentRolesForPerson("person-1");
  expect(result[0]?.sourceUrl).toBe("https://example.org/source");
  const sourceCall = state.calls.find((call) => call.table === schema.sourceSnapshots);
  expect(sourceCall?.fields).toEqual({ id: schema.sourceSnapshots.id, sourceUrl: schema.sourceSnapshots.sourceUrl });
  expect(sourceCall?.condition).toEqual({ column: schema.sourceSnapshots.id, values: ["source-1"] });
  expect(state.calls.some((call) => call.table === schema.ministries || call.table === schema.ministryIncarnations)).toBe(false);
  expect(state.calls.every((call) => call.condition)).toBe(true);
  expect(state.close).toHaveBeenCalledOnce();
});
