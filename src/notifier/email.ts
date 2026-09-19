import nodemailer from "nodemailer";
import { loadEnv } from "../config/index.js";
import type { ScoredJob } from "../types/index.js";

export async function sendEmailAlert(
  jobs: ScoredJob[],
  runId: string,
): Promise<void> {
  const env = loadEnv();
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.EMAIL_TO) {
    console.warn(
      "[email] SMTP non configuré (SMTP_HOST/SMTP_USER/SMTP_PASS/EMAIL_TO manquants). Alerte email ignorée.",
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 465,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });

  const subject = `Job Hunter AI - ${jobs.length} nouvelle(s) offre(s) pertinentes (${runId})`;

  const text = renderText(jobs, runId);
  const html = renderHtml(jobs, runId);

  const info = await transporter.sendMail({
    from: env.EMAIL_FROM ?? env.SMTP_USER,
    to: env.EMAIL_TO,
    subject,
    text,
    html,
  });
  console.log(`[email] envoyé à ${env.EMAIL_TO}: ${info.messageId}`);
}

function renderText(jobs: ScoredJob[], runId: string): string {
  const header = `Job Hunter AI - relevé ${runId}\n${jobs.length} offre(s) triée(s) par pertinence\n\n`;
  const body = jobs
    .map((j, i) =>
      [
        `${i + 1}. [${j.score}/100] ${j.title}`,
        `   Entreprise: ${j.company ?? "—"}`,
        `   Lieu: ${j.location ?? "—"}`,
        `   Contrat: ${j.contractType ?? "—"}`,
        `   Salaire: ${j.salary ?? "—"}`,
        `   Source: ${j.source}`,
        j.scoreReasons.length
          ? `   Raisons: ${j.scoreReasons.join(" ; ")}`
          : null,
        `   Lien: ${j.url}`,
        "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
  return header + body;
}

function renderHtml(jobs: ScoredJob[], runId: string): string {
  const rows = jobs
    .map(
      (j, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><b>${j.score}</b></td>
        <td><a href="${j.url}">${escapeHtml(j.title)}</a><br><small>${escapeHtml(j.company ?? "—")} · ${escapeHtml(j.location ?? "—")} · ${escapeHtml(j.contractType ?? "—")} · ${escapeHtml(j.source)}</small>${j.scoreReasons.length ? `<br><small><i>${escapeHtml(j.scoreReasons.join(" ; "))}</i></small>` : ""}</td>
      </tr>`,
    )
    .join("");
  return `
    <h2>Job Hunter AI — relevé ${runId}</h2>
    <p>${jobs.length} offre(s) triée(s) par pertinence.</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px;">
      <tr style="background:#f0f0f0"><th>#</th><th>Score</th><th>Offre</th></tr>
      ${rows}
    </table>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
