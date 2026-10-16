"use client";

import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { ProjectCard } from "@/components/project-card";
import type { ProjectSummary } from "@/lib/dashboard";

function toCard(p: ProjectSummary) {
  return {
    name: p.name,
    acronym: p.acronym,
    state: p.state,
    plazaCount: p.plazaCount,
    progressPct: p.progressPct,
    openCount: p.task.total - p.task.completed,
    blockedCount: p.task.blocked,
    overdueCount: p.task.overdue,
  };
}

/** Projects index (T-031 companion). Cards link to /projects/[id]. */
export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/projects", { credentials: "same-origin" });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok) throw new Error();
        const data = await res.json();
        const list: ProjectSummary[] = Array.isArray(data) ? data : (data.projects ?? data.items ?? []);
        if (!cancelled) setProjects(list);
      } catch {
        if (!cancelled) setError("Failed to load projects. Retry.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-[#F4F5F7] font-body text-[#17222C]">
      <AppSidebar active="Projects" />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[64px] items-center gap-3 border-b border-[rgba(23,34,44,0.08)] bg-white px-4">
          <p className="font-display text-base font-semibold tracking-[-0.02em] md:hidden">
            Site Tracker
          </p>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-[#0E121B]">
              Projects
            </h1>
            <p className="font-body text-sm text-[#5C6F7E]">
              {projects === null && !error
                ? "Loading…"
                : `${projects?.length ?? 0} projects · select one for plaza health`}
            </p>
          </div>
          {projects === null && !error ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-[12px] bg-white" />
              ))}
            </div>
          ) : error ? (
            <p role="alert" className="rounded-md border p-4 font-body text-sm text-[#991B1B]">
              {error}
            </p>
          ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(projects ?? []).map((p) => (
              <a key={p.id} href={`/projects/${p.id}`} className="block">
                <ProjectCard {...toCard(p)} />
              </a>
            ))}
          </div>
          )}
        </main>
      </div>
    </div>
  );
}
