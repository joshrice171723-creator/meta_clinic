import { createContext, useContext } from "react";
import { api } from "../../api/client";

export type OfficeRequest = typeof api;

/** Office views default to the existing browser session. MCP owns its own transport. */
export const OfficeTransport = createContext<OfficeRequest>(api);
export const OfficeLinks = createContext<(path: string) => string>(
  (path) => path,
);

export function useOfficeRequest() {
  return useContext(OfficeTransport);
}

export function useOfficeLink() {
  return useContext(OfficeLinks);
}
