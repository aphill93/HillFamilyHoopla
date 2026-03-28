// ─── Auth Types ───────────────────────────────────────────────────────────────

import type { UserProfile, UserRole } from "./user.js";

export interface AuthToken {
  /** JWT access token (short-lived, 15 min) */
  accessToken: string;
  /** Opaque refresh token (long-lived, 30 days) */
  refreshToken: string;
  /** Access token expiry as Unix timestamp (seconds) */
  expiresAt: number;
  tokenType: "Bearer";
}

export interface JwtPayload {
  /** Subject – user ID */
  sub: string;
  /** User email */
  email: string;
  /** User role */
  role: UserRole;
  /** Issued at (Unix seconds) */
  iat: number;
  /** Expires at (Unix seconds) */
  exp: number;
  /** JWT ID for revocation checks */
  jti: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  /** Optional: persist session longer */
  rememberMe?: boolean;
}

export interface LoginResponse {
  user: UserProfile;
  tokens: AuthToken;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  profileColor: string;
  inviteCode?: string;
}

export interface RegisterResponse {
  user: UserProfile;
  tokens: AuthToken;
  /** Whether the user needs to verify email before full access */
  requiresEmailVerification: boolean;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  tokens: AuthToken;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface ResetPasswordResponse {
  message: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface VerifyEmailResponse {
  message: string;
  user: UserProfile;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** Decoded request user attached by auth plugin */
export interface RequestUser {
  id: string;
  email: string;
  role: UserRole;
  jti: string;
}
