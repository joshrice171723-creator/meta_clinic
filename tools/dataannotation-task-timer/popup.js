const $ = id => document.getElementById(id);
let timer = { active: null, sessions: [] };
let busy = true;
let minutesEdited = false;

function elapsed(active) {
  return active ? active.elapsedMs + (active.startedAt === null ? 0 : Math.max(0, Date.now() - active.startedAt)) : 0;
}

function clock(ms) {
  const seconds = Math.floor(ms / 1000);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, "0")).join(":");
}

function tick() {
  const ms = elapsed(timer.active);
  $("elapsed").textContent = clock(ms);
  $("exact-minutes").textContent = `${(ms / 60000).toFixed(2)} minutes`;
}

function render() {
  const active = timer.active;
  const running = active && active.startedAt !== null;
  $("task-name").disabled = busy || !!active;
  if (active) $("task-name").value = active.name;
  $("start").textContent = active ? "Resume" : "Start task";
  $("start").disabled = busy || !!running;
  $("pause").disabled = busy || !running;
  $("finish").disabled = busy;
  $("minutes").disabled = busy;
  $("save-panel").hidden = !active || !!running;
  if (active && !running && !minutesEdited) $("minutes").value = (active.elapsedMs / 60000).toFixed(4);
  $("status").textContent = active ? (running ? "● Working" : "Paused · ready to save or resume") : "Ready when you are";
  $("export").disabled = busy || !timer.sessions.length;
  $("empty").hidden = !!timer.sessions.length;
  const total = timer.sessions.reduce((sum, session) => sum + session.durationMs, 0);
  $("total").textContent = `${Math.floor(total / 3600000)}h ${String(Math.floor(total / 60000) % 60).padStart(2, "0")}m`;
  $("total").title = `${(total / 60000).toFixed(2)} minutes saved`;
  $("history").replaceChildren(...timer.sessions.map(session => {
    const row = document.createElement("li");
    const details = document.createElement("div");
    details.className = "task-details";
    const title = document.createElement("span");
    title.className = "task-title";
    title.textContent = session.name;
    const date = document.createElement("span");
    date.className = "task-date";
    date.textContent = new Date(session.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const duration = document.createElement("span");
    duration.className = "task-duration";
    duration.textContent = `${(session.durationMs / 60000).toFixed(2)} min`;
    details.append(title, date);
    row.append(details, duration);
    return row;
  }));
  tick();
}

async function request(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response || response.error) throw new Error(response?.error || "Timer unavailable. Reopen the extension and try again.");
  return response.timer;
}

async function act(message) {
  if (busy) return;
  busy = true;
  $("error").hidden = true;
  render();
  try {
    timer = await request(message);
    minutesEdited = false;
    if (!timer.active && message.type === "finish") $("task-name").value = "";
  } catch (error) {
    $("error").textContent = error.message;
    $("error").hidden = false;
  } finally {
    busy = false;
    render();
  }
}

$("task-form").addEventListener("submit", event => {
  event.preventDefault();
  act(timer.active ? { type: "resume" } : { type: "start", name: $("task-name").value });
});
$("pause").addEventListener("click", () => act({ type: "pause" }));
$("minutes").addEventListener("input", () => { minutesEdited = true; });
$("finish").addEventListener("click", () => {
  if (!$("minutes").value.trim() || !$("minutes").reportValidity()) return;
  act({ type: "finish", minutes: minutesEdited ? Number($("minutes").value) : null });
});
$("export").addEventListener("click", () => {
  const cell = value => {
    const text = String(value);
    // Keep task labels inert when a spreadsheet opens the CSV.
    return `"${(/^[\s]*[=+\-@]|^[\t\r\n]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
  };
  const rows = [["Task", "Started", "Saved", "Logged minutes", "Logged seconds", "Tracked seconds"], ...timer.sessions.map(session => [
    session.name, new Date(session.createdAt).toISOString(), new Date(session.finishedAt).toISOString(),
    (session.durationMs / 60000).toFixed(4), (session.durationMs / 1000).toFixed(3), (session.trackedMs / 1000).toFixed(3)
  ])];
  const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "task-time.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});

request({ type: "read" }).then(data => { timer = data; busy = false; render(); }).catch(error => {
  $("error").textContent = `${error.message} Close and reopen the popup to retry.`;
  $("error").hidden = false;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.timer && !busy) {
    const next = changes.timer.newValue;
    if (next.active?.id !== timer.active?.id) minutesEdited = false;
    timer = next;
    render();
  }
});
setInterval(tick, 1000);
