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

// Transporter dedicado para envio de NF (contato@tigraoimports.com)
const nfTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.NF_EMAIL_USER || process.env.EMAIL_USER,
    pass: process.env.NF_EMAIL_APP_PASSWORD || process.env.EMAIL_APP_PASSWORD,
  },
});

/**
 * Envia a Nota Fiscal por email ao cliente quando a venda é finalizada.
 * Baixa o PDF da URL pública (Supabase Storage) e envia como anexo.
 */
export async function enviarNotaFiscal(opts: {
  to: string;
  clienteNome: string;
  produto: string;
  valor: number;
  notaFiscalUrl: string;
}) {
  // Baixar o PDF da URL pública
  const res = await fetch(opts.notaFiscalUrl);
  if (!res.ok) throw new Error(`Falha ao baixar NF: ${res.status}`);
  const pdfBuffer = Buffer.from(await res.arrayBuffer());

  const valorFmt = opts.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #E8740E; font-size: 24px; margin: 0;">TigrãoImports</h1>
        <p style="color: #86868B; font-size: 14px; margin: 4px 0 0;">Sua Nota Fiscal</p>
      </div>

      <div style="background: #FFF8F0; border: 1px solid #F5DEB3; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="margin: 0 0 8px; color: #1D1D1F; font-size: 16px;">
          Olá, <strong>${opts.clienteNome}</strong>! 👋
        </p>
        <p style="margin: 0; color: #6E6E73; font-size: 14px; line-height: 1.5;">
          Sua compra foi finalizada com sucesso! Segue em anexo a Nota Fiscal referente ao produto:
        </p>
      </div>

      <div style="background: #F5F5F7; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <p style="margin: 0 0 4px; font-size: 14px; color: #86868B;">Produto</p>
        <p style="margin: 0; font-size: 16px; color: #1D1D1F; font-weight: 600;">${opts.produto}</p>
      </div>

      <p style="color: #86868B; font-size: 12px; text-align: center; margin: 24px 0 0;">
        Obrigado por comprar com a TigrãoImports! 🐯<br>
        Em caso de dúvidas, entre em contato conosco.
      </p>
    </div>
  `;

  const nfEmail = process.env.NF_EMAIL_USER || process.env.EMAIL_USER;
  const info = await nfTransporter.sendMail({
    from: `"TigrãoImports" <${nfEmail}>`,
    to: opts.to,
    subject: `Nota Fiscal — ${opts.produto} — TigrãoImports`,
    html,
    attachments: [
      {
        filename: `NF_TigraoImports_${opts.clienteNome.replace(/\s+/g, "_")}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });

  return info;
}
