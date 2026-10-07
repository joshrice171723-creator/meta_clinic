// Serialize changes so two open views cannot overwrite each other's saved tasks.
let queue = Promise.resolve();

async function handle(message) {
  const { timer = { active: null, sessions: [] } } = await chrome.storage.local.get("timer");
  const now = Date.now();
  const active = timer.active;
  switch (message.type) {
    case "read":
      return timer;
    case "start": {
      if (active) throw new Error("Save your current task before starting another.");
      const name = typeof message.name === "string" ? message.name.trim() : "";
      if (!name || name.length > 120) throw new Error("Enter a task label of 1–120 characters.");
      timer.active = { id: crypto.randomUUID(), name, createdAt: now, startedAt: now, elapsedMs: 0 };
      break;
    }
    case "pause":
      if (!active) throw new Error("No task is active.");
      if (active.startedAt !== null) {
        active.elapsedMs += Math.max(0, now - active.startedAt);
        active.startedAt = null;
      }
      break;
    case "resume":
      if (!active) throw new Error("No task is active.");
      if (active.startedAt === null) active.startedAt = now;
      break;
    case "finish": {
      if (!active || active.startedAt !== null) throw new Error("Pause the task before saving.");
      const durationMs = message.minutes === null ? active.elapsedMs : message.minutes * 60000;
      if (message.minutes !== null && (typeof message.minutes !== "number" || !Number.isFinite(message.minutes))) {
        throw new Error("Enter a valid number of minutes.");
      }
      if (!Number.isSafeInteger(Math.round(durationMs)) || durationMs < 0) throw new Error("Minutes must be zero or greater.");
      timer.sessions.unshift({
        id: active.id, name: active.name, createdAt: active.createdAt, finishedAt: now,
        durationMs: Math.round(durationMs), trackedMs: active.elapsedMs
      });
      timer.active = null;
      break;
    }
    default:
      throw new Error("Unknown timer action.");
  }
  // Save the whole transition atomically; failed storage writes leave the old record intact.
  await chrome.storage.local.set({ timer });
  await chrome.action.setBadgeBackgroundColor({ color: "#205c4b" }).catch(() => {});
  await chrome.action.setBadgeText({ text: timer.active ? (timer.active.startedAt === null ? "Ⅱ" : "ON") : "" }).catch(() => {});
  return timer;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  const job = queue.then(() => handle(message));
  queue = job.catch(() => {});
  job.then(timer => respond({ timer }), error => respond({ error: error.message }));
  return true;
});
