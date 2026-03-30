"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getCoaches,
  createCoach,
  updateCoach,
  deleteCoach,
  getReferenceDocuments,
  createReferenceDocument,
  deleteReferenceDocument,
} from "@/lib/coach-service";
import { uploadFile } from "@/lib/storage-service";
import type { Coach, ReferenceDocument } from "@/types/coach";

export default function AskMikeAdminPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [refDocs, setRefDocs] = useState<ReferenceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [showRefDocs, setShowRefDocs] = useState(false);

  // Edit state
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSystemPrompt, setEditSystemPrompt] = useState("");
  const [editChatIntro, setEditChatIntro] = useState("");
  const [editRefDocIds, setEditRefDocIds] = useState<string[]>([]);
  const [editIsActive, setEditIsActive] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [coachData, refDocData] = await Promise.all([
        getCoaches(),
        getReferenceDocuments(),
      ]);
      setCoaches(coachData);
      setRefDocs(refDocData);
    } catch (err) {
      console.error("Failed to load:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!profile) return;
    if (profile.role !== "superadmin") {
      router.replace("/dashboard");
      return;
    }
    loadData();
  }, [profile, router, loadData]);

  function expandCard(coach: Coach) {
    if (expandedId === coach.id) {
      setExpandedId(null);
    } else {
      setExpandedId(coach.id);
      setEditName(coach.name);
      setEditDescription(coach.description);
      setEditSystemPrompt(coach.systemPrompt);
      setEditChatIntro(coach.chatIntro);
      setEditRefDocIds([...(coach.referenceDocIds ?? [])]);
      setEditIsActive(coach.isActive);
    }
  }

  async function handleSave(coachId: string) {
    setSaving(true);
    try {
      await updateCoach(coachId, {
        name: editName,
        description: editDescription,
        systemPrompt: editSystemPrompt,
        chatIntro: editChatIntro,
        referenceDocIds: editRefDocIds,
        isActive: editIsActive,
      });
      setCoaches(
        coaches.map((c) =>
          c.id === coachId
            ? {
                ...c,
                name: editName,
                description: editDescription,
                systemPrompt: editSystemPrompt,
                chatIntro: editChatIntro,
                referenceDocIds: editRefDocIds,
                isActive: editIsActive,
              }
            : c
        )
      );
      setExpandedId(null);
    } catch (err) {
      console.error("Failed to save:", err);
    }
    setSaving(false);
  }

  async function handleDeleteCoach(coachId: string) {
    if (!window.confirm("Delete this coach? This cannot be undone.")) return;
    try {
      await deleteCoach(coachId);
      setCoaches(coaches.filter((c) => c.id !== coachId));
      if (expandedId === coachId) setExpandedId(null);
    } catch (err) {
      console.error("Failed to delete coach:", err);
    }
  }

  async function handleAddCoach() {
    try {
      const id = await createCoach({
        name: "New Coach",
        description: "",
        systemPrompt: "",
        chatIntro: "Hello! How can I help you today?",
        referenceDocIds: [],
        isActive: false,
        order: coaches.length,
      });
      await loadData();
      setExpandedId(id);
    } catch (err) {
      console.error("Failed to add coach:", err);
      alert("Failed to add coach. Check browser console for details.");
    }
  }

  async function handleUploadRefDoc() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !uploadTitle.trim()) return;

    setUploading(true);
    try {
      const fileUrl = await uploadFile("_global", "refdocs", file);

      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/extract-pdf", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      const textContent = data.text ?? "";

      await createReferenceDocument({
        title: uploadTitle.trim(),
        fileName: file.name,
        fileUrl,
        textContent,
      });

      setUploadTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadData();
    } catch (err) {
      console.error("Failed to upload:", err);
      alert("Failed to upload document.");
    }
    setUploading(false);
  }

  async function handleDeleteRefDoc(docId: string) {
    if (!window.confirm("Delete this reference document?")) return;
    try {
      await deleteReferenceDocument(docId);
      setRefDocs(refDocs.filter((d) => d.id !== docId));
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  }

  function toggleRefDoc(docId: string) {
    if (editRefDocIds.includes(docId)) {
      setEditRefDocIds(editRefDocIds.filter((id) => id !== docId));
    } else {
      setEditRefDocIds([...editRefDocIds, docId]);
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
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary">Manage AskMike Coaches</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowRefDocs(!showRefDocs)}
              className="rounded-[4px] border-[1.5px] border-primary bg-transparent px-4 py-2 text-sm font-semibold uppercase tracking-wider text-primary transition hover:bg-primary hover:text-white"
            >
              {showRefDocs ? "Coaches" : "Ref Docs"}
            </button>
            {!showRefDocs && (
              <button
                onClick={handleAddCoach}
                className="rounded-[4px] bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wider text-white transition hover:opacity-90"
              >
                + Add Coach
              </button>
            )}
          </div>
        </div>

        {/* Reference Documents Library */}
        {showRefDocs && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-primary">Reference Documents Library</h2>
            <p className="mt-1 text-sm text-primary/50">
              Upload PDFs or Word docs here. Text is extracted automatically. Assign documents to coaches so they can reference your methodologies.
            </p>

            <div className="mt-4 rounded-[4px] border border-brand-gray bg-white p-4 shadow-sm space-y-3">
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="Document title"
                className="w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="text-sm text-primary"
              />
              <button
                onClick={handleUploadRefDoc}
                disabled={uploading || !uploadTitle.trim()}
                className="rounded-[4px] bg-accent px-4 py-2 text-sm font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {uploading ? "Uploading & Extracting..." : "Upload Document"}
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {refDocs.length === 0 && (
                <p className="text-sm font-light text-primary/70">No reference documents yet.</p>
              )}
              {refDocs.map((rd) => (
                <div
                  key={rd.id}
                  className="flex items-center justify-between rounded-[4px] border border-brand-gray bg-white p-3 shadow-sm"
                >
                  <div>
                    <p className="text-sm font-semibold text-primary">{rd.title}</p>
                    <p className="text-xs text-primary/40">
                      {rd.fileName} · {rd.textContent?.length ?? 0} chars extracted
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {rd.fileUrl && (
                      <a
                        href={rd.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-primary/50 transition hover:text-primary"
                      >
                        View
                      </a>
                    )}
                    <button
                      onClick={() => handleDeleteRefDoc(rd.id)}
                      className="text-xs text-accent/50 transition hover:text-accent"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coaches */}
        {!showRefDocs && (
          <div className="mt-8 space-y-3">
            {coaches.map((coach) => (
              <div
                key={coach.id}
                className="rounded-[4px] border border-brand-gray bg-white shadow-sm"
              >
                <div className="flex items-center justify-between p-4">
                  <button
                    onClick={() => expandCard(coach)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <span className="font-semibold text-primary">{coach.name}</span>
                    <span
                      className={`rounded-[2px] px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        coach.isActive
                          ? "bg-green-500 text-white"
                          : "bg-brand-gray text-primary"
                      }`}
                    >
                      {coach.isActive ? "Active" : "Inactive"}
                    </span>
                  </button>
                  <div className="flex items-center gap-3">
                    <button onClick={() => expandCard(coach)} className="text-sm text-primary/50">
                      {expandedId === coach.id ? "▲" : "▼"}
                    </button>
                    <button
                      onClick={() => handleDeleteCoach(coach.id)}
                      className="text-xs text-accent/50 transition hover:text-accent"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {expandedId === coach.id && (
                  <div className="border-t border-brand-gray p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium uppercase tracking-wider text-primary/50">Name</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="mt-1 w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary/50">
                          <input
                            type="checkbox"
                            checked={editIsActive}
                            onChange={(e) => setEditIsActive(e.target.checked)}
                            className="accent-green-500"
                          />
                          Active
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-primary/50">Description</label>
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        rows={2}
                        className="mt-1 w-full resize-none rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-primary/50">Chat Intro Message</label>
                      <textarea
                        value={editChatIntro}
                        onChange={(e) => setEditChatIntro(e.target.value)}
                        rows={3}
                        className="mt-1 w-full resize-none rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-primary/50">System Prompt</label>
                      <textarea
                        value={editSystemPrompt}
                        onChange={(e) => setEditSystemPrompt(e.target.value)}
                        rows={12}
                        className="mt-1 w-full resize-none rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm font-mono text-primary outline-none focus:border-primary"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-primary/50">
                        Reference Documents ({editRefDocIds.length} selected)
                      </label>
                      <div className="mt-2 space-y-1">
                        {refDocs.length === 0 ? (
                          <p className="text-xs text-primary/40">
                            No reference documents uploaded yet. Switch to Ref Docs to upload.
                          </p>
                        ) : (
                          refDocs.map((rd) => (
                            <label
                              key={rd.id}
                              className="flex items-center gap-2 rounded-[4px] px-2 py-1 text-sm text-primary transition hover:bg-primary/5"
                            >
                              <input
                                type="checkbox"
                                checked={editRefDocIds.includes(rd.id)}
                                onChange={() => toggleRefDoc(rd.id)}
                                className="accent-accent"
                              />
                              {rd.title}
                              <span className="text-xs text-primary/30">({rd.fileName})</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleSave(coach.id)}
                      disabled={saving}
                      className="rounded-[4px] bg-primary px-6 py-2 text-sm font-semibold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Coach"}
                    </button>
                  </div>
                )}
              </div>
            ))}

            {coaches.length === 0 && (
              <p className="text-sm text-primary/40">No coaches yet. Click &quot;+ Add Coach&quot; to create one.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
