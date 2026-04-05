import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.office365.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM_NAME = process.env.SMTP_FROM_NAME || "Talent Density Systems";
const FROM_EMAIL = process.env.SMTP_USER || "noreply@example.com";

export async function sendWelcomeEmail(
  toEmail: string,
  displayName: string,
  resetLink: string
) {
  await transporter.sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: toEmail,
    subject: "Welcome to Talent Density Systems — Set Your Password",
    html: `
      <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; color: #212121;">
        <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Welcome, ${displayName}!</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #212121;">
          You've been added to Talent Density Systems. Click the button below to set your password and get started.
        </p>
        <div style="margin: 24px 0;">
          <a href="${resetLink}" style="display: inline-block; background: #212121; color: #ffffff; padding: 12px 24px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; text-decoration: none; border-radius: 4px;">
            Set Your Password
          </a>
        </div>
        <p style="font-size: 12px; color: #C6C6C6; line-height: 1.5;">
          If you didn't expect this email, you can safely ignore it.
        </p>
        <hr style="border: none; border-top: 1px solid #C6C6C6; margin: 24px 0;" />
        <p style="font-size: 12px; color: #C6C6C6;">— Mike Goldman</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(
  toEmail: string,
  displayName: string,
  resetLink: string
) {
  await transporter.sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: toEmail,
    subject: "Reset Your Password — Talent Density Systems",
    html: `
      <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; color: #212121;">
        <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Hi ${displayName},</h2>
        <p style="font-size: 14px; line-height: 1.6; color: #212121;">
          We received a request to reset your password. Click the button below to set a new password.
        </p>
        <div style="margin: 24px 0;">
          <a href="${resetLink}" style="display: inline-block; background: #212121; color: #ffffff; padding: 12px 24px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; text-decoration: none; border-radius: 4px;">
            Reset Password
          </a>
        </div>
        <p style="font-size: 12px; color: #C6C6C6; line-height: 1.5;">
          If you didn't request this, you can safely ignore this email. Your password will not change.
        </p>
        <hr style="border: none; border-top: 1px solid #C6C6C6; margin: 24px 0;" />
        <p style="font-size: 12px; color: #C6C6C6;">— Mike Goldman</p>
      </div>
    `,
  });
}
