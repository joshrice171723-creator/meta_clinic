import { createTheme } from "@mui/material";

export const membershipTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#244e40" },
    background: { default: "#f7f8f2", paper: "#ffffff" },
    text: { primary: "#203b32", secondary: "#55645c" },
    divider: "#dce2d8",
  },
  typography: {
    fontFamily: '"Segoe UI", Arial, sans-serif',
    h2: {
      fontFamily: "Georgia, serif",
      fontSize: "2.3rem",
      fontWeight: 400,
      letterSpacing: "-0.035em",
    },
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 44, borderRadius: 8 } },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: { fontFamily: "Georgia, serif", fontSize: 28, padding: "24px" },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: { padding: "16px 24px", flexWrap: "wrap", gap: 8 },
      },
    },
    MuiTab: {
      styleOverrides: { root: { textTransform: "none", fontWeight: 600 } },
    },
  },
});
