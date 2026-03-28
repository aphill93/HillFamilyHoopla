import { Resend } from "resend";
import { config } from "../config.js";

const resend = new Resend(config.email.resendApiKey);

// ─── Email templates ──────────────────────────────────────────────────────────

function baseLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
          <!-- Header -->
          <tr>
            <td style="padding:0 0 24px 0;text-align:center;">
              <span style="font-size:22px;font-weight:700;color:#1f2937;">
                HillFamily<span style="color:#3b82f6;">Hoopla</span>
              </span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:12px;padding:40px;border:1px solid #e5e7eb;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                This email was sent to you because you have an account on HillFamilyHoopla.<br/>
                If you did not request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<div style="text-align:center;margin:32px 0;">
    <a href="${href}" style="display:inline-block;background:#3b82f6;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;padding:14px 32px;">
      ${label}
    </a>
  </div>`;
}

function verificationEmailHtml(name: string, verifyUrl: string): string {
  const body = `
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#111827;">Verify your email</h1>
    <p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;">Hi ${name},</p>
    <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">
      Welcome to HillFamilyHoopla! Please verify your email address to activate your account.
    </p>
    ${button(verifyUrl, "Verify email address")}
    <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">
      This link expires in <strong>24 hours</strong>.<br/>
      Or copy this URL: <a href="${verifyUrl}" style="color:#3b82f6;">${verifyUrl}</a>
    </p>`;
  return baseLayout("Verify your email — HillFamilyHoopla", body);
}

function passwordResetEmailHtml(name: string, resetUrl: string): string {
  const body = `
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#111827;">Reset your password</h1>
    <p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;">Hi ${name},</p>
    <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">
      We received a request to reset your HillFamilyHoopla password. Click the button below to choose a new one.
    </p>
    ${button(resetUrl, "Reset password")}
    <p style="margin:0 0 16px 0;font-size:13px;color:#9ca3af;text-align:center;">
      This link expires in <strong>1 hour</strong>. If you didn't request a reset, no action is needed.
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
    <p style="margin:0;font-size:12px;color:#9ca3af;">
      For security, never share this link. HillFamilyHoopla staff will never ask for your password.
    </p>`;
  return baseLayout("Reset your password — HillFamilyHoopla", body);
}

function passwordRotationEmailHtml(name: string, appUrl: string): string {
  const changeUrl = `${appUrl}/settings?section=security`;
  const body = `
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#111827;">Time to update your password</h1>
    <p style="margin:0 0 16px 0;font-size:15px;color:#6b7280;">Hi ${name},</p>
    <p style="margin:0 0 24px 0;font-size:15px;color:#374151;line-height:1.6;">
      It's been 6 months since you last changed your HillFamilyHoopla password.
      For your family's security, we recommend updating it regularly.
    </p>
    ${button(changeUrl, "Change my password")}
    <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">
      You can dismiss this reminder in your account settings.
    </p>`;
  return baseLayout("Time to update your password — HillFamilyHoopla", body);
}

// ─── Email service ────────────────────────────────────────────────────────────

export const EmailService = {
  async sendVerificationEmail(
    email: string,
    name: string,
    token: string
  ): Promise<void> {
    const verifyUrl = `${config.app.url}/verify-email?token=${token}`;
    const { error } = await resend.emails.send({
      from: `${config.email.fromName} <${config.email.from}>`,
      to: email,
      subject: "Verify your email — HillFamilyHoopla",
      html: verificationEmailHtml(name, verifyUrl),
    });
    if (error) {
      throw new Error(`Failed to send verification email: ${error.message}`);
    }
  },

  async sendPasswordResetEmail(
    email: string,
    name: string,
    token: string
  ): Promise<void> {
    const resetUrl = `${config.app.url}/reset-password?token=${token}`;
    const { error } = await resend.emails.send({
      from: `${config.email.fromName} <${config.email.from}>`,
      to: email,
      subject: "Reset your password — HillFamilyHoopla",
      html: passwordResetEmailHtml(name, resetUrl),
    });
    if (error) {
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }
  },

  async sendPasswordRotationReminder(
    email: string,
    name: string
  ): Promise<void> {
    const { error } = await resend.emails.send({
      from: `${config.email.fromName} <${config.email.from}>`,
      to: email,
      subject: "Time to update your password — HillFamilyHoopla",
      html: passwordRotationEmailHtml(name, config.app.url),
    });
    if (error) {
      throw new Error(
        `Failed to send password rotation reminder: ${error.message}`
      );
    }
  },
};
