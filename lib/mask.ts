// Mascaras de campos comuns (CPF, CNPJ, CEP, telefone BR).
// Sao idempotentes — passar uma string ja formatada retorna o mesmo formato.
// Stripam tudo que nao e digito antes de reformatar.

export function maskCpf(value: string | null | undefined): string {
  if (!value) return "";
  const d = String(value).replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function maskCnpj(value: string | null | undefined): string {
  if (!value) return "";
  const d = String(value).replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function maskCep(value: string | null | undefined): string {
  if (!value) return "";
  const d = String(value).replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

// Telefone BR — 10 ou 11 digitos (fixo ou celular). Remove DDI 55 se presente.
// Formatos:
//   11 digitos: (21) 99999-9999
//   10 digitos: (21) 9999-9999
//    < 10: vai formatando progressivamente conforme digita
export function maskTelefone(value: string | null | undefined): string {
  if (!value) return "";
  let d = String(value).replace(/\D/g, "");
  // Remove DDI 55 quando colado com o codigo do pais
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
