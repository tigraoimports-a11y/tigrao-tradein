// Lookup de coordenadas pra bairros + cidades brasileiras (foco RJ).
//
// Usado por:
// - /api/admin/mapa-vendas (mapa de vendas + heatmap por bairro #21)
// - /api/admin/entregas/otimizar-rota (rota otimizada de entregas #24)
//
// As coordenadas sao do CENTRO aproximado do bairro/cidade — preciso
// suficiente pra agregar vendas e calcular distancias entre pontos pra
// otimizar rota greedy. Pra entrega real, o motoboy ja usa o GPS dele.

export interface Coords {
  lat: number;
  lng: number;
}

export const BAIRRO_COORDS: Record<string, Coords> = {
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
};

export const CIDADE_COORDS: Record<string, Coords> = {
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
  "armacao dos buzios": { lat: -22.7488, lng: -41.8819 },
  "macae": { lat: -22.3768, lng: -41.7869 },
  "macaé": { lat: -22.3768, lng: -41.7869 },
  "belford roxo": { lat: -22.7644, lng: -43.3994 },
  "mesquita": { lat: -22.8022, lng: -43.4222 },
  "nilopolis": { lat: -22.8058, lng: -43.4187 },
  "nilópolis": { lat: -22.8058, lng: -43.4187 },
  "teresopolis": { lat: -22.4121, lng: -42.9656 },
  "teresópolis": { lat: -22.4121, lng: -42.9656 },
  "cabo frio": { lat: -22.8789, lng: -42.0187 },
  "resende": { lat: -22.4686, lng: -44.4467 },
  "barra mansa": { lat: -22.5443, lng: -44.1748 },
  "angra dos reis": { lat: -23.0067, lng: -44.3181 },
  "mangaratiba": { lat: -22.9594, lng: -44.0408 },
  "rio das ostras": { lat: -22.5269, lng: -41.9450 },
  "araruama": { lat: -22.8729, lng: -42.3431 },
  "nova friburgo": { lat: -22.2819, lng: -42.5311 },
  "queimados": { lat: -22.7106, lng: -43.5519 },
  "japeri": { lat: -22.6431, lng: -43.6533 },
  "paracambi": { lat: -22.6108, lng: -43.7108 },
  "itaguai": { lat: -22.8631, lng: -43.7756 },
  "itaguaí": { lat: -22.8631, lng: -43.7756 },
  "magé": { lat: -22.6528, lng: -43.1706 },
  "mage": { lat: -22.6528, lng: -43.1706 },
  "guapimirim": { lat: -22.5369, lng: -43.0131 },
  "rio bonito": { lat: -22.7133, lng: -42.6267 },
  "buzios": { lat: -22.7488, lng: -41.8819 },
  "búzios": { lat: -22.7488, lng: -41.8819 },
};

/**
 * Normaliza nome de bairro/cidade pra match case+acento-insensitive.
 * Usado pra match flexivel — "São Gonçalo" === "sao goncalo" === "SAO GONCALO".
 */
export function normalizeName(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Indices normalizados pra lookup rapido
const BAIRRO_INDEX: Record<string, Coords> = (() => {
  const idx: Record<string, Coords> = {};
  for (const [k, v] of Object.entries(BAIRRO_COORDS)) {
    idx[normalizeName(k)] = v;
  }
  return idx;
})();

/**
 * Acha coordenadas pra um endereco baseado em bairro + cidade (com fallback).
 * Retorna null se nada bate — o caller decide o que fazer (ignorar ponto,
 * mostrar erro, etc).
 *
 * Estrategia:
 * 1. Match por bairro normalizado (case+acento-insensitive)
 * 2. Match por cidade normalizada
 * 3. Null
 */
export function findCoords(input: { bairro?: string | null; cidade?: string | null }): Coords | null {
  const { bairro, cidade } = input;
  if (bairro) {
    const key = normalizeName(bairro);
    const direct = BAIRRO_INDEX[key];
    if (direct) return direct;
  }
  if (cidade) {
    const key = normalizeName(cidade);
    const cityHit = CIDADE_COORDS[key];
    if (cityHit) return cityHit;
  }
  return null;
}

/**
 * Distancia haversine (km) entre 2 pontos lat/lng. Usado pelo otimizador
 * de rota greedy — distancia "em linha reta" e ok pra ordenar visitas
 * (motoboy ja recalcula com rua real depois no Google Maps).
 */
export function haversineKm(a: Coords, b: Coords): number {
  const R = 6371; // raio Terra km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
