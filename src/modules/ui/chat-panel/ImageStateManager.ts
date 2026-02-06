/**
 * ImageStateManager - Manages image input state with document-level isolation
 * Each document has its own independent image state
 */

import type { ChatMessage } from "../../../types/chat";

// Image data structure
export interface ImageData {
  id: string;
  base64: string;
  mimeType: string;
  name?: string;
}

// Document-scoped image state
interface DocumentImageState {
  images: ImageData[];
}

// Map to store image states per document (itemId -> state)
const documentImageStates = new Map<number, DocumentImageState>();

// Global image change listeners
const listeners = new Set<(itemId: number) => void>();

/**
 * Get or create image state for a document
 */
function getOrCreateState(itemId: number): DocumentImageState {
  if (!documentImageStates.has(itemId)) {
    documentImageStates.set(itemId, { images: [] });
  }
  return documentImageStates.get(itemId)!;
}

/**
 * Generate unique image ID
 */
function generateImageId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Convert File to base64 string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Get MIME type from base64 data or file
 */
export function getMimeType(file: File): string {
  return file.type || "image/png";
}

/**
 * Add an image to a document's state
 */
export async function addImage(itemId: number, file: File): Promise<ImageData> {
  const state = getOrCreateState(itemId);
  const base64 = await fileToBase64(file);
  const mimeType = getMimeType(file);

  const imageData: ImageData = {
    id: generateImageId(),
    base64,
    mimeType,
    name: file.name,
  };

  state.images.push(imageData);
  notifyListeners(itemId);
  return imageData;
}

/**
 * Add an image from clipboard data
 */
export async function addImageFromClipboard(
  itemId: number,
  clipboardItem: ClipboardItem,
): Promise<ImageData | null> {
  const imageTypes = clipboardItem.types.filter((type) =>
    type.startsWith("image/"),
  );

  if (imageTypes.length === 0) {
    return null;
  }

  const blob = await clipboardItem.getType(imageTypes[0]);
  const file = new File([blob], `pasted-image-${Date.now()}.png`, {
    type: imageTypes[0],
  });

  return addImage(itemId, file);
}

/**
 * Remove an image from a document's state
 */
export function removeImage(itemId: number, imageId: string): void {
  const state = documentImageStates.get(itemId);
  if (!state) return;
  state.images = state.images.filter((img) => img.id !== imageId);
  notifyListeners(itemId);
}

/**
 * Get all images for a document
 */
export function getImages(itemId: number): ImageData[] {
  const state = documentImageStates.get(itemId);
  return state?.images || [];
}

/**
 * Clear all images for a document
 */
export function clearImages(itemId: number): void {
  documentImageStates.set(itemId, { images: [] });
  notifyListeners(itemId);
}

/**
 * Check if a document has any images
 */
export function hasImages(itemId: number): boolean {
  const state = documentImageStates.get(itemId);
  return (state?.images.length || 0) > 0;
}

/**
 * Subscribe to image state changes
 */
export function onImagesChange(callback: (itemId: number) => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Notify all listeners of state change
 */
function notifyListeners(itemId: number): void {
  listeners.forEach((callback) => callback(itemId));
}

/**
 * Convert images to OpenAI message content format
 */
export function imagesToMessageContent(
  images: ImageData[],
): Array<{ type: "image_url"; image_url: { url: string } }> {
  return images.map((img) => ({
    type: "image_url" as const,
    image_url: {
      url: `data:${img.mimeType};base64,${img.base64}`,
    },
  }));
}

/**
 * Build message content with text and images for API
 */
export function buildMessageContent(
  text: string,
  images: ImageData[],
):
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > {
  if (images.length === 0) {
    return text;
  }

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [];

  if (text.trim()) {
    content.push({ type: "text", text });
  }

  content.push(...imagesToMessageContent(images));

  return content;
}

/**
 * Check if DataTransfer contains images (from paste event)
 */
export function dataTransferHasImages(dataTransfer: DataTransfer): boolean {
  const items = dataTransfer.items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.startsWith("image/")) {
      return true;
    }
  }
  return false;
}

/**
 * Extract images from DataTransfer (paste event)
 */
export async function extractImagesFromDataTransfer(
  itemId: number,
  dataTransfer: DataTransfer,
): Promise<ImageData[]> {
  const images: ImageData[] = [];
  const items = dataTransfer.items;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (blob) {
        const image = await addImage(itemId, blob);
        images.push(image);
      }
    }
  }

  // Also check files (for drag and drop)
  const files = dataTransfer.files;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.type.startsWith("image/")) {
      const image = await addImage(itemId, file);
      images.push(image);
    }
  }

  return images;
}

/**
 * Add images to a chat message
 */
export function addImagesToMessage(
  message: ChatMessage,
  images: ImageData[],
): ChatMessage {
  if (images.length === 0) {
    return message;
  }

  return {
    ...message,
    images: images.map((img) => ({
      id: img.id,
      base64: img.base64,
      mimeType: img.mimeType,
    })),
  };
}
