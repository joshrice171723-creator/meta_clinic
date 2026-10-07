# Task Time — for DataAnnotation

A standalone Chrome Manifest V3 extension. No build, account, server, or dependencies. Independent of DataAnnotation; this is a personal work log and does not submit time to the platform.

## Install

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**, then select this folder (the folder containing `manifest.json`). If using the ZIP, extract it first.
4. Open Chrome's extensions menu (puzzle icon) and pin **Task Time — for DataAnnotation**.

Keep the extracted folder in place; Chrome loads the extension from it. Replacing the files requires clicking **Reload** on its extension card.

## Use

- Enter a short task label, then **Start task**. The toolbar shows **ON** while timing.
- Close the popup and work normally. The stopwatch uses persisted timestamps and continues until explicitly paused, including while Chrome is closed, the computer sleeps, or you visit another page. Pause for breaks.
- Click **Pause** to stop counting. **Resume** continues the same task without including the paused gap.
- Check **Minutes to log**, correct it if necessary, then **Save task**. Unedited minutes preserve the original timer precision. Only one task can run at a time.
- **Export CSV** downloads saved tasks with labels, start/save timestamps, logged minutes/seconds, and original tracked seconds. Total logged includes saved tasks only, across all dates. CSV timestamps use UTC; the popup uses your computer's local time.

Only the `storage` permission is requested. No page content, browser history, cookies, accounts, or DataAnnotation forms are read or changed. Labels and time records stay in this Chrome profile's local extension storage. Export regularly: removing the extension clears its stored records. There is no import or cloud backup.

Manual timing is intentional: reading and thinking still count even when you are not typing. There is no idle detection or automatic task recognition. System clock changes can affect timestamp-based elapsed time; use the minutes correction before saving.

## Verification

Verified on October 7, 2026: both JavaScript syntax checks, manifest JSON parsing, and scoped diff review passed. An unpacked-extension walkthrough in an isolated Chromium profile covered start, closing/reopening the view while running, pause, resume, corrected minutes, save, persisted history after reload, and a CSV download. No page errors were observed. Installation in your everyday Chrome profile remains a separate step. No automated test suite was added or run.

Chrome references: [load an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-an-unpacked-extension), [local storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).
