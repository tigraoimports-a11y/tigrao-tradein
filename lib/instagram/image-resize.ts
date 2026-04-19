// Redimensiona e comprime imagem no cliente antes do upload.
// Evita estourar o limite do Vercel (4.5 MB por request em funcoes Node).

export interface ResizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0..1 pro JPEG/WEBP
  mimeType?: "image/jpeg" | "image/webp" | "image/png";
}

export async function resizeImageFile(
  file: File,
  options: ResizeOptions = {}
): Promise<File> {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.85,
    mimeType = "image/jpeg",
  } = options;

  // Formatos que sao so passthrough (nao da pra re-encodar pro canvas sem perder transparencia)
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return file;
  }

  // Se ja e pequeno, nao mexe.
  if (file.size < 800 * 1024) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob retornou null"))),
      mimeType,
      quality
    );
  });

  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${baseName}.${ext}`, { type: mimeType });
}
