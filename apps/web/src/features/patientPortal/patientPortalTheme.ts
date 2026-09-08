import { createTheme } from "@mui/material";
import { membershipTheme } from "../clinic/subscriptions/membershipTheme";

export const patientPortalTheme = createTheme(membershipTheme, {
  palette: {
    primary: {
      main: "#24533f",
      dark: "#17392d",
      light: "#dce8dc",
      contrastText: "#ffffff",
    },
    background: { default: "#f7f5ed", paper: "#ffffff" },
    text: { primary: "#18352b", secondary: "#53645c" },
    divider: "#d7ded4",
    action: {
      hover: "#edf2e9",
      selected: "#dfe9dc",
      focus: "#dfe9dc",
    },
  },
  typography: {
    fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
    h1: {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: "2.25rem",
      fontWeight: 400,
      lineHeight: 1.16,
      letterSpacing: "-0.025em",
    },
    h2: {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: "1.65rem",
      fontWeight: 400,
      lineHeight: 1.22,
      letterSpacing: "-0.02em",
    },
    h5: {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: "1.35rem",
      fontWeight: 400,
      lineHeight: 1.28,
    },
    h6: { fontSize: "1.05rem", fontWeight: 650, lineHeight: 1.35 },
    body1: { fontSize: "1rem", lineHeight: 1.55 },
    body2: { fontSize: "0.9rem", lineHeight: 1.5 },
    button: { textTransform: "none", fontWeight: 650 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 44, borderRadius: 8, paddingInline: 16 },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { rounded: { borderRadius: 12 } },
    },
    MuiAccordion: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { boxShadow: "none" } },
    },
    MuiAccordionSummary: {
      styleOverrides: { root: { minHeight: 52 } },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 26,
          padding: "24px",
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: { padding: "16px 24px", flexWrap: "wrap", gap: 8 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { minHeight: 48, textTransform: "none", fontWeight: 650 },
      },
    },
  },
});
