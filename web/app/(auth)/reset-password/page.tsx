"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { z } from "zod";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[0-9]/, "Must contain a number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type State = "idle" | "loading" | "success" | "error" | "invalid-token";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"password" | "confirmPassword", string>>>({});
  const [state, setState] = useState<State>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) setState("invalid-token");
  }, [token]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});
    setErrorMessage(null);

    const parsed = schema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      const errs: typeof fieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof typeof fieldErrors;
        if (!errs[field]) errs[field] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    setState("loading");
    try {
      const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: parsed.data.password }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? "Password reset failed");
      }

      setState("success");
      // Redirect to login after short delay
      setTimeout(() => router.push("/login?reset=true"), 2500);
    } catch (err: unknown) {
      setState("error");
      setErrorMessage(err instanceof Error ? err.message : "Password reset failed. Please try again.");
    }
  }

  // ── Invalid / missing token ────────────────────────────────────────────────
  if (state === "invalid-token") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-foreground">Invalid reset link</h1>
          <p className="text-sm text-muted-foreground">
            This password reset link is missing or invalid. Please request a new one.
          </p>
          <Link href="/forgot-password" className="inline-block text-sm text-primary hover:underline">
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (state === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-foreground">Password updated</h1>
          <p className="text-sm text-muted-foreground">
            Your password has been reset. Redirecting you to sign in…
          </p>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            HillFamily<span className="text-primary">Hoopla</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Choose a new password</p>
        </div>

        <div className="bg-card border rounded-lg shadow-sm p-8 space-y-6">
          {state === "error" && errorMessage && (
            <div role="alert" className="bg-destructive/10 border border-destructive/30 text-destructive rounded-md px-4 py-3 text-sm">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-foreground">
                New password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
                placeholder="••••••••"
                aria-invalid={!!fieldErrors.password}
              />
              {fieldErrors.password && <p className="text-xs text-destructive">{fieldErrors.password}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground">
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
                placeholder="••••••••"
                aria-invalid={!!fieldErrors.confirmPassword}
              />
              {fieldErrors.confirmPassword && <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>}
            </div>

            <button
              type="submit"
              disabled={state === "loading"}
              className="w-full flex justify-center items-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {state === "loading" ? "Updating…" : "Set new password"}
            </button>
          </form>

          <div className="text-center">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
