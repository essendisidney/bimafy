/**
 * Shrink a phone photo before upload: longest side 1600px, JPEG ~80%. A 4MB
 * camera picture becomes ~300KB, which matters on a slow or metered line.
 * Falls back to the original file when the browser can't decode it.
 */
export async function shrinkPhoto(file: File, maxSide = 1600, quality = 0.8): Promise<{ blob: Blob; ext: "jpg" | "png" | "webp" }> {
  const original = { blob: file as Blob, ext: (file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg") as "jpg" | "png" | "webp" };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob && blob.size < file.size ? { blob, ext: "jpg" } : original;
  } catch {
    return original;
  }
}
