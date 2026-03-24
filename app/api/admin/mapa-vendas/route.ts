// app/api/admin/mapa-vendas/route.ts — Sales geography analytics
import { NextRequest, NextResponse } from "next/server";

// Lookup table: common Rio de Janeiro bairros with approximate center coordinates
const BAIRRO_COORDS: Record<string, { lat: number; lng: number }> = {
  "Barra da Tijuca": { lat: -23.0003, lng: -43.3658 },
  "Recreio dos Bandeirantes": { lat: -23.0247, lng: -43.4637 },
  "Jacarepagua": { lat: -22.9494, lng: -43.3506 },
  "Copacabana": { lat: -22.9711, lng: -43.1863 },
  "Ipanema": { lat: -22.9838, lng: -43.2096 },
  "Leblon": { lat: -22.9841, lng: -43.2247 },
  "Botafogo": { lat: -22.9519, lng: -43.1832 },
  "Flamengo": { lat: -22.9326, lng: -43.1765 },
  "Tijuca": { lat: -22.9253, lng: -43.2318 },
  "Vila Isabel": { lat: -22.9235, lng: -43.2431 },
  "Meier": { lat: -22.9024, lng: -43.2813 },
  "Centro": { lat: -22.9068, lng: -43.1729 },
  "Lapa": { lat: -22.9134, lng: -43.1815 },
  "Laranjeiras": { lat: -22.9383, lng: -43.1891 },
  "Catete": { lat: -22.9264, lng: -43.1776 },
  "Gloria": { lat: -22.9226, lng: -43.1759 },
  "Gavea": { lat: -22.9812, lng: -43.2334 },
  "Jardim Botanico": { lat: -22.9666, lng: -43.2233 },
  "Lagoa": { lat: -22.9718, lng: -43.2112 },
  "Sao Conrado": { lat: -23.0015, lng: -43.2740 },
  "Humaita": { lat: -22.9546, lng: -43.1978 },
  "Urca": { lat: -22.9560, lng: -43.1683 },
  "Santa Teresa": { lat: -22.9243, lng: -43.1919 },
  "Cosme Velho": { lat: -22.9379, lng: -43.1923 },
  "Maracana": { lat: -22.9116, lng: -43.2302 },
  "Grajau": { lat: -22.9204, lng: -43.2598 },
  "Andarai": { lat: -22.9232, lng: -43.2467 },
  "Penha": { lat: -22.8442, lng: -43.2752 },
  "Olaria": { lat: -22.8495, lng: -43.2661 },
  "Ramos": { lat: -22.8501, lng: -43.2541 },
  "Bonsucesso": { lat: -22.8559, lng: -43.2497 },
  "Ilha do Governador": { lat: -22.8168, lng: -43.2113 },
  "Madureira": { lat: -22.8739, lng: -43.3393 },
  "Bangu": { lat: -22.8740, lng: -43.4654 },
  "Campo Grande": { lat: -22.9019, lng: -43.5601 },
  "Santa Cruz": { lat: -22.9119, lng: -43.6883 },
  "Guaratiba": { lat: -23.0548, lng: -43.5922 },
  "Realengo": { lat: -22.8693, lng: -43.4223 },
  "Padre Miguel": { lat: -22.8790, lng: -43.4403 },
  "Senador Camara": { lat: -22.8795, lng: -43.4500 },
  "Del Castilho": { lat: -22.8826, lng: -43.2745 },
  "Benfica": { lat: -22.8881, lng: -43.2359 },
  "Sao Cristovao": { lat: -22.8978, lng: -43.2192 },
  "Engenho Novo": { lat: -22.9031, lng: -43.2627 },
  "Todos os Santos": { lat: -22.8969, lng: -43.2811 },
  "Cachambi": { lat: -22.8961, lng: -43.2724 },
  "Abolição": { lat: -22.8962, lng: -43.2948 },
  "Piedade": { lat: -22.8896, lng: -43.3037 },
  "Cascadura": { lat: -22.8801, lng: -43.3385 },
  "Vicente de Carvalho": { lat: -22.8586, lng: -43.3062 },
  "Irajá": { lat: -22.8348, lng: -43.3283 },
  "Colégio": { lat: -22.8361, lng: -43.3183 },
  "Taquara": { lat: -22.9225, lng: -43.3715 },
  "Pechincha": { lat: -22.9384, lng: -43.3571 },
  "Freguesia": { lat: -22.9330, lng: -43.3481 },
  "Anil": { lat: -22.9383, lng: -43.3450 },
  "Curicica": { lat: -22.9491, lng: -43.3753 },
  "Gardenia Azul": { lat: -22.9541, lng: -43.3687 },
  "Itanhanga": { lat: -22.9870, lng: -43.3118 },
  "Vargem Grande": { lat: -23.0115, lng: -43.5008 },
  "Vargem Pequena": { lat: -22.9905, lng: -43.4628 },
  "Camorim": { lat: -22.9785, lng: -43.4304 },
  "Grumari": { lat: -23.0481, lng: -43.5203 },
  "Joá": { lat: -23.0069, lng: -43.2953 },
  // Niterói
  "Niteroi": { lat: -22.8833, lng: -43.1036 },
  "Icarai": { lat: -22.8999, lng: -43.1105 },
  "Ingá": { lat: -22.8984, lng: -43.1220 },
  "São Francisco": { lat: -22.8894, lng: -43.0994 },
  "Charitas": { lat: -22.9308, lng: -43.0972 },
  "Itaipu": { lat: -22.9635, lng: -43.0557 },
  "Piratininga": { lat: -22.9421, lng: -43.0753 },
  "Camboinhas": { lat: -22.9710, lng: -43.0465 },
  "Pendotiba": { lat: -22.8700, lng: -43.1010 },
  // Baixada Fluminense
  "Nova Iguacu": { lat: -22.7556, lng: -43.4503 },
  "Duque de Caxias": { lat: -22.7856, lng: -43.3117 },
  "São João de Meriti": { lat: -22.8058, lng: -43.3728 },
  "Nilópolis": { lat: -22.8058, lng: -43.4187 },
  "Belford Roxo": { lat: -22.7644, lng: -43.3994 },
  "Mesquita": { lat: -22.8022, lng: -43.4222 },
  // Zona Sul / other
  "Leme": { lat: -22.9638, lng: -43.1714 },
  "Vidigal": { lat: -22.9929, lng: -43.2337 },
  "Rocinha": { lat: -22.9879, lng: -43.2468 },
  "São Conrado": { lat: -23.0015, lng: -43.2740 },
  "Jacarepaguá": { lat: -22.9494, lng: -43.3506 },
  // Zona Norte extras
  "Guadalupe": { lat: -22.8542, lng: -43.3632 },
  "Oswaldo Cruz": { lat: -22.8673, lng: -43.3502 },
  "Rocha Miranda": { lat: -22.8574, lng: -43.3419 },
  "Marechal Hermes": { lat: -22.8615, lng: -43.3612 },
  "Pilares": { lat: -22.8850, lng: -43.2994 },
  "Engenho de Dentro": { lat: -22.8967, lng: -43.2733 },
  "Rocha": { lat: -22.9027, lng: -43.2607 },
  "Méier": { lat: -22.9024, lng: -43.2813 },
  "Jardim Guanabara": { lat: -22.8094, lng: -43.2024 },
  "Riachuelo": { lat: -22.9057, lng: -43.2523 },
  "Rio Comprido": { lat: -22.9128, lng: -43.2134 },
  "Praça da Bandeira": { lat: -22.9168, lng: -43.2269 },
  "Catumbi": { lat: -22.9160, lng: -43.1975 },
  "Estácio": { lat: -22.9119, lng: -43.2073 },
  "Água Santa": { lat: -22.9092, lng: -43.2913 },
  "Quintino Bocaiúva": { lat: -22.8800, lng: -43.3159 },
  "Campinho": { lat: -22.8792, lng: -43.3458 },
  "Cavalcanti": { lat: -22.8847, lng: -43.3194 },
  "Coelho Neto": { lat: -22.8410, lng: -43.3485 },
  "Acari": { lat: -22.8284, lng: -43.3491 },
  "Honório Gurgel": { lat: -22.8450, lng: -43.3541 },
  "Ricardo de Albuquerque": { lat: -22.8471, lng: -43.3892 },
  "Braz de Pina": { lat: -22.8364, lng: -43.2833 },
  // Zona Oeste extras
  "Barra Olímpica": { lat: -22.9792, lng: -43.3947 },
  "Tanque": { lat: -22.9167, lng: -43.3520 },
  "Praça Seca": { lat: -22.9010, lng: -43.3457 },
  "Vila Valqueire": { lat: -22.8850, lng: -43.3657 },
  "Jardim Sulacap": { lat: -22.8842, lng: -43.3869 },
  "Magalhães Bastos": { lat: -22.8735, lng: -43.4087 },
  "Deodoro": { lat: -22.8601, lng: -43.3905 },
  "Sepetiba": { lat: -22.9683, lng: -43.7101 },
  "Cosmos": { lat: -22.8993, lng: -43.6210 },
  "Inhoaíba": { lat: -22.8723, lng: -43.5543 },
  "Paciência": { lat: -22.8888, lng: -43.6311 },
  // Niterói extras
  "Trindade": { lat: -22.8781, lng: -43.0790 },
  "Fonseca": { lat: -22.8814, lng: -43.1255 },
  "Barreto": { lat: -22.8725, lng: -43.1345 },
  "Santa Rosa": { lat: -22.8868, lng: -43.1177 },
  "Vital Brazil": { lat: -22.9037, lng: -43.1246 },
  "Itacoatiara": { lat: -22.9767, lng: -43.0326 },
  "Largo do Barradas": { lat: -22.8871, lng: -43.0981 },
  // São Gonçalo
  "São Gonçalo": { lat: -22.8268, lng: -43.0634 },
  "Alcântara": { lat: -22.8218, lng: -43.0139 },
  "Neves": { lat: -22.8609, lng: -43.0827 },
  // Baixada extras
  "Nova Iguaçu": { lat: -22.7556, lng: -43.4503 },
  "Prata": { lat: -22.7412, lng: -43.4365 },
  "Mantiquira": { lat: -22.7614, lng: -43.2936 },
  "Vila Sarapuí": { lat: -22.7360, lng: -43.2780 },
  "Lar Fluminense": { lat: -22.8158, lng: -43.3628 },
  "Ponto Chic": { lat: -22.7456, lng: -43.4353 },
  // Maricá
  "Maricá": { lat: -22.9187, lng: -42.8238 },
  "Itaipuaçu": { lat: -22.9527, lng: -42.9835 },
  "Jardim Atlântico Leste (Itaipuaçu)": { lat: -22.9527, lng: -42.9835 },
  // Itaboraí
  "Itaboraí": { lat: -22.7445, lng: -42.8594 },
  "Bela Vista": { lat: -22.7382, lng: -42.8641 },
  "Caluge": { lat: -22.7525, lng: -42.8707 },
  "Itaville": { lat: -22.7512, lng: -42.8500 },
  // Petrópolis / Teresópolis
  "Petrópolis": { lat: -22.5046, lng: -43.1824 },
  "Teresópolis": { lat: -22.4121, lng: -42.9659 },
  // Outras cidades RJ
  "Macaé": { lat: -22.3768, lng: -41.7869 },
  "Cabo Frio": { lat: -22.8791, lng: -42.0189 },
  "Angra dos Reis": { lat: -23.0067, lng: -44.3181 },
  "Volta Redonda": { lat: -22.5231, lng: -44.1040 },
  "Magé": { lat: -22.6527, lng: -43.1703 },
  "Macuco": { lat: -21.9817, lng: -42.2545 },
  "Porciúncula": { lat: -20.9614, lng: -42.0382 },
  "Passa Quatro": { lat: -22.3872, lng: -44.9706 },
  // Feira de Santana BA
  "Feira de Santana": { lat: -12.2669, lng: -38.9666 },
  "Camaçari": { lat: -12.6996, lng: -38.3238 },
  "Itapetinga": { lat: -15.2487, lng: -40.2481 },
  // SP
  "São Paulo": { lat: -23.5505, lng: -46.6333 },
  "Florianópolis": { lat: -27.5954, lng: -48.5480 },
  // Outros bairros frequentes
  "Freguesia (Jacarepaguá)": { lat: -22.9330, lng: -43.3481 },
  "Jardim Atlântico": { lat: -22.9527, lng: -42.9835 },
  // Bairros faltantes RJ capital
  "Vila da Penha": { lat: -22.8410, lng: -43.3100 },
  "Lins de Vasconcelos": { lat: -22.9002, lng: -43.2700 },
  "Pavuna": { lat: -22.8208, lng: -43.3618 },
  "Sampaio": { lat: -22.8995, lng: -43.2607 },
  "Maré": { lat: -22.8557, lng: -43.2472 },
  "Galeão": { lat: -22.8133, lng: -43.2500 },
  "Campo dos Afonsos": { lat: -22.8782, lng: -43.3832 },
  "Tauá": { lat: -22.8038, lng: -43.1907 },
  "Ribeira": { lat: -22.8115, lng: -43.1880 },
  "Humaitá": { lat: -22.9546, lng: -43.1978 },
  "Gávea": { lat: -22.9812, lng: -43.2334 },
  "Maracanã": { lat: -22.9116, lng: -43.2302 },
  "Grajaú": { lat: -22.9204, lng: -43.2598 },
  "Andaraí": { lat: -22.9232, lng: -43.2467 },
  // São Gonçalo bairros
  "Paraíso": { lat: -22.8278, lng: -43.0490 },
  "Porto Novo": { lat: -22.8509, lng: -43.0734 },
  "Antonina": { lat: -22.8170, lng: -43.0310 },
  "Pacheco": { lat: -22.8320, lng: -43.0580 },
  // Niterói extras
  "Maceió": { lat: -22.8890, lng: -43.1050 },
  // Maricá extras
  "Cordeirinho (Ponta Negra)": { lat: -22.9350, lng: -42.8400 },
  "Recanto de Itaipuaçu (Itaipuaçu)": { lat: -22.9520, lng: -42.9800 },
  // Duque de Caxias extras
  "Jardim Leal": { lat: -22.7850, lng: -43.3050 },
  "Pilar": { lat: -22.7700, lng: -43.2950 },
  "Parque Xerém": { lat: -22.5800, lng: -43.2950 },
  "Chácaras Rio-Petrópolis": { lat: -22.6100, lng: -43.2700 },
  // Nova Iguaçu extras
  "Austin": { lat: -22.7450, lng: -43.4380 },
  "Jardim Belo Horizonte": { lat: -22.7520, lng: -43.4600 },
  // Outras cidades
  "Retiro": { lat: -22.5150, lng: -44.1060 },
  "Nogueira": { lat: -22.4800, lng: -43.1900 },
  "Geribá": { lat: -22.7700, lng: -41.8900 },
  "Campo Lindo": { lat: -22.7500, lng: -43.6500 },
  "Seropédica": { lat: -22.7267, lng: -43.7094 },
  "Saquarema": { lat: -22.9197, lng: -42.5100 },
  "Bacaxá (Bacaxá)": { lat: -22.8800, lng: -42.5200 },
  // Fora do RJ
  "Goiânia": { lat: -16.6869, lng: -49.2648 },
  "Jardim Goiás": { lat: -16.6900, lng: -49.2400 },
  "Brasília": { lat: -15.7975, lng: -47.8919 },
  "Setor Sudoeste": { lat: -15.8000, lng: -47.9200 },
  "Belo Horizonte": { lat: -19.9167, lng: -43.9345 },
  "Funcionários": { lat: -19.9300, lng: -43.9300 },
  "Recife": { lat: -8.0476, lng: -34.8770 },
  "Torrões": { lat: -8.0500, lng: -34.9300 },
  "Pinheiros": { lat: -23.5614, lng: -46.6930 },
  "Canela": { lat: -29.3656, lng: -50.8122 },
  "Luiza Corrêa": { lat: -29.3600, lng: -50.8100 },
  "Armação dos Búzios": { lat: -22.7488, lng: -41.8819 },
  // Niterói extras 2
  "Centro, Niterói": { lat: -22.8838, lng: -43.1037 },
  // São Gonçalo extras
  "Centro, São Gonçalo": { lat: -22.8269, lng: -43.0538 },
  "Colubandê": { lat: -22.8139, lng: -43.0228 },
  // Outras cidades Brasil
  "Campos dos Goytacazes": { lat: -21.7543, lng: -41.3244 },
  "Salvador": { lat: -12.9714, lng: -38.5124 },
};

function normalizeBairroName(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Fallback: city center coordinates when bairro not found
const CIDADE_COORDS: Record<string, { lat: number; lng: number }> = {
  "rio de janeiro": { lat: -22.9068, lng: -43.1729 },
  "niteroi": { lat: -22.8833, lng: -43.1036 },
  "niterói": { lat: -22.8833, lng: -43.1036 },
  "sao goncalo": { lat: -22.8268, lng: -43.0634 },
  "são gonçalo": { lat: -22.8268, lng: -43.0634 },
  "duque de caxias": { lat: -22.7856, lng: -43.3117 },
  "nova iguacu": { lat: -22.7556, lng: -43.4503 },
  "nova iguaçu": { lat: -22.7556, lng: -43.4503 },
  "sao joao de meriti": { lat: -22.8058, lng: -43.3728 },
  "são joão de meriti": { lat: -22.8058, lng: -43.3728 },
  "marica": { lat: -22.9187, lng: -42.8238 },
  "maricá": { lat: -22.9187, lng: -42.8238 },
  "itaborai": { lat: -22.7445, lng: -42.8594 },
  "itaboraí": { lat: -22.7445, lng: -42.8594 },
  "petropolis": { lat: -22.5046, lng: -43.1824 },
  "petrópolis": { lat: -22.5046, lng: -43.1824 },
  "volta redonda": { lat: -22.5231, lng: -44.1040 },
  "seropedica": { lat: -22.7267, lng: -43.7094 },
  "seropédica": { lat: -22.7267, lng: -43.7094 },
  "saquarema": { lat: -22.9197, lng: -42.5100 },
  "goiania": { lat: -16.6869, lng: -49.2648 },
  "goiânia": { lat: -16.6869, lng: -49.2648 },
  "brasilia": { lat: -15.7975, lng: -47.8919 },
  "brasília": { lat: -15.7975, lng: -47.8919 },
  "belo horizonte": { lat: -19.9167, lng: -43.9345 },
  "recife": { lat: -8.0476, lng: -34.8770 },
  "sao paulo": { lat: -23.5505, lng: -46.6333 },
  "são paulo": { lat: -23.5505, lng: -46.6333 },
  "armacao dos buzios": { lat: -22.7488, lng: -41.8819 },
  "canela": { lat: -29.3656, lng: -50.8122 },
  "macae": { lat: -22.3768, lng: -41.7869 },
  "macaé": { lat: -22.3768, lng: -41.7869 },
  "belford roxo": { lat: -22.7644, lng: -43.3994 },
  "mesquita": { lat: -22.8022, lng: -43.4222 },
  "nilopolis": { lat: -22.8058, lng: -43.4187 },
  "nilópolis": { lat: -22.8058, lng: -43.4187 },
  "campos dos goytacazes": { lat: -21.7543, lng: -41.3244 },
  "salvador": { lat: -12.9714, lng: -38.5124 },
  "florianopolis": { lat: -27.5954, lng: -48.5480 },
  "florianópolis": { lat: -27.5954, lng: -48.5480 },
};

function findBairroCoords(nome: string, cidade?: string): { lat: number; lng: number } | null {
  const normalized = normalizeBairroName(nome);
  // Exact match
  for (const [key, coords] of Object.entries(BAIRRO_COORDS)) {
    if (normalizeBairroName(key) === normalized) return coords;
  }
  // Partial match
  for (const [key, coords] of Object.entries(BAIRRO_COORDS)) {
    const nk = normalizeBairroName(key);
    if (nk.includes(normalized) || normalized.includes(nk)) return coords;
  }
  // Fallback: use city center coordinates
  if (cidade) {
    const cidadeNorm = cidade.toLowerCase().trim();
    if (CIDADE_COORDS[cidadeNorm]) return CIDADE_COORDS[cidadeNorm];
    // Try normalized
    const cidadeNormalized = normalizeBairroName(cidade);
    for (const [key, coords] of Object.entries(CIDADE_COORDS)) {
      if (normalizeBairroName(key) === cidadeNormalized) return coords;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const password = req.headers.get("x-admin-password");
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { supabase } = await import("@/lib/supabase");

  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "30";

  // Build date filter
  let dateFilter: string | null = null;
  let dateFilterTo: string | null = null;
  if (range === "custom") {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from) dateFilter = from;
    if (to) dateFilterTo = to;
  } else if (range === "month") {
    const now = new Date();
    dateFilter = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  } else if (range !== "all") {
    const days = parseInt(range, 10) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    dateFilter = since.toISOString().split("T")[0];
  }

  try {
    let query = supabase
      .from("vendas")
      .select("*")
      .order("data", { ascending: false });

    const { data: rawVendas, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filtrar no JS para evitar bug do .neq() excluir NULLs no Supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filteredVendas = (rawVendas ?? []).filter((v: any) => {
      if (v.status_pagamento === "CANCELADO") return false;
      if (v.tipo === "ATACADO") return false;
      // Filtrar CEPs inválidos
      const cep = (v.cep || "").replace(/\D/g, "");
      if (cep === "00000000") return false;
      // Filtrar por data se necessário
      if (dateFilter && v.data < dateFilter) return false;
      if (dateFilterTo && v.data > dateFilterTo) return false;
      return true;
    });

    const rows = filteredVendas as {
      id: string;
      data: string;
      cliente: string;
      preco_vendido: number;
      custo: number;
      lucro: number;
      bairro: string | null;
      cidade: string | null;
      uf: string | null;
    }[];

    // --- Aggregate by bairro (top 20) ---
    // Agrupar por bairro+cidade para separar "Centro, RJ" de "Centro, Nova Iguaçu"
    const porBairro: Record<string, { qty: number; receita: number; lucro: number; bairro: string; cidade: string }> = {};
    for (const v of rows) {
      const b = (v.bairro || "").trim() || "Nao informado";
      const cidade = (v.cidade || "").trim();
      const key = b === "Nao informado" ? "Nao informado" : `${b}|${cidade || "RJ"}`;
      if (!porBairro[key]) porBairro[key] = { qty: 0, receita: 0, lucro: 0, bairro: b, cidade };
      porBairro[key].qty++;
      porBairro[key].receita += Number(v.preco_vendido || 0);
      porBairro[key].lucro += Number(v.lucro || 0);
    }

    const bairros = Object.entries(porBairro)
      .map(([, d]) => {
        const coords = findBairroCoords(d.bairro, d.cidade);
        const nome = d.cidade && d.cidade !== "Rio de Janeiro" && d.bairro !== "Nao informado"
          ? `${d.bairro}, ${d.cidade}` : d.bairro;
        return {
          nome,
          qty: d.qty,
          receita: d.receita,
          lucro: d.lucro,
          ticket: d.qty > 0 ? Math.round(d.receita / d.qty) : 0,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        };
      })
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 30);

    // --- Aggregate by cidade (top 10) ---
    const porCidade: Record<string, { qty: number; receita: number; lucro: number }> = {};
    for (const v of rows) {
      const c = (v.cidade || "").trim() || "Nao informado";
      if (!porCidade[c]) porCidade[c] = { qty: 0, receita: 0, lucro: 0 };
      porCidade[c].qty++;
      porCidade[c].receita += Number(v.preco_vendido || 0);
      porCidade[c].lucro += Number(v.lucro || 0);
    }

    const cidades = Object.entries(porCidade)
      .map(([nome, d]) => ({
        nome,
        qty: d.qty,
        receita: d.receita,
        lucro: d.lucro,
        ticket: d.qty > 0 ? Math.round(d.receita / d.qty) : 0,
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    // --- Aggregate by UF ---
    const porUF: Record<string, { qty: number; receita: number; lucro: number }> = {};
    for (const v of rows) {
      const u = (v.uf || "").trim().toUpperCase() || "N/A";
      if (!porUF[u]) porUF[u] = { qty: 0, receita: 0, lucro: 0 };
      porUF[u].qty++;
      porUF[u].receita += Number(v.preco_vendido || 0);
      porUF[u].lucro += Number(v.lucro || 0);
    }

    const estados = Object.entries(porUF)
      .map(([nome, d]) => ({
        nome,
        qty: d.qty,
        receita: d.receita,
        lucro: d.lucro,
        ticket: d.qty > 0 ? Math.round(d.receita / d.qty) : 0,
      }))
      .sort((a, b) => b.qty - a.qty);

    // --- Top clients by volume ---
    const porCliente: Record<string, { qty: number; total: number; lucro: number; lastDate: string }> = {};
    for (const v of rows) {
      const cli = (v.cliente || "").trim().toUpperCase();
      if (!cli) continue;
      if (!porCliente[cli]) porCliente[cli] = { qty: 0, total: 0, lucro: 0, lastDate: "" };
      porCliente[cli].qty++;
      porCliente[cli].total += Number(v.preco_vendido || 0);
      porCliente[cli].lucro += Number(v.lucro || 0);
      if (v.data > porCliente[cli].lastDate) porCliente[cli].lastDate = v.data;
    }

    const topClientes = Object.entries(porCliente)
      .map(([nome, d]) => ({
        nome,
        compras: d.qty,
        total: d.total,
        lucro: d.lucro,
        ultimaCompra: d.lastDate,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // --- Day of week analysis ---
    const diasSemana = [0, 0, 0, 0, 0, 0, 0];
    const receitaDia = [0, 0, 0, 0, 0, 0, 0];
    for (const v of rows) {
      if (!v.data) continue;
      const [y, m, d] = v.data.split("-").map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      diasSemana[dow]++;
      receitaDia[dow] += Number(v.preco_vendido || 0);
    }

    const NOMES_DIAS = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];
    const porDiaSemana = NOMES_DIAS.map((nome, i) => ({
      dia: nome,
      vendas: diasSemana[i],
      receita: receitaDia[i],
    }));

    // --- Totals ---
    const totalVendas = rows.length;
    const totalReceita = rows.reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
    const totalLucro = rows.reduce((s, v) => s + Number(v.lucro || 0), 0);
    const ticketMedio = totalVendas > 0 ? Math.round(totalReceita / totalVendas) : 0;

    return NextResponse.json({
      totalVendas,
      totalReceita,
      totalLucro,
      ticketMedio,
      bairros,
      cidades,
      estados,
      topClientes,
      porDiaSemana,
    });
  } catch (err) {
    console.error("Erro mapa-vendas:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
