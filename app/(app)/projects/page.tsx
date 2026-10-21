"use client";

import { useEffect, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { ProjectCard } from "@/components/project-card";

type ProjectItem = {
  id: string;
  name: string;
  acronym: string | null;
  state: string | null;
  round: string | null;
  active: boolean;
  status: "ACTIVE" | "ARCHIVED";
  company: { id: string; name: string; code: string } | null;
  plazaCount: number;
  task: { total: number; completed: number; blocked: number; overdue: number };
  progressPct: number;
};

type CompanyGroup = {
  id: string;
  name: string;
  code: string;
  projects: ProjectItem[];
};

function groupByCompany(projects: ProjectItem[]): CompanyGroup[] {
  const groups = new Map<string, CompanyGroup>();
  for (const project of projects) {
    const id = project.company?.id ?? "unassigned";
    const existing = groups.get(id);
    if (existing) {
      existing.projects.push(project);
      continue;
    }
    groups.set(id, {
      id,
      name: project.company?.name ?? "Unassigned company",
      code: project.company?.code ?? "—",
      projects: [project],
    });
  }
  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Projects index (T-031 companion), grouped by owning company. */
export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectItem[] | null>(null);
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
        const list: ProjectItem[] = Array.isArray(data)
          ? data
          : (data.projects ?? data.items ?? []);
        if (!cancelled) setProjects(list);
      } catch {
        if (!cancelled) setError("Failed to load projects. Retry.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = groupByCompany(projects ?? []);
  const archivedCount = (projects ?? []).filter((p) => !p.active).length;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <PageHeader
        overline="Company portfolios"
        title="Projects"
        subtitle={
          projects === null && !error
            ? "Loading…"
            : `${projects?.length ?? 0} projects · ${groups.length} ${
                groups.length === 1 ? "company" : "companies"
              }${archivedCount ? ` · ${archivedCount} archived` : ""} · select one for plaza health`
        }
      />
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
      ) : groups.length === 0 ? (
        <p className="rounded-[12px] border border-[#CDD6CE] bg-white p-8 text-center font-body text-sm text-[#586760]">
          No projects are visible to your account yet.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((company) => {
            const plazaCount = company.projects.reduce(
              (sum, p) => sum + p.plazaCount,
              0,
            );
            return (
              <section
                key={company.id}
                aria-label={company.name}
                className="flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[#CDD6CE] pb-2">
                  <span className="rounded-[6px] border border-[#CDD6CE] bg-white px-2 py-0.5 font-mono text-[11px] font-medium text-[#173B33]">
                    {company.code}
                  </span>
                  <h2 className="font-display text-base font-semibold tracking-[-0.02em] text-[#102D27]">
                    {company.name}
                  </h2>
                  <span className="ml-auto font-mono text-xs text-[#66756D]">
                    {company.projects.length}{" "}
                    {company.projects.length === 1 ? "project" : "projects"} ·{" "}
                    {plazaCount} {plazaCount === 1 ? "plaza" : "plazas"}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {company.projects.map((project) => (
                    <a
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className={project.active ? "block" : "block opacity-70"}
                    >
                      <ProjectCard
                        name={project.name}
                        acronym={project.acronym}
                        state={project.state}
                        status={project.active ? "Active" : "Archived"}
                        plazaCount={project.plazaCount}
                        progressPct={project.progressPct}
                        openCount={project.task.total - project.task.completed}
                        blockedCount={project.task.blocked}
                        overdueCount={project.task.overdue}
                      />
                    </a>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
