import { expect, it } from "vitest";
import { sharedOffice } from "../src/features/qa/sharedOffice";

const snapshot = {
  contract_version: 1,
  actor_binding: "not_configured",
  receipts: null,
  cadence: null,
  actors: [
    ["josh", "Josh"],
    ["muse", "Muse"],
    ["dot", "dot"],
  ].map(([id, name]) => ({
    id,
    name,
    connection: "not_connected",
    control: "uncontrolled",
    position: null,
  })),
  tasks: [],
  evidence: [],
  events: [],
};
it("accepts only the shared unbound three-actor Office contract", () => {
  expect(sharedOffice(snapshot)).toBe(snapshot);
  for (const invalid of [
    undefined,
    { ...snapshot, contract_version: 2 },
    { ...snapshot, receipts: { muse: "old room ack" } },
    { ...snapshot, cadence: 60 },
    {
      ...snapshot,
      actors: [snapshot.actors[0], snapshot.actors[0], snapshot.actors[2]],
    },
    { ...snapshot, actor_binding: "visitor" },
    { ...snapshot, tasks: null },
  ])
    expect(() => sharedOffice(invalid)).toThrow(/contract unavailable/);
});
