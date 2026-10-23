# SystemPulse Test Plan

Run `npm install`, `npm run typecheck`, and `npm run build` before interactive testing.

## 1. Utilities and metrics

- Test percent formatting with 0, 45.67, 100, negative, NaN, and Infinity. Output should be finite and clamped to 0–100.
- Test byte formatting for zero, KiB, MiB, GiB, negative, NaN, and Infinity. Binary units must be labeled accurately.
- Verify disk selection prefers `/System/Volumes/Data` on macOS, then `/`; other platforms prefer `/`, with the largest usable filesystem as fallback. Missing or zero capacity should be unavailable.
- Verify process records have a safe name, valid PID, finite CPU/memory percentages, and only the public serializable fields.
- Simulate unavailable metrics, invalid readings, rejected IPC calls, and recovery on a later poll. Last valid readings should be retained where possible.
- Change polling to 2, 3, and 10 seconds. Confirm prior timers are cleared and refresh calls do not overlap. Confirm CPU history keeps at most 30 valid readings.

## 2. IPC and preload

- Verify `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`.
- Confirm only documented `window.systemPulse` methods are exposed, not a generic IPC API or unrestricted Node.js access.
- Confirm snapshot, metrics, and process handlers register once, reject untrusted frames, return safe error envelopes, and are removed during shutdown.
- Confirm event subscriptions can be unsubscribed and cannot update a destroyed renderer.
- Trigger a service failure and ensure the main process remains running without exposing stack traces or local paths to the UI.

## 3. Windows, restoration, and tray

- Resize and move the window, quit from the tray menu, and relaunch. Size and position should be restored.
- Save a position on a secondary display, disconnect that display, and relaunch. The window should be moved to a visible work area.
- Close the window and verify it hides to the tray; reopen through the tray menu and double-click.
- Choose Quit from the tray and verify the process exits, the tray icon disappears, and timers stop.
- Test macOS dock activation and verify only one window/update schedule is created.
- Verify untrusted navigation and new-window requests are blocked.

## 4. Notifications and export

- With notifications disabled, crossing the CPU threshold must not show a desktop notification.
- With permission granted, crossing the threshold should notify once per transition rather than on every poll.
- Deny notification permission and confirm the app remains usable and explains the blocked state.
- Export JSON and parse the file. It should include export time, current metrics, process list, and up to 30 CPU history readings.
- Test export before any successful data and any reproducible download failure. Feedback should explain the result and be announced accessibly.
- Confirm exports contain only intended app fields, not raw library records or process command-line data.

## 5. Keyboard, accessibility, and responsive layout

- Use keyboard-only navigation for refresh, retry, export, search, sort headers, preferences, and feedback dismissal.
- Verify visible focus indicators, accessible control names, semantic table headers/caption, labeled progress bars, and announced loading/error/export feedback.
- Test window widths around 360, 620, 850, and 1280 px. Controls must remain reachable and the process table may scroll horizontally when needed.
- Check reduced-motion and high-contrast system settings.

## 6. Packaged-app testing

- Install and launch the actual package on every supported OS; a renderer build is not a packaged-app test.
- Verify packaged local HTML and preload, metrics/processes, window restoration, tray, notifications, export, and quit cleanup.
- Test fresh install and upgrade over existing user data. Confirm preferences and window state remain usable.
- Test signing/notarization if part of the release process.

## Automation and known limitations

- GitHub Actions runs dependency installation, TypeScript checks, renderer build, and a 20-second headless Electron/Vite startup smoke test on Ubuntu.
- The smoke test does not verify interactive UI, tray rendering, notifications, export completion, or real hardware readings.
- No dedicated unit or end-to-end test runner is configured; failure injection and packaged-app checks remain manual.
- Notification delivery depends on host OS settings. Disk figures describe a filesystem, not necessarily a physical drive; macOS APFS volumes may share a container.
