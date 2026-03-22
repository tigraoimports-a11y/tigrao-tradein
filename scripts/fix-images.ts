/**
 * Fix product images in mostruario
 * Usage: ADMIN_PW="..." npx tsx scripts/fix-images.ts
 */

const BASE_URL = "https://tigrao-tradein.vercel.app";
const ADMIN_PW = process.env.ADMIN_PW;

if (!ADMIN_PW) {
  console.error("Missing ADMIN_PW env var");
  process.exit(1);
}

// Image mapping: product name substring -> image URL
// Keys sorted by specificity (longer/more specific first in the sorted array)
const IMAGE_MAP: Record<string, string> = {
  // iPhones
  "iPhone 17 Pro Max": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-17-pro-max-model-unselect-gallery-1-202504?wid=400",
  "iPhone 17 Pro": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-17-pro-model-unselect-gallery-1-202504?wid=400",
  "iPhone 17": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-17-model-unselect-gallery-1-202504?wid=400",
  "iPhone 16 Pro Max": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-16-pro-model-unselect-gallery-1-202409?wid=400",
  "iPhone 16 Pro": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-16-pro-model-unselect-gallery-1-202409?wid=400",
  "iPhone 16 Plus": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-16-model-unselect-gallery-1-202409?wid=400",
  "iPhone 16": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-16-model-unselect-gallery-1-202409?wid=400",
  "iPhone 15 Pro Max": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-pro-model-unselect-gallery-1-202309?wid=400",
  "iPhone 15 Pro": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-pro-model-unselect-gallery-1-202309?wid=400",
  "iPhone 15": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-model-unselect-gallery-1-202309?wid=400",
  "iPhone 14": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-model-unselect-gallery-1-202309?wid=400",
  "iPhone 13": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-model-unselect-gallery-1-202309?wid=400",

  // MacBooks - include M4 variants to match actual product names
  "MacBook Air M4 13": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mba-m4-midnight-select-202501?wid=400",
  "MacBook Air M4 15": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mba-m4-15-midnight-select-202501?wid=400",
  "MacBook Air 13": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mba-m4-midnight-select-202501?wid=400",
  "MacBook Air 15": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mba-m4-15-midnight-select-202501?wid=400",
  "MacBook Air": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mba-m4-midnight-select-202501?wid=400",
  "MacBook Pro M4 Pro": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mbp-14-m4-pro-spaceblack-select-202410?wid=400",
  "MacBook Pro M4 14": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mbp-14-m4-pro-spaceblack-select-202410?wid=400",
  "MacBook Pro M4": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mbp-14-m4-pro-spaceblack-select-202410?wid=400",
  "MacBook Pro 14": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mbp-14-m4-pro-spaceblack-select-202410?wid=400",
  "MacBook Pro": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mbp-14-m4-pro-spaceblack-select-202410?wid=400",

  // iPads - include M3 variants
  "iPad Air M3 11": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/ipad-air-m3-select-202503?wid=400",
  "iPad Air M3 13": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/ipad-air-m3-13-select-202503?wid=400",
  "iPad Air 11": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/ipad-air-m3-select-202503?wid=400",
  "iPad Air 13": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/ipad-air-m3-13-select-202503?wid=400",
  "iPad Air": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/ipad-air-m3-select-202503?wid=400",
  "iPad Pro M5 11": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/ipad-pro-model-select-gallery-1-202410?wid=400",
  "iPad Pro 11": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/ipad-pro-model-select-gallery-1-202410?wid=400",
  "iPad Pro": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/ipad-pro-model-select-gallery-1-202410?wid=400",
  "iPad A16": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/ipad-11th-gen-select-202410?wid=400",
  "iPad Mini": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/ipad-mini-select-202410?wid=400",

  // Apple Watch
  "Apple Watch Series 11": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/watch-s11-select-202509?wid=400",
  "Watch Series 11": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/watch-s11-select-202509?wid=400",
  "Apple Watch Ultra 3": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/watch-ultra-3-select-202509?wid=400",
  "Watch Ultra 3": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/watch-ultra-3-select-202509?wid=400",
  "Watch Ultra": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/watch-ultra-3-select-202509?wid=400",
  "Apple Watch SE 3": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/watch-se-3-select-202509?wid=400",
  "Watch SE 3": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/watch-se-3-select-202509?wid=400",
  "Apple Watch SE": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/watch-se-3-select-202509?wid=400",

  // Mac Mini
  "Mac Mini M4 Pro": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mac-mini-select-202411?wid=400",
  "Mac Mini M4": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mac-mini-select-202411?wid=400",
  "Mac Mini": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/mac-mini-select-202411?wid=400",

  // AirPods
  "AirPods Pro 3": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airpods-pro-3-select-202509?wid=400",
  "AirPods Pro": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airpods-pro-3-select-202509?wid=400",
  "AirPods 4 ANC": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airpods-4-anc-select-202409?wid=400",
  "AirPods 4": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airpods-4-select-202409?wid=400",
  "AirPods Max": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airpods-max-select-202409-midnight?wid=400",

  // Accessories
  "Apple Pencil Pro": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/apple-pencil-pro-select-202405?wid=400",
  "Apple Pencil USB-C": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/apple-pencil-usbc-select-202310?wid=400",
  "Apple Pencil": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/apple-pencil-pro-select-202405?wid=400",
  "Magic Keyboard": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/magic-keyboard-ipad-pro-11-select-202410?wid=400",
  "AirTag": "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/airtag-4pack-select-202104?wid=400",
};

// Keys sorted by length descending so more specific names match first
const SORTED_KEYS = Object.keys(IMAGE_MAP).sort((a, b) => b.length - a.length);

function findImageUrl(productName: string): string | null {
  for (const key of SORTED_KEYS) {
    if (productName.includes(key)) {
      return IMAGE_MAP[key];
    }
  }
  return null;
}

interface Product {
  id: string;
  nome: string;
  imagem_url: string | null;
}

async function main() {
  console.log("Fetching products from mostruario API...\n");

  const res = await fetch(`${BASE_URL}/api/admin/mostruario`, {
    headers: { "x-admin-password": ADMIN_PW! },
  });

  if (!res.ok) {
    console.error(`GET failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const data = await res.json();
  const produtos: Product[] = data.produtos ?? [];

  console.log(`Found ${produtos.length} products.\n`);

  let updated = 0;
  let skipped = 0;
  let noMatch = 0;

  for (const p of produtos) {
    const newUrl = findImageUrl(p.nome);
    if (!newUrl) {
      console.log(`  [NO MATCH] ${p.nome}`);
      noMatch++;
      continue;
    }

    if (p.imagem_url === newUrl) {
      console.log(`  [SKIP]     ${p.nome} (already correct)`);
      skipped++;
      continue;
    }

    const patchRes = await fetch(`${BASE_URL}/api/admin/mostruario`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": ADMIN_PW!,
      },
      body: JSON.stringify({
        action: "update_produto",
        id: p.id,
        imagem_url: newUrl,
      }),
    });

    if (patchRes.ok) {
      console.log(`  [UPDATED]  ${p.nome}`);
      updated++;
    } else {
      const err = await patchRes.text();
      console.error(`  [ERROR]    ${p.nome}: ${patchRes.status} — ${err}`);
    }
  }

  console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}, No match: ${noMatch}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
