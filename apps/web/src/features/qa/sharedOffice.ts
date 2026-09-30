import type { QaOfficeProps } from "./QaOffice";

/** Read-only version 1. Actor writes/receipts require a separately verified binding. */
export type SharedOffice = Pick<
  QaOfficeProps,
  "tasks" | "evidence" | "events" | "build"
> & {
  contract_version: 1;
  actor_binding: "not_configured";
  actors: {
    id: string;
    name: string;
    connection: "not_connected";
    control: "uncontrolled";
    position: null;
  }[];
  receipts: null;
  cadence: null;
};

export function sharedOffice(input: unknown): SharedOffice {
  const item = input as SharedOffice | undefined;
  const names = { josh: "Josh", muse: "Muse", dot: "dot" };
  if (
    !item ||
    item.contract_version !== 1 ||
    item.actor_binding !== "not_configured" ||
    item.receipts !== null ||
    item.cadence !== null ||
    !Array.isArray(item.actors) ||
    item.actors.length !== 3 ||
    !Object.entries(names).every(
      ([id, name]) =>
        item.actors.filter(
          (actor) =>
            actor?.id === id &&
            actor.name === name &&
            actor.connection === "not_connected" &&
            actor.control === "uncontrolled" &&
            actor.position === null,
        ).length === 1,
    ) ||
    ![item.tasks, item.evidence, item.events].every(Array.isArray)
  ) {
    throw new Error(
      "Shared Office contract unavailable. Actor control remains unconfigured.",
    );
  }
  return item;
}
