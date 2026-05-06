"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { canManageCompany } from "@/lib/permissions";
import {
  getCoreValues,
  createCoreValue,
  updateCoreValue,
  deleteCoreValue,
} from "@/lib/corevalue-service";
import { useKeyboardShortcuts } from "@/lib/useKeyboardShortcuts";
import type { CoreValue } from "@/types/corevalue";
import TrashIcon from "@/components/TrashIcon";

interface EditingState {
  name: string;
  description: string;
  behaviors: string[];
}

export default function CoreValuesPage() {
  const { profile } = useAuth();
  const { activeCompany } = useCompany();
  const router = useRouter();

  const [coreValues, setCoreValues] = useState<CoreValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const companyId = activeCompany?.id ?? profile?.companyId;
  const canEdit = canManageCompany(profile);

  useKeyboardShortcuts({
    onEscape: () => { setExpandedId(null); setEditing(null); },
    onEnterSave: () => { if (expandedId) handleSave(expandedId); },
  });

  useEffect(() => {
    if (!profile || !companyId) {
      if (profile?.role === "superadmin") router.replace("/admin");
      setLoading(false);
      return;
    }
    loadValues(companyId);
  }, [profile, companyId, router]);

  async function loadValues(cid: string) {
    try {
      const data = await getCoreValues(cid);
      setCoreValues(data);
    } catch {
      setError("Failed to load core values.");
    }
    setLoading(false);
  }

  function expandCard(cv: CoreValue) {
    if (expandedId === cv.id) {
      setExpandedId(null);
      setEditing(null);
    } else {
      setExpandedId(cv.id);
      setEditing({
        name: cv.name,
        description: cv.description,
        behaviors: [...cv.behaviors],
      });
    }
  }

  async function handleAdd() {
    if (!companyId || !canEdit) return;
    const newOrder = coreValues.length;
    try {
      const newId = await createCoreValue(companyId, {
        name: "",
        description: "",
        behaviors: [],
        order: newOrder,
      });
      const newCv: CoreValue = {
        id: newId,
        name: "",
        description: "",
        behaviors: [],
        order: newOrder,
        createdAt: null as unknown as CoreValue["createdAt"],
      };
      setCoreValues([...coreValues, newCv]);
      setExpandedId(newId);
      setEditing({ name: "", description: "", behaviors: [] });
    } catch {
      setError("Failed to add core value.");
    }
  }

  async function handleSave(cvId: string) {
    if (!companyId || !editing) return;
    setSaving(true);
    try {
      await updateCoreValue(companyId, cvId, {
        name: editing.name,
        description: editing.description,
        behaviors: editing.behaviors,
      });
      setCoreValues(
        coreValues.map((cv) =>
          cv.id === cvId
            ? { ...cv, name: editing.name, description: editing.description, behaviors: editing.behaviors }
            : cv
        )
      );
      setExpandedId(null);
      setEditing(null);
    } catch {
      setError("Failed to save core value.");
    }
    setSaving(false);
  }

  async function handleDelete(cvId: string) {
    if (!companyId || !canEdit) return;
    const cv = coreValues.find((c) => c.id === cvId);
    const name = cv?.name?.trim() || "this core value";
    const message =
      `Delete the core value "${name}"? This cannot be undone.\n\n` +
      `Past assessments that scored team members on this value will keep their recorded scores, ` +
      `but the value will no longer appear when assessing team members going forward.`;
    if (!window.confirm(message)) return;
    try {
      await deleteCoreValue(companyId, cvId);
      setCoreValues(coreValues.filter((c) => c.id !== cvId));
      if (expandedId === cvId) {
        setExpandedId(null);
        setEditing(null);
      }
    } catch {
      setError("Failed to delete core value.");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="animate-pulse text-lg font-light text-primary/70">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 py-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-primary">Core Values</h1>
        <p className="mt-1 text-sm text-primary/50">
          Per The Strength of Talent: core values are nonnegotiable behaviors — not aspirational phrases.
        </p>

        {error && <p className="mt-4 text-sm text-accent">{error}</p>}

        {canEdit && (
          <button
            onClick={handleAdd}
            className="mt-6 rounded-[4px] bg-accent px-6 py-3 font-semibold uppercase tracking-wider text-white transition hover:opacity-90"
          >
            + Add Core Value
          </button>
        )}

        {coreValues.length === 0 && (
          <p className="mt-6 text-sm font-light text-primary/70">
            No core values defined yet. The book recommends 3–7 core values.
          </p>
        )}

        <div className="mt-6 space-y-2">
          {coreValues.map((cv) => (
            <div
              key={cv.id}
              className="rounded-[4px] border border-brand-gray bg-white shadow-sm"
            >
              <div className="flex items-center gap-3 p-4">
                <button
                  onClick={() => expandCard(cv)}
                  className="flex-1 text-left"
                >
                  <span className="font-semibold text-primary">
                    {cv.name || "Untitled Value"}
                  </span>
                  {cv.description && (
                    <span className="ml-2 text-sm text-primary/50">
                      — {cv.description.slice(0, 60)}{cv.description.length > 60 ? "..." : ""}
                    </span>
                  )}
                </button>
                <span className="text-[10px] text-primary/30">
                  {cv.behaviors.length} behavior{cv.behaviors.length !== 1 ? "s" : ""}
                </span>
                {canEdit && (
                  <button
                    onClick={() => handleDelete(cv.id)}
                    className="text-red-500 transition hover:text-red-700"
                    title="Delete core value" aria-label="Delete core value"
                  >
                    <TrashIcon />
                  </button>
                )}
                <button
                  onClick={() => expandCard(cv)}
                  className="px-1 text-sm text-primary/50"
                >
                  {expandedId === cv.id ? "▲" : "▼"}
                </button>
              </div>

              {/* Expanded read-only view (non-admins) */}
              {expandedId === cv.id && !canEdit && (
                <div className="border-t border-brand-gray px-4 pb-4 pt-3 space-y-3">
                  {cv.description && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary/40">Description</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-primary">{cv.description}</p>
                    </div>
                  )}
                  {cv.behaviors.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary/40">Behaviors</p>
                      <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-primary">
                        {cv.behaviors.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!cv.description && cv.behaviors.length === 0 && (
                    <p className="text-sm text-primary/40">No additional details.</p>
                  )}
                </div>
              )}

              {/* Expanded edit form (admins) */}
              {expandedId === cv.id && canEdit && editing && (
                <div className="border-t border-brand-gray px-4 pb-4 pt-3 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-primary/40">
                      Name
                    </label>
                    <input
                      type="text"
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
                      placeholder="e.g., Act with Integrity"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-primary/40">
                      Description
                    </label>
                    <textarea
                      value={editing.description}
                      onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                      rows={2}
                      className="mt-1 w-full resize-none rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
                      placeholder="What this value means in practice..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-primary/40">
                      Behaviors
                    </label>
                    {editing.behaviors.map((b, i) => (
                      <div key={i} className="mt-1 flex gap-2">
                        <input
                          type="text"
                          value={b}
                          onChange={(e) => {
                            const updated = [...editing.behaviors];
                            updated[i] = e.target.value;
                            setEditing({ ...editing, behaviors: updated });
                          }}
                          className="flex-1 rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
                          placeholder="Specific behavior..."
                        />
                        <button
                          onClick={() => {
                            setEditing({
                              ...editing,
                              behaviors: editing.behaviors.filter((_, j) => j !== i),
                            });
                          }}
                          className="text-red-500 transition hover:text-red-700"
                          title="Remove behavior" aria-label="Remove behavior"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        setEditing({
                          ...editing,
                          behaviors: [...editing.behaviors, ""],
                        })
                      }
                      className="mt-2 text-xs font-semibold text-accent transition hover:opacity-70"
                    >
                      + Add Behavior
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSave(cv.id)}
                      disabled={saving}
                      className="rounded-[4px] bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
