import { createTheme } from '@mui/material';
import { CLINIC_THEMES, DEFAULT_APPEARANCE, clinicThemeStyle } from '../../../apps/web/src/features/clinic/appearancePreferences';

// Share the application's palette instead of maintaining a second clinic identity.
export function workspaceTheme(mode: 'light' | 'dark') {
  const tokens = CLINIC_THEMES[DEFAULT_APPEARANCE.palette][mode];
  return createTheme({
    palette: {
      mode, primary: { main: tokens.accent, contrastText: tokens['on-accent'] },
      background: { default: tokens.background, paper: tokens.surface },
      text: { primary: tokens.text, secondary: tokens.muted }, divider: tokens.border,
    },
    typography: {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      h4: { fontSize: '1.75rem', fontWeight: 650, lineHeight: 1.25 },
      h5: { fontSize: '1.25rem', fontWeight: 650, lineHeight: 1.35 },
      h6: { fontSize: '1rem', fontWeight: 650, lineHeight: 1.4 },
      body2: { fontSize: '0.875rem', lineHeight: 1.5 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    shape: { borderRadius: 6 },
    components: {
      MuiCssBaseline: { styleOverrides: { ':root': clinicThemeStyle(DEFAULT_APPEARANCE.palette, mode) } },
      MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { minHeight: 40 } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiTextField: { defaultProps: { size: 'small' } },
      MuiTableCell: { styleOverrides: { root: { padding: '12px 16px', fontSize: 14, fontVariantNumeric: 'tabular-nums' }, head: { fontWeight: 650, color: tokens.muted, background: tokens.background, whiteSpace: 'nowrap' } } },
      MuiListItemIcon: { styleOverrides: { root: { minWidth: 34, color: 'inherit' } } },
      MuiListItemButton: { styleOverrides: { root: { borderRadius: 6, minHeight: 42, '&.Mui-selected': { backgroundColor: tokens.soft, color: tokens.accent }, '&.Mui-selected:hover': { backgroundColor: tokens.soft } } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: 10 } } },
    },
  });
}

export const workspaceStyle = (mode: 'light' | 'dark') => clinicThemeStyle(DEFAULT_APPEARANCE.palette, mode);
