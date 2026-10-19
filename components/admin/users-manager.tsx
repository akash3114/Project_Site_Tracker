"use client";

import { useCallback, useEffect, useState } from "react";

type UserItem = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "ADMIN" | "MANAGEMENT" | "MANAGER";
  active: boolean;
  plazaIds: string[];
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

/** ADMIN users table + create/deactivate/reset wired to /api/users. */
export function UsersManager() {
  const [items, setItems] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "MANAGER",
  });
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error(await readError(res));
      setItems((await res.json()) as UserItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readError(res));
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await readError(res));
      setForm({ name: "", email: "", password: "", role: "MANAGER" });
      setShowCreate(false);
      setNotice("User created");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(id: string) {
    if (resetPw.length < 6) {
      setFormError("New password must be at least 6 characters");
      return;
    }
    await patch(id, { password: resetPw });
    setResetFor(null);
    setResetPw("");
    setNotice("Password reset");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-[#586760]">
          {items.length} user{items.length === 1 ? "" : "s"} (no delete —
          deactivate only)
        </p>
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            setFormError(null);
          }}
          className="inline-flex min-h-[44px] items-center rounded-[8px] bg-[#173B33] px-4 text-sm font-semibold text-white"
        >
          New user
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
          className="grid grid-cols-1 gap-3 rounded-[12px] border border-[#CDD6CE] bg-white p-4 md:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-sm font-medium text-[#1C2824]">
            Name
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              minLength={2}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-[#1C2824]">
            Email
            <input
              className={inputCls}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-[#1C2824]">
            Password
            <input
              className={inputCls}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={6}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-[#1C2824]">
            Role
            <select
              className={inputCls}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="MANAGER">MANAGER</option>
              <option value="MANAGEMENT">MANAGEMENT</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>
          <div className="flex gap-2 md:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-[44px] items-center rounded-[8px] bg-[#173B33] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Create user"}
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
        <p className="text-sm text-[#586760]">Loading users…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-[#8F2824]">
          {error}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-[#CDD6CE] bg-white">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="border-b border-[#CDD6CE] bg-[#FAFBFC]">
                <th className={thCls}>Name</th>
                <th className={thCls}>Email</th>
                <th className={thCls}>Role</th>
                <th className={thCls}>Active</th>
                <th className={thCls}>Plazas</th>
                <th className={thCls}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-[rgba(23,34,44,0.06)] last:border-0"
                >
                  <td className={`${tdCls} font-medium`}>{u.name}</td>
                  <td className={`${tdCls} font-mono text-xs`}>{u.email}</td>
                  <td className={tdCls}>
                    <select
                      aria-label={`Role for ${u.email}`}
                      className="min-h-[44px] rounded-[8px] border border-[rgba(23,34,44,0.12)] bg-white px-2 text-sm"
                      value={u.role}
                      disabled={saving}
                      onChange={(e) =>
                        void patch(u.id, { role: e.target.value })
                      }
                    >
                      <option value="MANAGER">MANAGER</option>
                      <option value="MANAGEMENT">MANAGEMENT</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </td>
                  <td className={tdCls}>{u.active ? "Yes" : "No"}</td>
                  <td className={tdCls}>{u.plazaIds.length}</td>
                  <td className={tdCls}>
                    <span className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void patch(u.id, { active: !u.active })
                        }
                        className={btnCls}
                      >
                        {u.active ? "Deactivate" : "Reactivate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setResetFor(resetFor === u.id ? null : u.id);
                          setResetPw("");
                          setFormError(null);
                        }}
                        className={btnCls}
                      >
                        Reset pw
                      </button>
                    </span>
                    {resetFor === u.id ? (
                      <span className="mt-2 flex gap-2">
                        <input
                          className={inputCls}
                          type="password"
                          placeholder="New password (min 6)"
                          value={resetPw}
                          onChange={(e) => setResetPw(e.target.value)}
                        />
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void resetPassword(u.id)}
                          className="inline-flex min-h-[44px] shrink-0 items-center rounded-[8px] bg-[#173B33] px-4 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          Set
                        </button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
