"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { TaskTable, type PlazaTaskItem } from "@/components/task-table";
import { TaskDrawer } from "@/components/task-drawer";
import type { AssigneeOption } from "@/components/task-filters";

/** My Tasks (T-032): assignee=me, overdue-first sort, shared drawer. */
function MyTasksInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const drawerTaskId = searchParams.get("task");

  const [tasks, setTasks] = useState<PlazaTaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks?assigneeId=me&pageSize=100", {
        credentials: "same-origin",
      });
      if (!res.ok) {
        setError(res.status === 401 ? "Please log in." : `Load failed (${res.status})`);
        return;
      }
      const data = await res.json();
      const items: PlazaTaskItem[] = data.items ?? (Array.isArray(data) ? data : []);
      const rank = (t: PlazaTaskItem) => {
        const overdue =
          t.dueDate && t.status !== "COMPLETED"
            ? new Date(t.dueDate).getTime() < new Date(new Date().toDateString()).getTime()
            : false;
        return `${overdue ? "0" : "1"}_${t.dueDate ?? "9999"}_${t.id}`;
      };
      items.sort((a, b) => (rank(a) < rank(b) ? -1 : 1));
      setTasks(items);
      setTotal(data.total ?? items.length);
    } catch {
      setError("Failed to load. Retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openTask = useCallback(
    (id: string) => router.push(`${pathname}?task=${id}`),
    [router, pathname],
  );
  const closeDrawer = useCallback(() => {
    router.push(pathname);
    void load();
  }, [router, pathname, load]);

  const assignees: AssigneeOption[] = [];
  {
    const seen = new Set<string>();
    for (const t of tasks) {
      if (t.assignee && !seen.has(t.assignee.id)) {
        seen.add(t.assignee.id);
        assignees.push({ id: t.assignee.id, name: t.assignee.name });
      }
    }
  }

  return (
    <div className="flex min-h-screen bg-[#F4F5F7] font-body text-[#17222C]">
      <AppSidebar active="My Tasks" />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[64px] items-center gap-3 border-b border-[rgba(23,34,44,0.08)] bg-white px-4">
          <p className="font-display text-base font-semibold tracking-[-0.02em] md:hidden">
            Site Tracker
          </p>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-[#0E121B]">
              My Tasks
            </h1>
            <p className="font-body text-sm text-[#5C6F7E]">
              {total} assigned to me · overdue first
            </p>
          </div>
          {loading ? (
            <p className="text-sm text-[#5C6F7E]">Loading…</p>
          ) : error ? (
            <p role="alert" className="rounded-md border p-4 text-sm">{error}</p>
          ) : (
            <TaskTable tasks={tasks} onSelect={openTask} />
          )}
        </main>
      </div>

      <TaskDrawer
        taskId={drawerTaskId}
        assignees={assignees}
        open={drawerTaskId !== null}
        onClose={closeDrawer}
        onChanged={() => void load()}
      />
    </div>
  );
}

export default function MyTasksPage() {
  return (
    <Suspense>
      <MyTasksInner />
    </Suspense>
  );
}
