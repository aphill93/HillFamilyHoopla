"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { apiClient, ApiError } from "@/lib/api";
import type { UserProfile } from "@hillfamilyhoopla/shared";
import { MEMBER_COLORS } from "@hillfamilyhoopla/shared";

// ─── Settings page ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();

  // Profile form state
  const [name, setName]         = useState("");
  const [color, setColor]       = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Change-password modal state
  const [showPwModal, setShowPwModal]   = useState(false);
  const [currentPw, setCurrentPw]       = useState("");
  const [newPw, setNewPw]               = useState("");
  const [confirmPw, setConfirmPw]       = useState("");
  const [pwError, setPwError]           = useState<string | null>(null);
  const [pwSaving, setPwSaving]         = useState(false);
  const [pwSuccess, setPwSuccess]       = useState(false);

  // Seed form from live user
  useEffect(() => {
    if (user) {
      setName(user.name);
      setColor(user.profileColor);
    }
  }, [user]);

  // ── Save profile ─────────────────────────────────────────────────────────

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaveError(null);
    setSaveSuccess(false);
    setIsSaving(true);
    try {
      await apiClient.patch<{ user: UserProfile }>(`/users/${user.id}`, {
        name: name.trim(),
        profileColor: color,
      });
      await refreshUser();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save profile.");
    } finally {
      setIsSaving(false);
    }
  }

  // ── Change password ───────────────────────────────────────────────────────

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (newPw !== confirmPw) { setPwError("Passwords don't match."); return; }
    if (newPw.length < 8)    { setPwError("Password must be at least 8 characters."); return; }
    setPwSaving(true);
    try {
      await apiClient.patch("/auth/change-password", {
        currentPassword: currentPw,
        newPassword: newPw,
      });
      setPwSuccess(true);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setTimeout(() => { setPwSuccess(false); setShowPwModal(false); }, 1500);
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : "Failed to update password.");
    } finally {
      setPwSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="container mx-auto px-4 py-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">Settings</h1>

      <div className="space-y-6">
        {/* ── Profile ───────────────────────────────────────────────────── */}
        <section className="bg-card border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">Profile</h2>

          {/* Avatar preview */}
          <div className="flex items-center gap-4 mb-6">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
              style={{ backgroundColor: color || user?.profileColor || "#3B82F6" }}
            >
              {(name || user?.name || "?").charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium">{name || user?.name}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-sm font-medium">Display name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium">Email</label>
                <input
                  type="email"
                  value={user?.email ?? ""}
                  disabled
                  className="w-full rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
                />
              </div>
            </div>

            {/* Profile color */}
            <div className="space-y-2">
              <label className="block text-sm font-medium">Profile color</label>
              <div className="flex gap-3 flex-wrap">
                {MEMBER_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setColor(hex)}
                    className="h-9 w-9 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    style={{
                      backgroundColor: hex,
                      outline: color === hex ? `3px solid ${hex}` : undefined,
                      outlineOffset: color === hex ? "2px" : undefined,
                    }}
                    aria-label={`Select color ${hex}`}
                    aria-pressed={color === hex}
                  />
                ))}
              </div>
            </div>

            {saveError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
                {saveError}
              </p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSaving || !name.trim()}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isSaving ? "Saving…" : saveSuccess ? "Saved ✓" : "Save changes"}
              </button>
            </div>
          </form>
        </section>

        {/* ── Security ──────────────────────────────────────────────────── */}
        <section className="bg-card border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Security</h2>
          <button
            type="button"
            onClick={() => { setShowPwModal(true); setPwError(null); setPwSuccess(false); }}
            className="text-sm text-primary hover:underline"
          >
            Change password
          </button>
        </section>

        {/* ── About ─────────────────────────────────────────────────────── */}
        <section className="bg-card border rounded-lg p-6 space-y-2">
          <h2 className="text-lg font-semibold text-foreground mb-1">About</h2>
          <p className="text-sm text-muted-foreground">
            HillFamilyHoopla — private family calendar &amp; task app
          </p>
          <p className="text-xs text-muted-foreground">Version 1.0.0</p>
        </section>
      </div>

      {/* ── Change password modal ────────────────────────────────────────── */}
      {showPwModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowPwModal(false); }}
        >
          <div className="w-full max-w-sm rounded-xl bg-card border shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Change password</h3>
              <button
                type="button"
                onClick={() => setShowPwModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {pwSuccess ? (
              <div className="text-center py-6">
                <p className="text-green-600 font-semibold text-lg">Password updated ✓</p>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Current password</label>
                  <input
                    type="password"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">New password</label>
                  <input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Confirm new password</label>
                  <input
                    type="password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {pwError && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
                    {pwError}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowPwModal(false)}
                    className="flex-1 rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pwSaving}
                    className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {pwSaving ? "Updating…" : "Update"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
