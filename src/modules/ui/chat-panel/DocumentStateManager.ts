/**
 * DocumentStateManager - Manages document reference state with global scope
 * Documents are stored globally and shared between sidebar and floating views
 */

import type { DocumentReference } from "../../../types/chat";

// Global document state (shared across all views)
let globalDocuments: DocumentReference[] = [];

// Document change listeners
const listeners = new Set<() => void>();

/**
 * Get all current documents
 */
export function getDocuments(): DocumentReference[] {
  return [...globalDocuments];
}

/**
 * Add documents to the reference list
 * Replaces existing documents (single drop operation)
 */
export function setDocuments(documents: DocumentReference[]): void {
  globalDocuments = [...documents];
  notifyListeners();
}

/**
 * Add a single document to the reference list
 * Does not add if document with same ID already exists
 */
export function addDocument(document: DocumentReference): boolean {
  const exists = globalDocuments.some((doc) => doc.id === document.id);
  if (exists) {
    return false;
  }
  globalDocuments.push(document);
  notifyListeners();
  return true;
}

/**
 * Add multiple documents to the reference list
 * Skips documents that already exist
 */
export function addDocuments(documents: DocumentReference[]): number {
  let addedCount = 0;
  for (const doc of documents) {
    const exists = globalDocuments.some((existing) => existing.id === doc.id);
    if (!exists) {
      globalDocuments.push(doc);
      addedCount++;
    }
  }
  if (addedCount > 0) {
    notifyListeners();
  }
  return addedCount;
}

/**
 * Remove a document from the reference list
 */
export function removeDocument(documentId: number): void {
  const initialLength = globalDocuments.length;
  globalDocuments = globalDocuments.filter((doc) => doc.id !== documentId);
  if (globalDocuments.length !== initialLength) {
    notifyListeners();
  }
}

/**
 * Clear all documents from the reference list
 */
export function clearDocuments(): void {
  if (globalDocuments.length > 0) {
    globalDocuments = [];
    notifyListeners();
  }
}

/**
 * Check if there are any documents in the reference list
 */
export function hasDocuments(): boolean {
  return globalDocuments.length > 0;
}

/**
 * Get document IDs
 */
export function getDocumentIds(): number[] {
  return globalDocuments.map((doc) => doc.id);
}

/**
 * Get document names
 */
export function getDocumentNames(): string[] {
  return globalDocuments.map((doc) => doc.title);
}

/**
 * Subscribe to document state changes
 */
export function onDocumentsChange(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Notify all listeners of state change
 */
function notifyListeners(): void {
  listeners.forEach((callback) => {
    try {
      callback();
    } catch (error) {
      ztoolkit.log("[DocumentStateManager] Listener error:", error);
    }
  });
}

/**
 * Format document display name with creators and year
 */
export function formatDocumentDisplayName(doc: DocumentReference): string {
  let name = doc.title;
  if (doc.creators || doc.year) {
    const parts: string[] = [];
    if (doc.creators) {
      parts.push(doc.creators);
    }
    if (doc.year) {
      parts.push(`(${doc.year})`);
    }
    name = `${parts.join(" ")} - ${name}`;
  }
  return name;
}

/**
 * Build document context string for AI message
 */
export function buildDocumentContext(documents: DocumentReference[]): string {
  if (documents.length === 0) {
    return "";
  }

  const docList = documents
    .map((doc, index) => {
      const parts: string[] = [`${index + 1}. "${doc.title}"`];
      if (doc.creators) {
        parts.push(`by ${doc.creators}`);
      }
      if (doc.year) {
        parts.push(`(${doc.year})`);
      }
      return parts.join(" ");
    })
    .join("\n");

  return `[Referenced Documents]:\n${docList}\n\n`;
}
