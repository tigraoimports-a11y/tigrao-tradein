/**
 * Script para popular o mostruário com catálogo completo Apple
 * Roda via: npx tsx scripts/populate-mostruario.ts
 *
 * Usa a API do admin mostruário para criar categorias, produtos e variações.
 * Preços ficam em 0 — André ajusta depois.
 */

const BASE = process.env.BASE_URL || "https://tigrao-tradein.vercel.app";
const PW = process.env.ADMIN_PW || "";

async function api(action: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/admin/mostruario`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-password": PW },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json();
  if (!res.ok) console.error(`  ❌ ${action}:`, json.error || json);
  return json;
}

async function apiGet() {
  const res = await fetch(`${BASE}/api/admin/mostruario`, {
    headers: { "x-admin-password": PW },
  });
  return res.json();
}

// ── CATÁLOGO COMPLETO ──

interface ProdutoDef {
  nome: string;
  descricao: string;
  descricao_curta: string;
  tags: string[];
  imagem?: string;
  variacoes: { nome: string; atributos: Record<string, string> }[];
}

// Imagens dos produtos (pngimg.com — uso livre, fundo transparente)
const IMGS: Record<string, string> = {
  "iPhone 17 Pro Max": "https://pngimg.com/uploads/iphone17/iphone17_PNG41.png",
  "iPhone 17 Pro": "https://pngimg.com/uploads/iphone17/iphone17_PNG28.png",
  "iPhone 17": "https://pngimg.com/uploads/iphone17/iphone17_PNG15.png",
  "iPhone 16 Pro Max": "https://pngimg.com/uploads/iphone16/iphone16_PNG53.png",
  "iPhone 16 Pro": "https://pngimg.com/uploads/iphone16/iphone16_PNG40.png",
  "iPhone 16 Plus": "https://pngimg.com/uploads/iphone16/iphone16_PNG20.png",
  "iPhone 16": "https://pngimg.com/uploads/iphone16/iphone16_PNG1.png",
  "iPhone 15 Pro Max": "https://pngimg.com/uploads/iphone15/iphone15_PNG32.png",
  "iPhone 15": "https://pngimg.com/uploads/iphone15/iphone15_PNG1.png",
  "MacBook Air M4 13\"": "https://pngimg.com/uploads/macbook/macbook_PNG5.png",
  "MacBook Air M4 15\"": "https://pngimg.com/uploads/macbook/macbook_PNG7.png",
  "MacBook Pro M4 14\"": "https://pngimg.com/uploads/macbook/macbook_PNG30.png",
  "MacBook Pro M4 Pro 14\"": "https://pngimg.com/uploads/macbook/macbook_PNG30.png",
  "iPad A16": "https://pngimg.com/uploads/ipad/ipad_PNG12113.png",
  "iPad Air M3 11\"": "https://pngimg.com/uploads/ipad/ipad_PNG12117.png",
  "iPad Air M3 13\"": "https://pngimg.com/uploads/ipad/ipad_PNG12117.png",
  "iPad Mini": "https://pngimg.com/uploads/ipad/ipad_PNG12107.png",
  "iPad Pro M5 11\"": "https://pngimg.com/uploads/ipad/ipad_PNG12100.png",
  "Apple Watch Series 11": "https://pngimg.com/uploads/applewatch/applewatch_PNG53.png",
  "Apple Watch Ultra 3": "https://pngimg.com/uploads/applewatch/applewatch_PNG58.png",
  "Apple Watch SE 3": "https://pngimg.com/uploads/applewatch/applewatch_PNG40.png",
  "Mac Mini M4": "https://pngimg.com/uploads/mac_mini/mac_mini_PNG3.png",
  "Mac Mini M4 Pro": "https://pngimg.com/uploads/mac_mini/mac_mini_PNG3.png",
  "AirPods 4": "https://pngimg.com/uploads/airpods/airpods_PNG37.png",
  "AirPods 4 ANC": "https://pngimg.com/uploads/airpods/airpods_PNG37.png",
  "AirPods Pro 3": "https://pngimg.com/uploads/airpods/airpods_PNG26.png",
  "AirPods Max USB-C": "https://pngimg.com/uploads/airpods/airpods_PNG50.png",
  "Apple Pencil Pro": "https://pngimg.com/uploads/apple_pencil/apple_pencil_PNG4.png",
  "Apple Pencil USB-C": "https://pngimg.com/uploads/apple_pencil/apple_pencil_PNG4.png",
};

interface CategoriaDef {
  nome: string;
  emoji: string;
  produtos: ProdutoDef[];
}

const CATALOGO: CategoriaDef[] = [
  {
    nome: "iPhone",
    emoji: "📱",
    produtos: [
      // iPhone 17 Pro Max
      {
        nome: "iPhone 17 Pro Max",
        descricao: "O iPhone mais poderoso já feito. Chip A19 Pro, câmera de 48MP com zoom óptico 5x, tela Super Retina XDR de 6.9 polegadas. eSIM only.",
        descricao_curta: "A19 Pro | 48MP | 6.9\" | eSIM",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal", "eSIM only"],
        variacoes: [
          { nome: "256GB Titânio Natural", atributos: { storage: "256GB", cor: "Titânio Natural" } },
          { nome: "256GB Titânio Preto", atributos: { storage: "256GB", cor: "Titânio Preto" } },
          { nome: "256GB Titânio Branco", atributos: { storage: "256GB", cor: "Titânio Branco" } },
          { nome: "256GB Titânio Verde", atributos: { storage: "256GB", cor: "Titânio Verde" } },
          { nome: "512GB Titânio Natural", atributos: { storage: "512GB", cor: "Titânio Natural" } },
          { nome: "512GB Titânio Preto", atributos: { storage: "512GB", cor: "Titânio Preto" } },
          { nome: "512GB Titânio Branco", atributos: { storage: "512GB", cor: "Titânio Branco" } },
          { nome: "512GB Titânio Verde", atributos: { storage: "512GB", cor: "Titânio Verde" } },
          { nome: "1TB Titânio Natural", atributos: { storage: "1TB", cor: "Titânio Natural" } },
          { nome: "1TB Titânio Preto", atributos: { storage: "1TB", cor: "Titânio Preto" } },
          { nome: "1TB Titânio Branco", atributos: { storage: "1TB", cor: "Titânio Branco" } },
          { nome: "1TB Titânio Verde", atributos: { storage: "1TB", cor: "Titânio Verde" } },
        ],
      },
      // iPhone 17 Pro
      {
        nome: "iPhone 17 Pro",
        descricao: "Performance profissional com chip A19 Pro, câmera de 48MP, tela de 6.3 polegadas ProMotion. eSIM only.",
        descricao_curta: "A19 Pro | 48MP | 6.3\" | eSIM",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal", "eSIM only"],
        variacoes: [
          { nome: "256GB Titânio Natural", atributos: { storage: "256GB", cor: "Titânio Natural" } },
          { nome: "256GB Titânio Preto", atributos: { storage: "256GB", cor: "Titânio Preto" } },
          { nome: "256GB Titânio Branco", atributos: { storage: "256GB", cor: "Titânio Branco" } },
          { nome: "256GB Titânio Verde", atributos: { storage: "256GB", cor: "Titânio Verde" } },
          { nome: "512GB Titânio Natural", atributos: { storage: "512GB", cor: "Titânio Natural" } },
          { nome: "512GB Titânio Preto", atributos: { storage: "512GB", cor: "Titânio Preto" } },
          { nome: "1TB Titânio Natural", atributos: { storage: "1TB", cor: "Titânio Natural" } },
          { nome: "1TB Titânio Preto", atributos: { storage: "1TB", cor: "Titânio Preto" } },
        ],
      },
      // iPhone 17
      {
        nome: "iPhone 17",
        descricao: "Design renovado com chip A19, câmera de 48MP, tela de 6.1 polegadas OLED. eSIM only.",
        descricao_curta: "A19 | 48MP | 6.1\" | eSIM",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal", "eSIM only"],
        variacoes: [
          { nome: "256GB Preto", atributos: { storage: "256GB", cor: "Preto" } },
          { nome: "256GB Branco", atributos: { storage: "256GB", cor: "Branco" } },
          { nome: "256GB Verde", atributos: { storage: "256GB", cor: "Verde" } },
          { nome: "256GB Azul", atributos: { storage: "256GB", cor: "Azul" } },
          { nome: "512GB Preto", atributos: { storage: "512GB", cor: "Preto" } },
          { nome: "512GB Branco", atributos: { storage: "512GB", cor: "Branco" } },
        ],
      },
      // iPhone 16 Pro Max
      {
        nome: "iPhone 16 Pro Max",
        descricao: "Tela de 6.9\" Super Retina XDR, chip A18 Pro, câmera 48MP com zoom 5x. O máximo em desempenho.",
        descricao_curta: "A18 Pro | 48MP | 6.9\"",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "256GB Titânio Natural", atributos: { storage: "256GB", cor: "Titânio Natural" } },
          { nome: "256GB Titânio Preto", atributos: { storage: "256GB", cor: "Titânio Preto" } },
          { nome: "256GB Titânio Branco", atributos: { storage: "256GB", cor: "Titânio Branco" } },
          { nome: "256GB Titânio Deserto", atributos: { storage: "256GB", cor: "Titânio Deserto" } },
          { nome: "512GB Titânio Natural", atributos: { storage: "512GB", cor: "Titânio Natural" } },
          { nome: "512GB Titânio Preto", atributos: { storage: "512GB", cor: "Titânio Preto" } },
          { nome: "1TB Titânio Natural", atributos: { storage: "1TB", cor: "Titânio Natural" } },
          { nome: "1TB Titânio Preto", atributos: { storage: "1TB", cor: "Titânio Preto" } },
        ],
      },
      // iPhone 16 Pro
      {
        nome: "iPhone 16 Pro",
        descricao: "Chip A18 Pro, câmera 48MP, tela ProMotion de 6.3\". Performance profissional.",
        descricao_curta: "A18 Pro | 48MP | 6.3\"",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "128GB Titânio Natural", atributos: { storage: "128GB", cor: "Titânio Natural" } },
          { nome: "128GB Titânio Preto", atributos: { storage: "128GB", cor: "Titânio Preto" } },
          { nome: "256GB Titânio Natural", atributos: { storage: "256GB", cor: "Titânio Natural" } },
          { nome: "256GB Titânio Preto", atributos: { storage: "256GB", cor: "Titânio Preto" } },
          { nome: "512GB Titânio Natural", atributos: { storage: "512GB", cor: "Titânio Natural" } },
          { nome: "1TB Titânio Natural", atributos: { storage: "1TB", cor: "Titânio Natural" } },
        ],
      },
      // iPhone 16 Plus
      {
        nome: "iPhone 16 Plus",
        descricao: "Tela grande de 6.7\", chip A18, câmera de 48MP. Bateria para o dia todo.",
        descricao_curta: "A18 | 48MP | 6.7\"",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "128GB Preto", atributos: { storage: "128GB", cor: "Preto" } },
          { nome: "128GB Branco", atributos: { storage: "128GB", cor: "Branco" } },
          { nome: "256GB Preto", atributos: { storage: "256GB", cor: "Preto" } },
          { nome: "256GB Azul", atributos: { storage: "256GB", cor: "Azul" } },
        ],
      },
      // iPhone 16
      {
        nome: "iPhone 16",
        descricao: "Chip A18, câmera de 48MP, tela OLED de 6.1\". Desempenho e elegância.",
        descricao_curta: "A18 | 48MP | 6.1\"",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "128GB Preto", atributos: { storage: "128GB", cor: "Preto" } },
          { nome: "128GB Branco", atributos: { storage: "128GB", cor: "Branco" } },
          { nome: "128GB Rosa", atributos: { storage: "128GB", cor: "Rosa" } },
          { nome: "128GB Azul", atributos: { storage: "128GB", cor: "Azul" } },
          { nome: "256GB Preto", atributos: { storage: "256GB", cor: "Preto" } },
          { nome: "256GB Branco", atributos: { storage: "256GB", cor: "Branco" } },
        ],
      },
      // iPhone 15 Pro Max
      {
        nome: "iPhone 15 Pro Max",
        descricao: "Titânio, chip A17 Pro, câmera 48MP com zoom 5x. Referência em potência.",
        descricao_curta: "A17 Pro | 48MP | 6.7\" | Titânio",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "256GB Titânio Natural", atributos: { storage: "256GB", cor: "Titânio Natural" } },
          { nome: "256GB Titânio Preto", atributos: { storage: "256GB", cor: "Titânio Preto" } },
          { nome: "512GB Titânio Natural", atributos: { storage: "512GB", cor: "Titânio Natural" } },
          { nome: "1TB Titânio Natural", atributos: { storage: "1TB", cor: "Titânio Natural" } },
        ],
      },
      // iPhone 15
      {
        nome: "iPhone 15",
        descricao: "Dynamic Island, câmera 48MP, USB-C. Design premium acessível.",
        descricao_curta: "A16 | 48MP | 6.1\" | USB-C",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "128GB Preto", atributos: { storage: "128GB", cor: "Preto" } },
          { nome: "128GB Azul", atributos: { storage: "128GB", cor: "Azul" } },
          { nome: "128GB Rosa", atributos: { storage: "128GB", cor: "Rosa" } },
          { nome: "256GB Preto", atributos: { storage: "256GB", cor: "Preto" } },
        ],
      },
    ],
  },
  {
    nome: "MacBook",
    emoji: "💻",
    produtos: [
      {
        nome: "MacBook Air M4 13\"",
        descricao: "Ultrafino com chip M4, tela Liquid Retina de 13.6\", até 18h de bateria. Perfeito para o dia a dia.",
        descricao_curta: "M4 | 13.6\" | Até 18h bateria",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "16GB/256GB Meia-noite", atributos: { ram: "16GB", storage: "256GB", cor: "Meia-noite" } },
          { nome: "16GB/256GB Estelar", atributos: { ram: "16GB", storage: "256GB", cor: "Estelar" } },
          { nome: "16GB/512GB Meia-noite", atributos: { ram: "16GB", storage: "512GB", cor: "Meia-noite" } },
          { nome: "24GB/512GB Meia-noite", atributos: { ram: "24GB", storage: "512GB", cor: "Meia-noite" } },
        ],
      },
      {
        nome: "MacBook Air M4 15\"",
        descricao: "Tela grande Liquid Retina de 15.3\" com chip M4. Produtividade sem limites.",
        descricao_curta: "M4 | 15.3\" | Até 18h bateria",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "16GB/256GB Meia-noite", atributos: { ram: "16GB", storage: "256GB", cor: "Meia-noite" } },
          { nome: "16GB/512GB Meia-noite", atributos: { ram: "16GB", storage: "512GB", cor: "Meia-noite" } },
          { nome: "16GB/512GB Estelar", atributos: { ram: "16GB", storage: "512GB", cor: "Estelar" } },
          { nome: "24GB/512GB Meia-noite", atributos: { ram: "24GB", storage: "512GB", cor: "Meia-noite" } },
        ],
      },
      {
        nome: "MacBook Pro M4 14\"",
        descricao: "Chip M4 com GPU de 10 núcleos, tela Liquid Retina XDR de 14\". Performance criativa.",
        descricao_curta: "M4 | 14\" XDR | GPU 10-core",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "24GB/512GB Preto Espacial", atributos: { ram: "24GB", storage: "512GB", cor: "Preto Espacial" } },
          { nome: "24GB/512GB Prateado", atributos: { ram: "24GB", storage: "512GB", cor: "Prateado" } },
          { nome: "24GB/1TB Preto Espacial", atributos: { ram: "24GB", storage: "1TB", cor: "Preto Espacial" } },
        ],
      },
      {
        nome: "MacBook Pro M4 Pro 14\"",
        descricao: "Chip M4 Pro, até 48GB RAM, tela Liquid Retina XDR. Para profissionais que exigem o máximo.",
        descricao_curta: "M4 Pro | 14\" XDR | Até 48GB",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "24GB/512GB Preto Espacial", atributos: { ram: "24GB", storage: "512GB", cor: "Preto Espacial" } },
          { nome: "24GB/1TB Preto Espacial", atributos: { ram: "24GB", storage: "1TB", cor: "Preto Espacial" } },
          { nome: "48GB/512GB Preto Espacial", atributos: { ram: "48GB", storage: "512GB", cor: "Preto Espacial" } },
        ],
      },
    ],
  },
  {
    nome: "iPad",
    emoji: "📲",
    produtos: [
      {
        nome: "iPad A16",
        descricao: "Chip A16 Bionic, tela Liquid Retina de 10.9\", USB-C. Versátil e poderoso.",
        descricao_curta: "A16 | 10.9\" | USB-C",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "128GB WiFi Azul", atributos: { storage: "128GB", conectividade: "WiFi", cor: "Azul" } },
          { nome: "128GB WiFi Rosa", atributos: { storage: "128GB", conectividade: "WiFi", cor: "Rosa" } },
          { nome: "256GB WiFi Azul", atributos: { storage: "256GB", conectividade: "WiFi", cor: "Azul" } },
        ],
      },
      {
        nome: "iPad Air M3 11\"",
        descricao: "Chip M3, tela Liquid Retina de 11\". Performance de notebook em formato tablet.",
        descricao_curta: "M3 | 11\" | USB-C",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "128GB WiFi Azul", atributos: { storage: "128GB", conectividade: "WiFi", cor: "Azul" } },
          { nome: "128GB WiFi Estelar", atributos: { storage: "128GB", conectividade: "WiFi", cor: "Estelar" } },
          { nome: "256GB WiFi Azul", atributos: { storage: "256GB", conectividade: "WiFi", cor: "Azul" } },
        ],
      },
      {
        nome: "iPad Air M3 13\"",
        descricao: "Tela ampla de 13\" com chip M3. Ideal para produtividade e criatividade.",
        descricao_curta: "M3 | 13\" | USB-C",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "128GB WiFi Azul", atributos: { storage: "128GB", conectividade: "WiFi", cor: "Azul" } },
          { nome: "256GB WiFi Estelar", atributos: { storage: "256GB", conectividade: "WiFi", cor: "Estelar" } },
        ],
      },
      {
        nome: "iPad Mini",
        descricao: "Compacto com chip A17 Pro, tela de 8.3\". Potência no tamanho de bolso.",
        descricao_curta: "A17 Pro | 8.3\" | USB-C",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "128GB WiFi Azul", atributos: { storage: "128GB", conectividade: "WiFi", cor: "Azul" } },
          { nome: "128GB WiFi Estelar", atributos: { storage: "128GB", conectividade: "WiFi", cor: "Estelar" } },
          { nome: "256GB WiFi Azul", atributos: { storage: "256GB", conectividade: "WiFi", cor: "Azul" } },
        ],
      },
      {
        nome: "iPad Pro M5 11\"",
        descricao: "Chip M5, tela Ultra Retina XDR OLED de 11\". O iPad mais avançado.",
        descricao_curta: "M5 | 11\" OLED XDR",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "256GB WiFi Prateado", atributos: { storage: "256GB", conectividade: "WiFi", cor: "Prateado" } },
          { nome: "256GB WiFi Cinza Espacial", atributos: { storage: "256GB", conectividade: "WiFi", cor: "Cinza Espacial" } },
          { nome: "512GB WiFi Prateado", atributos: { storage: "512GB", conectividade: "WiFi", cor: "Prateado" } },
        ],
      },
    ],
  },
  {
    nome: "Apple Watch",
    emoji: "⌚",
    produtos: [
      {
        nome: "Apple Watch Series 11",
        descricao: "Sensor de saúde avançado, tela Always-On Retina. Seu parceiro de saúde e fitness.",
        descricao_curta: "S11 | Always-On | Saúde avançada",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "GPS 42mm Meia-noite", atributos: { tamanho: "42mm", conectividade: "GPS", cor: "Meia-noite" } },
          { nome: "GPS 42mm Estelar", atributos: { tamanho: "42mm", conectividade: "GPS", cor: "Estelar" } },
          { nome: "GPS 46mm Meia-noite", atributos: { tamanho: "46mm", conectividade: "GPS", cor: "Meia-noite" } },
          { nome: "GPS+CEL 42mm Meia-noite", atributos: { tamanho: "42mm", conectividade: "GPS+Celular", cor: "Meia-noite" } },
          { nome: "GPS+CEL 46mm Meia-noite", atributos: { tamanho: "46mm", conectividade: "GPS+Celular", cor: "Meia-noite" } },
        ],
      },
      {
        nome: "Apple Watch Ultra 3",
        descricao: "O Apple Watch mais resistente. Titânio, GPS de precisão, até 72h de bateria. Para aventureiros.",
        descricao_curta: "Titânio | 49mm | 72h bateria",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "49mm Natural", atributos: { tamanho: "49mm", cor: "Titânio Natural" } },
          { nome: "49mm Black", atributos: { tamanho: "49mm", cor: "Titânio Preto" } },
        ],
      },
      {
        nome: "Apple Watch SE 3",
        descricao: "Essencial com estilo. Chip S9, detecção de queda, SOS de emergência.",
        descricao_curta: "S9 | Acessível | Completo",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "GPS 40mm Meia-noite", atributos: { tamanho: "40mm", conectividade: "GPS", cor: "Meia-noite" } },
          { nome: "GPS 44mm Estelar", atributos: { tamanho: "44mm", conectividade: "GPS", cor: "Estelar" } },
        ],
      },
    ],
  },
  {
    nome: "Mac Mini",
    emoji: "🖥️",
    produtos: [
      {
        nome: "Mac Mini M4",
        descricao: "Compacto e potente com chip M4. Desktop completo no tamanho de um livro.",
        descricao_curta: "M4 | Compacto | Até 32GB RAM",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "16GB/256GB", atributos: { ram: "16GB", storage: "256GB" } },
          { nome: "16GB/512GB", atributos: { ram: "16GB", storage: "512GB" } },
          { nome: "24GB/512GB", atributos: { ram: "24GB", storage: "512GB" } },
          { nome: "32GB/1TB", atributos: { ram: "32GB", storage: "1TB" } },
        ],
      },
      {
        nome: "Mac Mini M4 Pro",
        descricao: "Performance profissional com chip M4 Pro. Até 64GB RAM e 4TB. Para estações de trabalho.",
        descricao_curta: "M4 Pro | Até 64GB RAM",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "24GB/512GB", atributos: { ram: "24GB", storage: "512GB" } },
          { nome: "48GB/512GB", atributos: { ram: "48GB", storage: "512GB" } },
          { nome: "48GB/1TB", atributos: { ram: "48GB", storage: "1TB" } },
        ],
      },
    ],
  },
  {
    nome: "AirPods",
    emoji: "🎧",
    produtos: [
      {
        nome: "AirPods 4",
        descricao: "Design aberto confortável, áudio personalizado, USB-C. Qualidade Apple acessível.",
        descricao_curta: "USB-C | Áudio personalizado",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "AirPods 4", atributos: {} },
        ],
      },
      {
        nome: "AirPods 4 ANC",
        descricao: "Cancelamento ativo de ruído, áudio espacial, USB-C. Imersão total.",
        descricao_curta: "ANC | USB-C | Áudio espacial",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "AirPods 4 ANC", atributos: {} },
        ],
      },
      {
        nome: "AirPods Pro 3",
        descricao: "O melhor ANC da Apple, áudio espacial adaptativo, chip H3. Referência em fones in-ear.",
        descricao_curta: "H3 | ANC Pro | Áudio adaptativo",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "AirPods Pro 3", atributos: {} },
        ],
      },
      {
        nome: "AirPods Max USB-C",
        descricao: "Over-ear premium com áudio computacional, ANC, design em alumínio e aço inox.",
        descricao_curta: "Over-ear | ANC | USB-C",
        tags: ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
        variacoes: [
          { nome: "Meia-noite", atributos: { cor: "Meia-noite" } },
          { nome: "Estelar", atributos: { cor: "Estelar" } },
          { nome: "Azul", atributos: { cor: "Azul" } },
        ],
      },
    ],
  },
  {
    nome: "Acessórios",
    emoji: "🔌",
    produtos: [
      {
        nome: "Apple Pencil Pro",
        descricao: "Precisão profissional com feedback háptico, sensor de aperto e Find My.",
        descricao_curta: "Háptico | Find My",
        tags: ["Novo", "Lacrado", "1 ano garantia"],
        variacoes: [{ nome: "Apple Pencil Pro", atributos: {} }],
      },
      {
        nome: "Apple Pencil USB-C",
        descricao: "Apple Pencil essencial com conexão USB-C. Compatível com iPad.",
        descricao_curta: "USB-C | Essencial",
        tags: ["Novo", "Lacrado", "1 ano garantia"],
        variacoes: [{ nome: "Apple Pencil USB-C", atributos: {} }],
      },
      {
        nome: "Magic Keyboard para iPad Pro 11\"",
        descricao: "Teclado completo com trackpad, retroiluminação e USB-C passthrough.",
        descricao_curta: "Trackpad | Retroiluminado",
        tags: ["Novo", "Lacrado", "1 ano garantia"],
        variacoes: [
          { nome: "Preto", atributos: { cor: "Preto" } },
          { nome: "Branco", atributos: { cor: "Branco" } },
        ],
      },
      {
        nome: "AirTag (4 unidades)",
        descricao: "Rastreador de precisão com Find My. Pacote com 4 unidades.",
        descricao_curta: "Find My | 4 pack",
        tags: ["Novo", "Lacrado"],
        variacoes: [{ nome: "AirTag 4 Pack", atributos: {} }],
      },
    ],
  },
];

// ── MAIN ──

async function main() {
  console.log("🐯 Populando mostruário TigrãoImports...\n");

  // 1. Buscar categorias existentes
  const existing = await apiGet();
  const existingCats = new Map<string, string>();
  for (const c of existing.categorias || []) {
    existingCats.set(c.nome, c.id);
  }
  const existingProds = new Map<string, string>();
  for (const p of existing.produtos || []) {
    existingProds.set(p.nome, p.id);
  }

  let totalProdutos = 0;
  let totalVariacoes = 0;

  for (const cat of CATALOGO) {
    // 2. Criar categoria se não existe
    let catId = existingCats.get(cat.nome);
    if (!catId) {
      console.log(`📁 Criando categoria: ${cat.emoji} ${cat.nome}`);
      const res = await api("create_categoria", { nome: cat.nome, emoji: cat.emoji });
      catId = res.data?.id || res.id;
      if (!catId) { console.error(`  ❌ Falha ao criar categoria ${cat.nome}`); continue; }
    } else {
      console.log(`📁 Categoria existente: ${cat.emoji} ${cat.nome}`);
    }

    // 3. Criar produtos
    for (const prod of cat.produtos) {
      let prodId = existingProds.get(prod.nome);
      if (!prodId) {
        console.log(`  📱 ${prod.nome} (${prod.variacoes.length} variações)`);
        const imgUrl = IMGS[prod.nome] || null;
        const res = await api("create_produto", {
          nome: prod.nome,
          categoria_id: catId,
          descricao: prod.descricao,
          descricao_curta: prod.descricao_curta,
          tags: prod.tags,
          imagem_url: imgUrl,
        });
        prodId = res.data?.id || res.id;
        if (!prodId) { console.error(`    ❌ Falha ao criar produto ${prod.nome}`); continue; }
        totalProdutos++;
      } else {
        console.log(`  📱 ${prod.nome} (já existe, pulando variações)`);
        continue;
      }

      // 4. Criar variações (preço 0 — André ajusta depois)
      for (const v of prod.variacoes) {
        await api("create_variacao", {
          produto_id: prodId,
          nome: v.nome,
          atributos: v.atributos,
          preco: 0,
        });
        totalVariacoes++;
      }
    }
  }

  console.log(`\n✅ Pronto! ${totalProdutos} produtos e ${totalVariacoes} variações criados.`);
  console.log("⚠️ Preços estão em R$ 0 — ajuste manualmente no admin.");
}

main().catch(console.error);
