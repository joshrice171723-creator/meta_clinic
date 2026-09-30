import type { QaOfficeProps } from "./QaOffice";
import type { MuseReceipt } from "./museCheckIn";
import type { RoomMessage } from "./QaAgentRoom";

export type OfficeActor = {
  id: "josh" | "muse" | "dot" | "codex";
  name: string;
  control: "bound" | "uncontrolled";
  connection: "check_in_recorded" | "not_connected";
  position: { x: number; y: number } | null;
  revision: number;
  principal_id: string | null;
  receipt: MuseReceipt | null;
};
export type OfficeActorState = {
  contract_version: 1;
  actor_binding: "server_bound" | "not_configured";
  controlled_actor: OfficeActor["id"] | null;
  actors: OfficeActor[];
  muse_cadence_ms: number | null;
  can_enroll?: boolean;
};

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
  actor_state?: OfficeActorState;
  messages?: RoomMessage[];
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
  if (item.actor_state) {
    const state = item.actor_state;
    if (
      state.contract_version !== 1 ||
      !["server_bound", "not_configured"].includes(state.actor_binding) ||
      ![null, "josh", "muse", "dot", "codex"].includes(
        state.controlled_actor,
      ) ||
      (state.can_enroll !== undefined &&
        typeof state.can_enroll !== "boolean") ||
      !Array.isArray(state.actors) ||
      ![3, 4].includes(state.actors.length) ||
      !Object.entries(
        state.actors.length === 4 ? { ...names, codex: "Codex" } : names,
      ).every(
        ([id, name]) =>
          state.actors.filter(
            (actor) => actor?.id === id && actor?.name === name,
          ).length === 1,
      ) ||
      (state.controlled_actor !== null &&
        (state.actor_binding !== "server_bound" ||
          !state.actors.some(
            (actor) =>
              actor?.id === state.controlled_actor &&
              actor?.control === "bound",
          ))) ||
      (state.muse_cadence_ms !== null &&
        (!Number.isFinite(state.muse_cadence_ms) ||
          state.muse_cadence_ms <= 0)) ||
      state.actors.some(
        (actor) =>
          !actor ||
          !["bound", "uncontrolled"].includes(actor.control) ||
          !["check_in_recorded", "not_connected"].includes(actor.connection) ||
          !Number.isInteger(actor.revision) ||
          actor.revision < 0 ||
          (actor.position !== null &&
            (!actor.position ||
              !Number.isInteger(actor.position.x) ||
              !Number.isInteger(actor.position.y) ||
              actor.position.x < 1 ||
              actor.position.x > 9 ||
              actor.position.y < 1 ||
              actor.position.y > 7)) ||
          (actor.receipt !== null &&
            (!actor.receipt ||
              actor.receipt.authenticatedActorId !== actor.principal_id ||
              !actor.receipt.id ||
              !Number.isFinite(actor.receipt.receivedAtMs) ||
              actor.receipt.receivedAtMs < 0)),
      )
    )
      throw new Error(
        "Office actor state unavailable. Shared controls are paused.",
      );
  }
  return item;
}
