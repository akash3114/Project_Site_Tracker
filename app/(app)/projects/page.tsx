"use client";

import { useEffect, useState } from "react";

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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-[#102D27]">
              Projects
            </h1>
            <p className="font-body text-sm text-[#586760]">
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
  );
}
