# SystemPulse — Smart Desktop System Monitor

SystemPulse is an Electron desktop app that displays a live overview of CPU, memory, disk, and running-process activity. It is built as a Computer Science/Application Development course project to demonstrate desktop APIs, the Electron main/renderer process model, secure preload APIs, IPC, system metrics, and practical reliability testing.

> **Project status:** Development app with automated type, lint, unit-test, renderer-build, and headless startup checks. A macOS DMG packaging workflow is configured; check the latest [macOS package run](https://github.com/cshanmukha777/systempulse/actions/workflows/macos-package.yml) before treating an artifact as available. Packages are unsigned and not notarized. See [limitations](#known-limitations).

## Features

- **Live system metrics:** CPU load, memory utilization, and primary filesystem usage.
- **Process monitor:** Top running processes with PID, CPU%, and memory%; search and sortable columns.
- **CPU history:** Rolling chart of up to 30 valid readings with a configurable warning threshold.
- **Preferences:** Local CPU warning threshold, refresh interval (2–10 seconds), and notification preference.
- **Desktop notifications:** Optional threshold-crossing notifications, subject to operating-system permission/settings.
- **JSON export:** Export the currently available metrics, process list, and CPU history.
- **Window and tray behavior:** Restore window position/size, hide to tray on close, reopen from tray, and explicitly quit from the tray menu.
- **Defensive data handling:** Clamp percentages, mark unavailable readings, sanitize process data, and avoid returning library-specific objects to the renderer.
- **Accessibility:** Keyboard-focus indicators, semantic process table, accessible status announcements, and reduced-motion styling.

## Technology stack

- Electron for the desktop shell, native window, tray, and IPC.
- React and TypeScript for the renderer UI and contracts.
- Vite for development serving and renderer production builds.
- Node.js built-in test runner (node:test) for unit and service tests.
- ESLint for JavaScript lint checks.
- systeminformation for read-only system metrics and process information.

No additional runtime dependency is required for the test suite. The lint script invokes a pinned ESLint 9 release through npx.

## Requirements

- Node.js **22.12 or newer in the Node 22 line** is recommended (Vite 8 requires a recent Node release).
- npm, installed with Node.js.
- Git.
- A desktop environment for interactive Electron testing. The CI smoke test uses a virtual X server on Ubuntu.

## Setup and run

Clone the existing repository:

~~~bash
git clone https://github.com/cshanmukha777/systempulse.git
cd systempulse
npm install
~~~

Start the development app (Vite plus Electron):

~~~bash
npm run dev
~~~

Vite serves the renderer at http://localhost:5173; Electron loads that local page in development. Stop both processes with Ctrl+C.

To build the renderer bundle:

~~~bash
npm run build
~~~

The build output is written to dist/. This command builds the renderer; it does **not** create an installer or packaged desktop application.

## Common commands

| Command | Purpose |
| --- | --- |
| npm run dev | Run Vite and Electron together for interactive development. |
| npm run typecheck | Run the main/preload and renderer TypeScript checks. |
| npm run lint | Lint JavaScript main-process, utility, test, and ESLint config files. |
| npm test | Run deterministic unit and service tests with Node's built-in test runner. |
| npm run build | Create the production renderer bundle. |
| npm run check | Run typecheck, lint, tests, and production renderer build in sequence. |
| npm run package:mac | Build a universal macOS `.dmg` using electron-builder. |
| npm run test:packaged | Run renderer integration checks against an installed `.app` bundle (macOS only). |

## Architecture

~~~text
SystemPulse
├── Electron main process (electron/main.js)
│   ├── Owns the BrowserWindow and system tray
│   ├── Restores persisted window bounds
│   ├── Coordinates periodic snapshots and shutdown cleanup
│   └── Registers the legacy system:get-snapshot request
├── Preload (electron/preload.js)
│   └── Exposes a narrow window.systemPulse API via contextBridge
├── IPC/service layer
│   ├── electron/ipcHandlers.js — metrics/process request handlers and safe error envelopes
│   ├── electron/systemService.js — normalized system snapshot and disk selection
│   └── electron/processService.js — sanitized, sorted, limited process list
├── Renderer (src/)
│   ├── App.tsx — dashboard, preferences, notifications, JSON export
│   ├── hooks/useSystemPulse.ts — polling, validation, CPU history, request lifecycle
│   ├── components/ — metric cards, CPU chart, process table
│   └── utils/ — formatting and CPU-threshold decision helpers
├── Types (types/systemPulse.d.ts)
├── Tests (tests/reliability.test.js)
└── docs/TEST_PLAN.md — broader manual and release test plan
~~~

### Data flow

1. The renderer calls the explicitly exposed window.systemPulse.getMetrics() and getProcesses() methods.
2. The preload invokes fixed IPC channel names; it does not expose ipcRenderer itself.
3. Main-process handlers validate the sender and call the system service.
4. The service maps systeminformation results into finite, serializable values. IPC service failures return a fixed error envelope.
5. The renderer validates responses, retains prior valid metrics on transient failures, and limits CPU history to the latest 30 valid readings.

The app has both a complete snapshot service and a smaller metrics/process request path. The dashboard uses the latter; the periodic snapshot event supports the starter API.

## Project structure

- electron/main.js — Electron lifecycle, window/tray management, snapshot timer, and IPC registration.
- electron/preload.js — secure renderer bridge and snapshot event subscription.
- electron/ipcHandlers.js — request/response IPC channels and safe errors.
- electron/systemService.js — system snapshot normalization and primary-disk selection.
- electron/processService.js — process filtering, normalization, sorting, and result limit.
- electron/systemMetrics.ts and electron/processMetrics.ts — typed service implementations retained for type checking/reference; the current dashboard request path uses the JavaScript services above.
- src/App.tsx — dashboard and preferences.
- src/hooks/useSystemPulse.ts — renderer polling and data validation.
- src/components/ — reusable UI components.
- src/utils/ — pure formatting and notification-threshold utilities.
- tests/reliability.test.js — deterministic utility, service, and IPC tests.
- docs/TEST_PLAN.md — manual integration, accessibility, and packaged-app checklist.
- .github/workflows/ci.yml — CI workflow.

## Testing

Run the full local check sequence:

~~~bash
npm run check
~~~

The test suite mocks systeminformation methods so unit tests do not depend on current hardware readings. It covers:

- Percent and byte formatting, including invalid values.
- CPU notification threshold transitions.
- Disk metric calculation and primary-volume selection.
- System snapshot normalization and invalid/rejected readings.
- Process PID filtering, name fallback, percentage normalization, sorting, and result limits.
- IPC channel registration, rejection of untrusted senders, and sanitized service-error responses.

The lightweight GitHub Actions workflow `.github/workflows/ci.yml` runs dependency installation, TypeScript checks, JavaScript linting, unit tests, the renderer build, and a headless Electron/Vite startup smoke test. The startup smoke test checks that the app stays running briefly; it is not an end-to-end test of tray, notifications, export, or real hardware behavior.

For the broader manual checks, see [docs/TEST_PLAN.md](docs/TEST_PLAN.md).

## Security notes

- Renderer web preferences keep contextIsolation: true, nodeIntegration: false, and sandbox: true.
- Preload exposes named, narrow methods instead of raw IPC APIs.
- IPC request handlers validate that requests originate from the trusted main frame.
- New-window requests are denied and navigation to untrusted URLs is blocked.
- Process data intentionally omits command lines and other unnecessary process details.
- IPC errors avoid forwarding raw exception messages, stack traces, and local paths.
- SystemPulse reads system metrics; it does not terminate or control processes.

Security configuration should be re-reviewed whenever preload APIs, IPC channels, navigation, or packaging settings change.

## Packaging and distribution

The project uses **electron-builder 26.0.12** for macOS packaging. App metadata is configured in `package.json`:

- Product name: `SystemPulse`
- Version: `1.0.0`
- Bundle identifier: `com.shanmukha.systempulse`
- Icon source: `build/icon.svg`
- Output: `release/SystemPulse-1.0.0-universal.dmg`
- Target: universal macOS app bundle for Intel and Apple Silicon

On macOS, run:

~~~bash
npm run package:mac
~~~

The command builds the Vite renderer first, then creates a universal `.dmg`. GitHub Actions (`.github/workflows/macos-package.yml`) runs the full check suite, builds the DMG on a macOS runner, verifies that the image is readable and nonempty, checks bundle metadata, mounts and copies the app to `/Applications`, confirms the packaged app launches with no Vite development server, and runs renderer integration checks for live metrics, process rows, saved preferences, notification threshold behavior, and JSON export. The resulting disk image is uploaded as the `SystemPulse-macOS-DMG` workflow artifact.

The current package is **unsigned and not notarized** because no Apple Developer signing identity or notarization credentials are configured. macOS may show a security warning when opening a downloaded build. This is suitable for project/testing distribution, not a signed public release. The native macOS About panel is configured in the app menu; its click-level UI automation may be limited by hosted-runner Accessibility permissions.

## Known limitations

- The release pipeline targets macOS only; Windows and Linux packages are not configured.
- The macOS DMG is unsigned and not notarized. A signing identity and Apple notarization credentials are required for frictionless public distribution.
- Automated tests use mocks and do not validate the machine's actual metric readings.
- Notification delivery is controlled by operating-system permission and notification settings.
- Disk utilization reports one filesystem. On macOS, APFS volumes can share a physical container, so the displayed volume is not necessarily the total physical-drive capacity.
- The renderer export triggers a JSON download through the Chromium download mechanism; this is not yet a native Save dialog.
- The macOS packaged-app integration script uses a test notification stub to verify threshold-triggered notification behavior; it does not validate actual Notification Center delivery. Tray behavior, real notification delivery, display removal, and some native menu interactions still require hands-on platform testing.
- The legacy getSnapshot() API has a different response shape from the newer ServiceResponse<T> metrics/process methods.

## Contributing

Keep changes focused, preserve existing checks, and run npm run check before pushing. Add regression tests for metric normalization, IPC contracts, lifecycle behavior, and user-visible error states when practical.

## License

MIT. This project is marked private in package.json for course development; repository access is controlled by GitHub settings.
