import type { ProviderMode } from "@/providers/types";

export interface StoredImage {
  url: string;
  width: number;
  height: number;
  bytes: number;
}

export interface ImageSaveOptions {
  /** Plus grand côté en pixels après redimensionnement. */
  maxDimension?: number;
  /** Qualité JPEG (0–1). */
  quality?: number;
}

/** Stockage des photos de chantier. Live prévu : Supabase Storage. */
export interface StorageProvider {
  readonly mode: ProviderMode;
  saveImage(file: Blob, options?: ImageSaveOptions): Promise<StoredImage>;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Lecture de l'image impossible."));
    reader.readAsDataURL(file);
  });
}

/**
 * Stockage local gratuit : l'image est redimensionnée et compressée en JPEG (data-URL)
 * pour tenir dans le quota du navigateur (~150 Ko par photo au lieu de plusieurs Mo).
 */
export class MockStorageProvider implements StorageProvider {
  readonly mode = "mock" as const;

  async saveImage(file: Blob, options: ImageSaveOptions = {}): Promise<StoredImage> {
    const maxDimension = options.maxDimension ?? 1280;
    const quality = options.quality ?? 0.72;

    if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
      const url = await readAsDataUrl(file);
      return { url, width: 0, height: 0, bytes: file.size };
    }

    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      const url = await readAsDataUrl(file);
      return { url, width: bitmap.width, height: bitmap.height, bytes: file.size };
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const url = canvas.toDataURL("image/jpeg", quality);
    return { url, width, height, bytes: Math.round((url.length * 3) / 4) };
  }
}
