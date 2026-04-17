// Integração com ZapSign — assinatura digital com validade jurídica
// Docs: https://docs.zapsign.com.br/

const ZAPSIGN_API = "https://api.zapsign.com.br/api/v1";

function getToken(): string {
  const token = process.env.ZAPSIGN_API_TOKEN;
  if (!token) throw new Error("ZAPSIGN_API_TOKEN nao configurado");
  return token;
}

export interface ZapSignSigner {
  name: string;
  phone_country?: string; // "55"
  phone_number: string; // DDD + numero, só dígitos
  auth_mode?: "assinaturaTela" | "assinaturaTela-tokenSms" | "assinaturaTela-tokenEmail" | "assinaturaTela-bioSelfie";
  cpf?: string;
  email?: string;
  send_automatic_whatsapp?: boolean;
  send_automatic_email?: boolean;
}

export interface ZapSignDoc {
  token: string;
  open_id: number;
  name: string;
  status: string; // "pending", "signed", etc
  signers: Array<{
    token: string;
    sign_url: string;
    name: string;
    status: string;
  }>;
  signed_file?: string; // URL do PDF assinado (só após signed)
  created_at: string;
}

/**
 * Cria um documento no ZapSign a partir de um PDF (base64) e envia pelo WhatsApp
 * pro signatário assinar. Autenticação via SMS (validade jurídica).
 */
export async function criarDocumentoEAssinar(params: {
  nome: string;
  pdfBase64: string;
  signatario: ZapSignSigner;
}): Promise<ZapSignDoc> {
  const token = getToken();

  // Mensagem customizada pro WhatsApp/email do signatario.
  // Restricoes do ZapSign: sem quebras de linha, tabs ou mais de 4 espacos consecutivos.
  // A mensagem complementa o link de assinatura que o ZapSign envia automaticamente.
  const nomeCliente = params.signatario.name.split(" ")[0] || "Cliente";
  const customMessage = `Ola ${nomeCliente}! A TigraoImports esta enviando o Termo de Procedencia do seu aparelho para assinatura digital. Ao clicar no link, voce recebera um codigo por SMS para autenticar e assinar o documento. Qualquer duvida, entre em contato conosco.`;

  const payload = {
    name: params.nome,
    base64_pdf: params.pdfBase64,
    lang: "pt-br",
    disable_signer_emails: params.signatario.send_automatic_whatsapp ?? true,
    brand_primary_color: "#E8740E",
    signers: [
      {
        name: params.signatario.name,
        phone_country: params.signatario.phone_country || "55",
        phone_number: params.signatario.phone_number,
        auth_mode: params.signatario.auth_mode || "assinaturaTela-tokenSms",
        cpf: params.signatario.cpf,
        email: params.signatario.email,
        send_automatic_whatsapp: params.signatario.send_automatic_whatsapp ?? true,
        send_automatic_email: params.signatario.send_automatic_email ?? false,
        custom_message: customMessage,
      },
    ],
  };

  const res = await fetch(`${ZAPSIGN_API}/docs/`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ZapSign erro ${res.status}: ${err}`);
  }

  const data = await res.json() as ZapSignDoc;
  return data;
}

/** Busca detalhes de um documento (pra checar status e pegar o PDF assinado) */
export async function buscarDocumento(docToken: string): Promise<ZapSignDoc> {
  const token = getToken();
  const res = await fetch(`${ZAPSIGN_API}/docs/${docToken}/`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`ZapSign erro ${res.status}`);
  return res.json() as Promise<ZapSignDoc>;
}

/** Cancela um documento (se cliente não assinou ainda) */
export async function cancelarDocumento(docToken: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${ZAPSIGN_API}/docs/${docToken}/cancel/`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`ZapSign erro ${res.status}`);
}
