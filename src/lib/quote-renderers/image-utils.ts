import { imageSize } from "image-size";

/** Scales a raster image down to fit within maxWidth x maxHeight, preserving aspect ratio. */
export function scaledDimensions(
  data: Buffer,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  try {
    const { width, height } = imageSize(data);
    if (!width || !height) return { width: maxWidth, height: maxHeight };
    const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
    return {
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio)),
    };
  } catch {
    return { width: maxWidth, height: maxHeight };
  }
}

/** Width/height of a raster image, or null if it can't be read. */
export function imageAspect(data: Buffer): number | null {
  try {
    const { width, height } = imageSize(data);
    if (!width || !height) return null;
    return width / height;
  } catch {
    return null;
  }
}

const EXT_BY_CONTENT_TYPE: Record<string, "png" | "jpg" | "gif" | "bmp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

export function docxImageType(contentType: string): "png" | "jpg" | "gif" | "bmp" {
  return EXT_BY_CONTENT_TYPE[contentType] ?? "png";
}
