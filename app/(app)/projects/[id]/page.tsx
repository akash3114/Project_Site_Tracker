"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { ProgressBar } from "@/components/progress-bar";


type ProjectDetail = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  plazaCount: number;
  task: { total: number; completed: number; blocked: number; overdue: number };
  progressPct: number;
};

type PlazaRow = {
  id: string;
  name: string;
  chainage?: string | null;
  highway?: string | null;
  status: string;
  task: { total: number; completed: number; blocked: number; overdue: number };
  progressPct: number;
};

/** Project detail (T-031): header + plaza health list → /plazas/[id]. */
export default function ProjectPage() {
  const params = useParams();
  const projectId = typeof params.id === "string" ? params.id : "";

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [plazas, setPlazas] = useState<PlazaRow[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "denied" | "missing" | "error">("loading");

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const [pr, lr] = await Promise.all([
          fetch(`/api/projects/${projectId}`, { credentials: "same-origin" }),
          fetch(`/api/plazas?projectId=${projectId}`, { credentials: "same-origin" }),
        ]);
        if (pr.status === 403) return void (!cancelled && setState("denied"));
        if (pr.status === 404) return void (!cancelled && setState("missing"));
        if (!pr.ok || !lr.ok) return void (!cancelled && setState("error"));
        const p = (await pr.json()) as ProjectDetail;
        const l = await lr.json();
        if (cancelled) return;
        setProject(p);
        setPlazas(Array.isArray(l) ? l : (l.plazas ?? l.items ?? []));
        setState("ok");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

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
          <nav aria-label="Breadcrumb" className="font-mono text-xs text-[#8A97A3]">
            <a href="/" className="hover:text-[#17222C]">Dashboard</a>
            {" / "}
            <a href="/projects" className="hover:text-[#17222C]">Projects</a>
            {" / "}
            <span aria-current="page" className="text-[#17222C]">{project?.name ?? "…"}</span>
          </nav>

          {state === "loading" ? (
            <p className="text-sm text-[#5C6F7E]">Loading…</p>
          ) : state === "denied" ? (
            <p role="alert" className="rounded-md border border-[#F3C2C2] bg-[#FEF2F2] p-4 text-sm text-[#991B1B]">
              You don&apos;t have access to this project.
            </p>
          ) : state === "missing" ? (
            <p role="alert" className="rounded-md border p-4 text-sm">Project not found.</p>
          ) : state === "error" ? (
            <p role="alert" className="rounded-md border p-4 text-sm">Failed to load. Retry.</p>
          ) : project ? (
            <>
              <div>
                <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-[#0E121B]">
                  {project.name}
                </h1>
                {project.description ? (
                  <p className="font-body text-sm text-[#5C6F7E]">{project.description}</p>
                ) : null}
                <div className="mt-3 max-w-md">
                  <ProgressBar value={project.progressPct} />
                  <p className="mt-1 font-mono text-xs text-[#5C6F7E]">
                    {project.progressPct}% · {project.task.completed}/{project.task.total} done ·{" "}
                    {project.task.blocked} blocked · {project.task.overdue} overdue
                  </p>
                </div>
              </div>

              <section aria-label="Plazas" className="flex flex-col gap-2">
                {plazas.map((z) => (
                  <a
                    key={z.id}
                    href={`/plazas/${z.id}`}
                    className="flex min-h-[44px] flex-col gap-2 rounded-[12px] border border-[rgba(23,34,44,0.08)] bg-white p-4 pst-transition hover:border-[#5E6AD2]/40"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-display text-base font-semibold text-[#0E121B]">
                        {z.name}
                      </span>
                      {z.chainage ? (
                        <span className="font-mono text-xs text-[#8A97A3]">{z.chainage}</span>
                      ) : null}
                      <span className="ml-auto font-mono text-xs text-[#5C6F7E]">
                        {z.task.completed}/{z.task.total}
                        {z.task.overdue > 0 ? (
                          <span className="text-[#DC2626]"> · {z.task.overdue} overdue</span>
                        ) : null}
                        {z.task.blocked > 0 ? (
                          <span className="text-[#92400E]"> · {z.task.blocked} blocked</span>
                        ) : null}
                      </span>
                    </div>
                    <ProgressBar value={z.progressPct} />
                  </a>
                ))}
                {plazas.length === 0 ? (
                  <p className="text-sm text-[#5C6F7E]">No plazas visible in this project.</p>
                ) : null}
              </section>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
