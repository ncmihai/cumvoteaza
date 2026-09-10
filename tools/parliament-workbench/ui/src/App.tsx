import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { getStatus } from "./api";
import { Activity } from "./components/Activity";
import { AnalyticsLab } from "./components/AnalyticsLab";
import { Assets } from "./components/Assets";
import { CommandBar } from "./components/CommandBar";
import { Dashboard } from "./components/Dashboard";
import { DataHealth } from "./components/DataHealth";
import { Datasets } from "./components/Datasets";
import { EntityDetail } from "./components/EntityDetail";
import { ImportCockpit } from "./components/ImportCockpit";
import { InstitutionAtlas } from "./components/InstitutionAtlas";
import { JobDetail } from "./components/JobDetail";
import { MigrateExport } from "./components/MigrateExport";
import { ModelLab } from "./components/ModelLab";
import { PublishGate } from "./components/PublishGate";
import { ReviewCenter } from "./components/ReviewCenter";
import { WikiSearch } from "./components/WikiSearch";
import type { StatusPayload } from "./types";

type TabId =
  | "dashboard"
  | "jobs"
  | "imports"
  | "atlas"
  | "assets"
  | "wiki"
  | "audit"
  | "reviews"
  | "analytics"
  | "health"
  | "publish"
  | "migrate"
  | "datasets";
type RouteState = { kind: "tab"; tab: TabId } | { kind: "entity"; entityType: string; entityId: string } | { kind: "job"; jobId: string };

const navGroups: Array<{ label: string; items: Array<{ id: TabId; label: string }> }> = [
  {
    label: "Operate",
    items: [
      { id: "dashboard", label: "Dashboard" },
      { id: "imports", label: "Import Cockpit" },
      { id: "jobs", label: "Activity" },
      { id: "assets", label: "Assets" }
    ]
  },
  {
    label: "Review",
    items: [
      { id: "health", label: "Data Health" },
      { id: "reviews", label: "Review Center" },
      { id: "audit", label: "Model Lab" },
      { id: "analytics", label: "Analytics Lab" }
    ]
  },
  {
    label: "Knowledge",
    items: [
      { id: "wiki", label: "Wiki Search" },
      { id: "atlas", label: "Institution Atlas" },
      { id: "datasets", label: "Datasets" }
    ]
  },
  {
    label: "Publish",
    items: [
      { id: "publish", label: "Publish Gate" },
      { id: "migrate", label: "Migrate / Export" }
    ]
  }
];
const tabs = navGroups.flatMap((group) => group.items);
const quickActions = [
  { id: "wiki", label: "Wiki" },
  { id: "imports", label: "Import" },
  { id: "health", label: "Health" },
  { id: "reviews", label: "Review" },
  { id: "jobs", label: "Jobs" }
];

export function App(): ReactElement {
  const [route, setRoute] = useState<RouteState>(() => parseRoute());
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const activeTab = route.kind === "tab" ? route.tab : route.kind === "job" ? "jobs" : "wiki";

  async function refreshStatus(): Promise<void> {
    try {
      setStatusError(null);
      setStatus(await getStatus());
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    void refreshStatus();
    const onPopState = () => setRoute(parseRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigateTab(tab: TabId): void {
    const url = tab === "dashboard" ? "/" : `/?tab=${tab}`;
    window.history.pushState({}, "", url);
    setRoute({ kind: "tab", tab });
  }

  function navigateTabById(tabId: string): void {
    if (isTabId(tabId)) navigateTab(tabId);
  }

  function openEntity(entityType: string, entityId: string): void {
    const url = `/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`;
    window.history.pushState({}, "", url);
    setRoute({ kind: "entity", entityType, entityId });
  }

  function openJob(jobId: string): void {
    const url = `/jobs/${encodeURIComponent(jobId)}`;
    window.history.pushState({}, "", url);
    setRoute({ kind: "job", jobId });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">CV</span>
          <div>
            <h1>CumVoteaza Workbench</h1>
            <p>Local data and model review</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Workbench sections">
          {navGroups.map((group) => (
            <section key={group.label} className="nav-group" aria-label={group.label}>
              <h2>{group.label}</h2>
              {group.items.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={activeTab === tab.id ? "tab active" : "tab"}
                  onClick={() => navigateTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </section>
          ))}
        </nav>
        <div className="sidebar-status">
          <StatusDot ok={Boolean(status?.database.ok)} label="DB" />
          <StatusDot ok={Boolean(status?.ollama.ok)} label="Ollama" />
          <StatusDot ok={Boolean(status?.digiStorage?.configured)} label="Digi" />
          <StatusDot ok={Boolean(status?.wiki.built)} label="Wiki" />
          <StatusDot ok={Boolean(status?.workbenchState?.ok)} label="State" />
          <StatusDot ok={Boolean(status?.institutionAtlas?.built)} label="Atlas" />
        </div>
      </aside>

      <main className="main">
        <CommandBar routeLabel={routeLabel(route)} status={status} quickActions={quickActions} onNavigateTab={navigateTabById} onOpenEntity={openEntity} />
        <div className="main-content">
          {statusError ? <div className="banner danger">API unavailable: {statusError}</div> : null}
          {route.kind === "entity" ? <EntityDetail entityType={route.entityType} entityId={route.entityId} onOpenEntity={openEntity} onBackToSearch={() => navigateTab("wiki")} /> : null}
          {route.kind === "job" ? <JobDetail jobId={route.jobId} onBack={() => navigateTab("jobs")} onOpenJob={openJob} /> : null}
          {route.kind === "tab" && activeTab === "dashboard" ? <Dashboard status={status} onRefresh={refreshStatus} /> : null}
          {route.kind === "tab" && activeTab === "jobs" ? <Activity onOpenJob={openJob} /> : null}
          {route.kind === "tab" && activeTab === "imports" ? <ImportCockpit /> : null}
          {route.kind === "tab" && activeTab === "atlas" ? <InstitutionAtlas /> : null}
          {route.kind === "tab" && activeTab === "assets" ? <Assets /> : null}
          {route.kind === "tab" && activeTab === "wiki" ? <WikiSearch onOpenEntity={openEntity} /> : null}
          {route.kind === "tab" && activeTab === "audit" ? <ModelLab defaultModel={status?.model ?? "qwen3:8b"} onRunComplete={refreshStatus} /> : null}
          {route.kind === "tab" && activeTab === "reviews" ? <ReviewCenter onOpenEntity={openEntity} /> : null}
          {route.kind === "tab" && activeTab === "analytics" ? <AnalyticsLab /> : null}
          {route.kind === "tab" && activeTab === "health" ? <DataHealth /> : null}
          {route.kind === "tab" && activeTab === "publish" ? <PublishGate /> : null}
          {route.kind === "tab" && activeTab === "migrate" ? <MigrateExport /> : null}
          {route.kind === "tab" && activeTab === "datasets" ? <Datasets /> : null}
        </div>
      </main>
    </div>
  );
}

function parseRoute(): RouteState {
  const entityMatch = window.location.pathname.match(/^\/entities\/([^/]+)\/([^/]+)$/);
  if (entityMatch) {
    return {
      kind: "entity",
      entityType: decodeURIComponent(entityMatch[1]),
      entityId: decodeURIComponent(entityMatch[2])
    };
  }
  const jobMatch = window.location.pathname.match(/^\/jobs\/([^/]+)$/);
  if (jobMatch) {
    return { kind: "job", jobId: decodeURIComponent(jobMatch[1]) };
  }
  const tab = new URLSearchParams(window.location.search).get("tab") as TabId | null;
  if (tab && tabs.some((item) => item.id === tab)) return { kind: "tab", tab };
  return { kind: "tab", tab: "dashboard" };
}

function isTabId(value: string): value is TabId {
  return tabs.some((tab) => tab.id === value);
}

function routeLabel(route: RouteState): string {
  if (route.kind === "entity") return `${route.entityType}: ${route.entityId}`;
  if (route.kind === "job") return `job: ${route.jobId}`;
  return tabs.find((tab) => tab.id === route.tab)?.label ?? "Dashboard";
}

interface StatusDotProps {
  ok: boolean;
  label: string;
}

function StatusDot({ ok, label }: StatusDotProps): ReactElement {
  return (
    <span className={ok ? "status-dot ok" : "status-dot"}>
      <span aria-hidden="true" />
      {label}
    </span>
  );
}
