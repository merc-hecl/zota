/**
 * DataTransferParser - Parse Zotero drag data for annotation images
 *
 * This module handles parsing of DataTransfer objects when users drag
 * Zotero annotations (especially image annotations) into the chat input.
 */

export interface ParsedAnnotationImage {
  type: "zotero/annotation-image";
  image: string;
  libraryID: number;
  key: string;
  mimeType: string;
}

export interface ParsedText {
  type: "text/plain";
  text: string;
}

export interface ParsedImageFile {
  type: "image-file";
  file: File;
}

export type ParsedDragData =
  | ParsedAnnotationImage
  | ParsedText
  | ParsedImageFile
  | { type: "unknown" };

/**
 * Parse DataTransfer object from drag events
 * Handles Zotero annotation images, text, and image files
 */
export async function parseDataTransfer(
  dataTransfer: DataTransfer,
): Promise<ParsedDragData> {
  const { types } = dataTransfer;

  if (types.includes("zotero/annotation")) {
    return parseZoteroAnnotation(dataTransfer);
  }

  if (types.includes("text/plain")) {
    return {
      type: "text/plain",
      text: dataTransfer.getData("text/plain"),
    };
  }

  if (dataTransfer.files && dataTransfer.files.length > 0) {
    const file = dataTransfer.files[0];
    if (file.type.startsWith("image/")) {
      return {
        type: "image-file",
        file,
      };
    }
  }

  return { type: "unknown" };
}

/**
 * Parse Zotero annotation from DataTransfer
 * Only image annotations are supported for now
 */
async function parseZoteroAnnotation(
  dataTransfer: DataTransfer,
): Promise<ParsedDragData> {
  try {
    const annotationData = JSON.parse(
      dataTransfer.getData("zotero/annotation"),
    );

    if (!Array.isArray(annotationData) || annotationData.length === 0) {
      return {
        type: "text/plain",
        text: "Invalid annotation data",
      };
    }

    const {
      attachmentItemID,
      id: key,
      type: annotationType,
      image,
    } = annotationData[0];

    if (annotationType !== "image") {
      return {
        type: "text/plain",
        text: "Only image annotations are supported. Please use Zotero's area annotation tool to select an image region.",
      };
    }

    if (!image) {
      return {
        type: "text/plain",
        text: "No image data found in annotation",
      };
    }

    const attachmentItem = await Zotero.Items.getAsync(attachmentItemID);
    const libraryID = attachmentItem?.libraryID ?? 0;

    // Parse the image data - Zotero may return it as a data URL or raw base64
    let base64Data = image;
    let mimeType = "image/png";

    // Check if image is already a data URL (data:image/xxx;base64,...)
    const dataUrlMatch = image.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
      mimeType = dataUrlMatch[1];
      base64Data = dataUrlMatch[2];
    }

    ztoolkit.log(
      "[DataTransferParser] Parsed annotation image, mimeType:",
      mimeType,
      "base64 length:",
      base64Data.length,
    );

    return {
      type: "zotero/annotation-image",
      image: base64Data,
      libraryID,
      key,
      mimeType,
    };
  } catch (error) {
    ztoolkit.log("[DataTransferParser] Error parsing annotation:", error);
    return {
      type: "text/plain",
      text: "Failed to parse annotation data",
    };
  }
}

/**
 * Check if DataTransfer contains Zotero annotation
 */
export function hasZoteroAnnotation(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes("zotero/annotation");
}

/**
 * Check if DataTransfer contains any supported image type
 */
export function hasSupportedImageType(dataTransfer: DataTransfer): boolean {
  if (dataTransfer.types.includes("zotero/annotation")) {
    return true;
  }

  if (dataTransfer.files && dataTransfer.files.length > 0) {
    const file = dataTransfer.files[0];
    return file.type.startsWith("image/");
  }

  return false;
}
