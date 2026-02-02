/**
 * Global UI Color Constants
 *
 * Centralized color definitions for consistent styling across the plugin.
 * Use these instead of hardcoded color values.
 */

// ============================================
// Semantic Colors - Minimal Neutral Theme
// ============================================

export const colors = {
  // Primary accent colors - Minimal neutral gray palette
  primary: "#6b7280",
  primaryDark: "#4b5563",
  primaryLight: "#f3f4f6",
  primaryBorder: "#d1d5db",

  // Status colors
  success: "#2e7d32",
  successLight: "#4caf50",
  error: "#c62828",
  errorLight: "#ffebee",
  errorBorder: "#f44336",

  // Interactive colors
  link: "#6b7280",
  linkHover: "#4b5563",
  selection: "#6b7280",
  selectionText: "#ffffff",

  // Neutral backgrounds
  bgLight: "#f0f4f8",
  bgLighter: "#f7f9fb",
  bgHover: "#e1e8f0",
  bgCode: "#f4f4f4",
  bgCodeDark: "#1e1e1e",

  // Borders
  border: "#d0dce8",
  borderLight: "#e8eef4",
  borderDark: "#b0c4d8",

  // Text colors
  textPrimary: "#1a202c",
  textSecondary: "#4a5568",
  textMuted: "#718096",
  textLight: "#a0aec0",
  textPlaceholder: "#a0aec0",

  // Input/form colors
  inputBorder: "#cbd5e0",
  inputBg: "#ffffff",

  // Badge colors
  badgeBg: "#f3f4f6",
  badgeText: "#6b7280",

  // User message bubble - Subtle neutral gray
  userGradient: "#e5e7eb",
} as const;

// ============================================
// Preference Panel Specific
// ============================================

export const prefColors = {
  // Provider list
  providerItemHover: colors.bgHover,
  providerItemSelected: colors.selection,
  providerItemSelectedText: colors.selectionText,
  statusDot: colors.successLight,

  // Test results
  testSuccess: colors.success,
  testError: colors.error,

  // User status
  userLoggedIn: colors.success,
  userLoggedOut: colors.textMuted,

  // Custom badge
  customBadgeBg: colors.badgeBg,
  customBadgeText: colors.badgeText,
} as const;

// ============================================
// Chat Panel Additional Colors
// ============================================

export const chatColors = {
  // User message
  userBubble: colors.userGradient,
  userBubbleText: "#1f2937",

  // Error message
  errorBubbleBg: colors.errorLight,
  errorBubbleBorder: colors.errorBorder,
  errorBubbleText: colors.error,

  // History dropdown
  historyAccent: colors.primary,
  loadMoreBg: colors.primaryLight,
  emptyText: colors.textPlaceholder,

  // Attachment tags
  attachmentBg: colors.inputBg,
  attachmentBorder: colors.primaryBorder,
  attachmentText: colors.textSecondary,

  // Markdown elements
  markdownLink: colors.link,
  codeBlockBg: colors.bgCode,
  codeInlineBg: "#f0f0f0",
  tableBg: colors.bgLight,
  tableBorder: colors.borderDark,
  blockquoteBorder: colors.inputBorder,
  blockquoteText: colors.textMuted,
  hrBorder: colors.borderDark,
} as const;

// Type exports for TypeScript support
export type Colors = typeof colors;
export type PrefColors = typeof prefColors;
export type ChatColors = typeof chatColors;
