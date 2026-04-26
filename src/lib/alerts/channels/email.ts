import nodemailer from "nodemailer";
import { decrypt } from "@/lib/encryption";
import type { SmtpChannelConfig } from "./config";

export interface EmailSendInput {
  to: string[];
  subject: string;
  html: string;
  text: string;
}

export interface EmailSendResult {
  status: "sent" | "failed";
  recipient: string;
  error?: string;
}

function transportFor(config: SmtpChannelConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: decrypt(config.passEncrypted),
    },
  });
}

function fromHeader(config: SmtpChannelConfig): string {
  return config.fromName ? `${config.fromName} <${config.fromAddress}>` : config.fromAddress;
}

/**
 * Sends one message per recipient so each delivery is independently auditable.
 */
export async function sendEmail(
  config: SmtpChannelConfig,
  input: EmailSendInput,
): Promise<EmailSendResult[]> {
  if (input.to.length === 0) return [];
  const transport = transportFor(config);
  const from = fromHeader(config);

  const results: EmailSendResult[] = [];
  for (const to of input.to) {
    try {
      await transport.sendMail({
        from,
        to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      results.push({ status: "sent", recipient: to });
    } catch (err) {
      results.push({
        status: "failed",
        recipient: to,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

export async function verifyEmailChannel(config: SmtpChannelConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    await transportFor(config).verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
