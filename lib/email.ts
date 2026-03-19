// lib/email.ts — Envio de email com PDF attachment via SMTP
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // tigraoimports@gmail.com
    pass: process.env.EMAIL_APP_PASSWORD, // App Password (não a senha normal)
  },
});

export async function enviarRelatorioPDF(opts: {
  to: string;
  subject: string;
  body: string;
  pdfBuffer: Buffer;
  filename: string;
}) {
  const info = await transporter.sendMail({
    from: `"TigrãoImports Bot" <${process.env.EMAIL_USER}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.body,
    attachments: [
      {
        filename: opts.filename,
        content: opts.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });

  return info;
}
