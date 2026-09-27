import { createTheme } from "@mui/material";
import { membershipTheme } from "../clinic/subscriptions/membershipTheme";

export const publicPageAccents = [
  { value: "#155e75", label: "Ocean blue" },
  { value: "#6d28d9", label: "Violet" },
  { value: "#166534", label: "Forest green" },
];

const themes = new Map(
  publicPageAccents.map(({ value }) => [
    value,
    createTheme({
      ...membershipTheme,
      palette: {
        ...membershipTheme.palette,
        primary: { main: value, contrastText: "#ffffff" },
      },
    }),
  ]),
);

export function publicPageTheme(accent?: string | null) {
  return themes.get(accent ?? "") ?? membershipTheme;
}
