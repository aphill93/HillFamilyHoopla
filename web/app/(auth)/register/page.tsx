"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { z } from "zod";

// ─── The 8 member profile colors ─────────────────────────────────────────────

const MEMBER_COLORS = [
  { hex: "#EF4444", label: "Red" },
  { hex: "#F97316", label: "Orange" },
  { hex: "#EAB308", label: "Yellow" },
  { hex: "#22C55E", label: "Green" },
  { hex: "#3B82F6", label: "Blue" },
  { hex: "#8B5CF6", label: "Violet" },
  { hex: "#EC4899", label: "Pink" },
  { hex: "#14B8A6", label: "Teal" },
] as const;

// ─── Validation ───────────────────────────────────────────────────────────────

const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain an uppercase letter")
      .regex(/[0-9]/, "Password must contain a number"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    profileColor: z.string().min(1, "Please pick a color"),
    inviteCode: z.string().optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FieldErrors = Partial<
  Record<
    "name" | "email" | "password" | "confirmPassword" | "profileColor" | "inviteCode",
    string
  >
>;

// ─── Password strength indicator ─────────────────────────────────────────────

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", pass: password.length >= 8 },
    { label: "Uppercase letter", pass: /[A-Z]/.test(password) },
    { label: "Number", pass: /[0-9]/.test(password) },
    { label: "Special character", pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.pass).length;
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][score] ?? "";
  const strengthColor = ["", "bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-green-500"][score] ?? "";

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= score ? strengthColor : "bg-muted"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Strength: <span className="font-medium">{strengthLabel}</span>
      </p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
        {checks.map(({ label, pass }) => (
          <li key={label} className={`flex items-center gap-1 text-xs ${pass ? "text-green-600" : "text-muted-foreground"}`}>
            <span>{pass ? "✓" : "○"}</span>
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Register page ────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileColor, setProfileColor] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showInviteCode, setShowInviteCode] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const parsed = registerSchema.safeParse({
      name,
      email,
      password,
      confirmPassword,
      profileColor,
      inviteCode: inviteCode || undefined,
    });

    if (!parsed.success) {
      const errs: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        if (!errs[field]) errs[field] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    setIsLoading(true);
    try {
      const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: parsed.data.name,
          email: parsed.data.email,
          password: parsed.data.password,
          profileColor: parsed.data.profileColor,
          ...(parsed.data.inviteCode ? { inviteCode: parsed.data.inviteCode } : {}),
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { message?: string };
        throw new Error(body.message ?? "Registration failed");
      }

      setRegisteredEmail(parsed.data.email);
      setRegistered(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────

  if (registered) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Check your inbox</h1>
          <p className="text-muted-foreground">
            We sent a verification link to <strong>{registeredEmail}</strong>.<br />
            Click the link in the email to activate your account.
          </p>
          <Link href="/login" className="inline-block text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  // ── Registration form ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            HillFamily<span className="text-primary">Hoopla</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Create your family account</p>
        </div>

        <div className="bg-card border rounded-lg shadow-sm p-8 space-y-6">
          {error && (
            <div role="alert" className="bg-destructive/10 border border-destructive/30 text-destructive rounded-md px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Name */}
            <div className="space-y-1">
              <label htmlFor="name" className="block text-sm font-medium text-foreground">Full name</label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
                placeholder="Jane Hill"
                aria-invalid={!!fieldErrors.name}
              />
              {fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
            </div>

            {/* Email */}
            <div className="space-y-1">
              <label htmlFor="email" className="block text-sm font-medium text-foreground">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
                placeholder="you@example.com"
                aria-invalid={!!fieldErrors.email}
              />
              {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-foreground">Password</label>
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
              <PasswordStrength password={password} />
              {fieldErrors.password && <p className="text-xs text-destructive">{fieldErrors.password}</p>}
            </div>

            {/* Confirm password */}
            <div className="space-y-1">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground">Confirm password</label>
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

            {/* Profile color */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">Your calendar color</label>
              <div className="flex gap-2 flex-wrap">
                {MEMBER_COLORS.map(({ hex, label }) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setProfileColor(hex)}
                    title={label}
                    aria-label={label}
                    aria-pressed={profileColor === hex}
                    className={`w-8 h-8 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring ${
                      profileColor === hex
                        ? "ring-2 ring-offset-2 ring-foreground scale-110"
                        : "hover:scale-105"
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
              {fieldErrors.profileColor && <p className="text-xs text-destructive">{fieldErrors.profileColor}</p>}
            </div>

            {/* Invite code (collapsible) */}
            <div className="space-y-1">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowInviteCode((v) => !v)}
              >
                {showInviteCode ? "▾" : "▸"} Have an invite code?
              </button>
              {showInviteCode && (
                <input
                  id="inviteCode"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                  placeholder="Enter invite code"
                />
              )}
              {fieldErrors.inviteCode && <p className="text-xs text-destructive">{fieldErrors.inviteCode}</p>}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating account…
                </>
              ) : (
                "Create account"
              )}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
