"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

type State = "verifying" | "success" | "error" | "missing-token";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { refreshUser } = useAuth();

  const [state, setState] = useState<State>(token ? "verifying" : "missing-token");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const verify = async () => {
      try {
        const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";
        const res = await fetch(`${API_URL}/auth/verify-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          const body = (await res.json()) as { message?: string };
          throw new Error(body.message ?? "Verification failed");
        }

        // Refresh user in auth context so emailVerified updates
        await refreshUser();
        setState("success");
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Verification failed");
        setState("error");
      }
    };

    void verify();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Missing token ──────────────────────────────────────────────────────────
  if (state === "missing-token") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-foreground">Invalid link</h1>
          <p className="text-sm text-muted-foreground">
            This verification link is invalid. Please check your email for the correct link.
          </p>
          <Link href="/login" className="inline-block text-sm text-primary hover:underline">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  // ── Verifying (loading) ────────────────────────────────────────────────────
  if (state === "verifying") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center space-y-4">
          <svg className="animate-spin mx-auto h-10 w-10 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-muted-foreground">Verifying your email…</p>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (state === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-foreground">Verification failed</h1>
          <p className="text-sm text-muted-foreground">
            {errorMessage ?? "This link may have expired or already been used."}
          </p>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Need a new link? Sign in and we&apos;ll resend it.
            </p>
            <Link href="/login" className="inline-block text-sm text-primary hover:underline">
              Go to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Email verified!</h1>
        <p className="text-muted-foreground">
          Your email address has been verified. You&apos;re all set.
        </p>
        <Link
          href="/calendar"
          className="inline-block rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Go to my calendar
        </Link>
      </div>
    </div>
  );
}
