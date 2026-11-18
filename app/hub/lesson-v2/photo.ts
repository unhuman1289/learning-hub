"use client";

import { stripImageMetadata } from "../../../lib/uploads/strip-metadata";

/** Longest edge after resizing; the server refuses anything larger. */
const MAX_EDGE = 2400;

/**
 * Turns a camera photo into a JPEG of at most 2400 px. Drawing it on a canvas and encoding again
 * and removes metadata (camera, time, GPS); `imageOrientation` keeps phone photos the right way up.
 */
export async function preparePhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw Error("Trình duyệt không xử lý được ảnh.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob) {
      const clean = stripImageMetadata(new Uint8Array(await blob.arrayBuffer()), "image/jpeg");
      if (!clean) throw Error("Trình duyệt không xử lý được ảnh.");
      if (clean.length <= 2_900_000) return new Blob([new Uint8Array(clean)], { type: "image/jpeg" });
    }
  }
  throw Error("Ảnh quá lớn sau khi thu nhỏ. Thử chụp lại gần hơn.");
}

export type UploadedPhoto = { id: string; width: number; height: number; expiresAt: string };

/** Prepares and uploads one photo; nothing is shown as attached before the server answers. */
export async function uploadPhoto(file: Blob): Promise<UploadedPhoto> {
  const body = await preparePhoto(file);
  const response = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body });
  const result = await response.json().catch(() => null) as { attachment?: UploadedPhoto; error?: string } | null;
  if (!response.ok || !result?.attachment) throw Error(result?.error || "Chưa tải được ảnh lên.");
  return result.attachment;
}
