"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Category = {
  id: string;
  name: string;
  active: boolean;
  taskCount: number;
};

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

const inputCls =
  "min-h-[44px] w-full rounded-[8px] border border-[rgba(23,34,44,0.12)] bg-white px-3 py-2 text-sm text-[#1C2824] placeholder:text-[#66756D]";
const thCls =
  "px-3 py-2 text-left font-mono text-xs font-medium uppercase tracking-wide text-[#66756D]";
const tdCls = "px-3 py-2 text-sm text-[#1C2824]";
const btnCls =
  "inline-flex min-h-[44px] items-center rounded-[8px] border border-[rgba(23,34,44,0.12)] px-4 text-sm font-medium text-[#1C2824] disabled:opacity-50";
const primaryBtnCls =
  "inline-flex min-h-[44px] items-center rounded-[8px] bg-[#173B33] px-4 text-sm font-semibold text-white disabled:opacity-50";

/** ADMIN task categories: list counts, create, rename and archive. */
export function CategoriesManager() {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/categories", {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(await readError(res));
      setItems((await res.json()) as Category[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const active = items.filter((c) => c.active).length;
    const tagged = items.reduce((total, c) => total + c.taskCount, 0);
    return `${items.length} categor${items.length === 1 ? "y" : "ies"} · ${active} active · ${tagged} tagged task${tagged === 1 ? "" : "s"}`;
  }, [items]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (name.length < 2) {
      setFormError("Name must be at least 2 characters");
      return;
    }
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setNewName("");
      setShowCreate(false);
      setNotice(`Category “${name}” created`);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, body: { name?: string; active?: boolean }) {
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res));
      setEditingId(null);
      setNotice(
        body.active === undefined
          ? "Category renamed"
          : body.active
            ? "Category activated"
            : "Category archived",
      );
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function rename(id: string) {
    const name = editName.trim();
    if (name.length < 2) {
      setFormError("Name must be at least 2 characters");
      return;
    }
    await patch(id, { name });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-[#586760]">{summary}</p>
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            setFormError(null);
            setNotice(null);
          }}
          className={primaryBtnCls}
        >
          New category
        </button>
      </div>

      {notice ? <p className="text-sm text-[#385A2B]">{notice}</p> : null}
      {formError ? (
        <p role="alert" className="text-sm text-[#8F2824]">
          {formError}
        </p>
      ) : null}

      {showCreate ? (
        <form
          onSubmit={create}
          className="flex flex-col gap-3 rounded-[12px] border border-[#CDD6CE] bg-white p-4 sm:flex-row sm:items-end"
        >
          <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-[#1C2824]">
            Category name
            <input
              className={inputCls}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Road Safety"
              minLength={2}
              maxLength={80}
              required
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className={primaryBtnCls}>
              {saving ? "Saving…" : "Create category"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className={btnCls}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#586760]">Loading categories…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-[#8F2824]">
          {error}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-[#CDD6CE] bg-white">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-[#CDD6CE] bg-[#FAFBFC]">
                <th className={thCls}>Category</th>
                <th className={thCls}>Tasks</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((category) => (
                <tr
                  key={category.id}
                  className="border-b border-[rgba(23,34,44,0.06)] last:border-0"
                >
                  <td className={`${tdCls} font-medium`}>
                    {editingId === category.id ? (
                      <input
                        className={inputCls}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        minLength={2}
                        maxLength={80}
                        aria-label={`Rename ${category.name}`}
                      />
                    ) : (
                      category.name
                    )}
                  </td>
                  <td className={`${tdCls} font-mono text-xs`}>
                    {category.taskCount}
                  </td>
                  <td className={tdCls}>
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide ${
                        category.active
                          ? "bg-[#E8F0DD] text-[#385A2B]"
                          : "bg-[#F5F5EF] text-[#586760]"
                      }`}
                    >
                      {category.active ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td className={tdCls}>
                    {editingId === category.id ? (
                      <span className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void rename(category.id)}
                          disabled={saving}
                          className={primaryBtnCls}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className={btnCls}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(category.id);
                            setEditName(category.name);
                            setFormError(null);
                            setNotice(null);
                          }}
                          className={btnCls}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void patch(category.id, {
                              active: !category.active,
                            })
                          }
                          disabled={saving}
                          className={btnCls}
                        >
                          {category.active ? "Archive" : "Activate"}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && items.length === 0 ? (
        <p className="text-sm text-[#586760]">
          No categories yet. Create the first one above.
        </p>
      ) : null}
    </div>
  );
}
