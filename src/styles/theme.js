/**
 * Theme constants
 * Centralized styling values for consistent UI
 */

export const COLORS = {
  // Primary colors
  primary: "#667eea",
  primaryDark: "#764ba2",
  primaryGradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  
  // Status colors
  success: "#2ecc71",
  error: "#ff6b6b",
  warning: "#ffc107",
  info: "#667eea",
  
  // Text colors
  text: "#eaeaea",
  textMuted: "#a7a7a7",
  textSecondary: "#8f8f8f",
  
  // Background colors
  bgPrimary: "#0f0f10",
  bgSecondary: "#151516",
  bgTertiary: "#111112",
  bgCard: "rgba(0,0,0,0.25)",
  bgCardLight: "rgba(255,255,255,0.02)",
  
  // Border colors
  border: "#242424",
  borderLight: "rgba(255,255,255,0.08)",
  borderLighter: "rgba(255,255,255,0.04)",
  
  // Status backgrounds (with opacity)
  successBg: "rgba(46, 204, 113, 0.1)",
  errorBg: "rgba(255, 107, 107, 0.1)",
  warningBg: "rgba(255, 193, 7, 0.1)",
  infoBg: "rgba(102, 126, 234, 0.1)",
  
  // Status borders
  successBorder: "rgba(46, 204, 113, 0.3)",
  errorBorder: "rgba(255, 107, 107, 0.3)",
  warningBorder: "rgba(255, 193, 7, 0.3)",
  infoBorder: "rgba(102, 126, 234, 0.3)",
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const BORDER_RADIUS = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 14,
  xxl: 16,
  full: 999,
};

export const FONT_SIZES = {
  xs: 11,
  sm: 12,
  md: 13,
  lg: 14,
  xl: 18,
  xxl: 26,
  xxxl: 50,
};

export const SHADOWS = {
  sm: "0 2px 8px rgba(0,0,0,0.15)",
  md: "0 4px 12px rgba(0,0,0,0.2)",
  lg: "0 8px 30px rgba(0,0,0,0.35)",
  xl: "0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
  primary: "0 4px 15px rgba(102, 126, 234, 0.4)",
  primaryGlow: "0 4px 12px rgba(102, 126, 234, 0.4)",
};

export const TRANSITIONS = {
  fast: "0.15s ease",
  normal: "0.2s ease",
  slow: "0.3s ease",
};

// Common component styles
export const CARD_STYLE = {
  border: `1px solid ${COLORS.borderLight}`,
  borderRadius: BORDER_RADIUS.xl,
  padding: SPACING.lg,
  marginTop: SPACING.md,
  background: COLORS.bgCard,
  boxShadow: SHADOWS.lg,
};

export const INPUT_STYLE = {
  background: COLORS.bgPrimary,
  color: COLORS.text,
  border: `1px solid ${COLORS.border}`,
  borderRadius: BORDER_RADIUS.md,
  padding: `${SPACING.sm + 1}px ${SPACING.md + 1}px`,
  outline: "none",
  fontSize: FONT_SIZES.md,
};

export const BUTTON_STYLE = {
  padding: `${SPACING.md}px ${SPACING.lg}px`,
  borderRadius: BORDER_RADIUS.lg,
  background: COLORS.bgSecondary,
  color: COLORS.text,
  border: `1px solid ${COLORS.borderLight}`,
  cursor: "pointer",
  transition: TRANSITIONS.normal,
  fontSize: FONT_SIZES.lg,
  fontWeight: 500,
};

export const BUTTON_PRIMARY_STYLE = {
  ...BUTTON_STYLE,
  background: COLORS.primaryGradient,
  color: "white",
  border: "none",
  boxShadow: SHADOWS.primary,
};

