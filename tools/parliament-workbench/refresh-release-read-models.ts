import { refreshReadModels } from "../../packages/ingest/src/read-models";

if (process.env.WORKBENCH_RELEASE_REFRESH !== "1" || !process.env.DATABASE_URL || process.env.COCKPIT_DATABASE_ROLE) {
  throw new Error("Release refresh requires an explicit publication target and capability.");
}
console.log(JSON.stringify(await refreshReadModels()));
