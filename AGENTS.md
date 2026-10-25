# AGENTS.md

DAW: a deliberately small MVP. Drag audio files in, move/trim/fade clips, play, export WAV.
Electron + TypeScript. Not a production DAW.

## Commands

```
pnpm install
pnpm start        # build + launch Electron
pnpm build        # bundle to dist/ (esbuild)
pnpm typecheck    # tsc --noEmit, run this after every change
```

There is no test runner, linter, or watch mode yet.

## Scope (do not expand without being asked)

In scope: WAV/audio import by drag and drop, clip move, trim, fade in/out, playback, mute, WAV export.

Out of scope: MIDI of any kind, VST/plugins, piano roll, instruments, effects, automation, recording.
Do not add these, and do not add dependencies for them.

## Architecture

All source is in `src/`. There is no `src/main/` folder and no `src/app/` folder.

```
src/
  renderer.ts          entry point, only calls bootstrap()
  bootstrap.ts         wires project, engine, timeline, toolbar
  platform-factory.ts  the ONLY file that chooses a host (Electron or web)
  core/                project model + fade math. Pure TS.
  audio/               Web Audio: decode, peaks, scheduling, playback, WAV export
  ui/                  canvas timeline, toolbar, drop handling, HTML/CSS
  platform/
    platform.ts        Platform interface (what the app needs from its host)
    web/               browser fallback
    electron/          ALL Electron code lives here
```

### Dependency rules (strict)

Dependencies point downward only:

- `core/` imports nothing from the project. No DOM, no Web Audio, no Electron, no Node.
- `audio/` may import `core/`. No Electron, no `ui/`.
- `ui/` may import `core/` and types from `audio/` (e.g. `Peaks`). No Electron.
- `platform/` imports nothing else from the project except its own files.
- Root files (`bootstrap.ts`, `platform-factory.ts`, `renderer.ts`) may import anything.
- `electron` and `node:*` may only be imported inside `src/platform/electron/`.

### Keeping Electron replaceable

Electron must stay removable by deleting `src/platform/electron/`, one line in
`src/platform-factory.ts`, and two build entries in `scripts/build.mjs`.

- If the app needs a new host capability (open file dialog, save project, etc.), add a method
  to the `Platform` interface in `src/platform/platform.ts`, then implement it in both
  `platform/web/` and `platform/electron/` (main + preload + IPC + adapter).
- Never call `window.dawBridge` or any Electron API outside `src/platform/electron/` and
  `platform-factory.ts`.
- Keep the Electron window locked down: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.

## Data model notes

- Times are in seconds. A `Clip` has `start` (timeline position), `offset` (in-point in the source),
  `duration` (length on timeline), `sourceDuration`, `fadeIn`, `fadeOut`.
- Trimming changes `start/offset/duration` and never touches the audio data.
- `Project` is the single source of truth. Mutate it only through its methods; each one emits
  `changed`. The UI and engine subscribe to that.
- Decoded audio lives in `AssetStore` and is referenced by `assetId`. Never put `AudioBuffer`s in `core/`.
- `audio/scheduler.ts` is shared by live playback and offline export, so playback and export
  must always sound identical. Don't duplicate its logic.

## Code conventions

- TypeScript `strict` mode. Avoid `any`; prefer small interfaces.
- Plain DOM and canvas. No UI framework unless asked.
- Keep files small and single-purpose. Prefer adding a module over growing `timeline.ts`.
- Wrap anything that can fail from user input (decoding files, export) in try/catch and show a
  message via `toolbar.setStatus(...)`.
- Always use `.replace` fallback-safe, explicit code over clever abstractions. This is an MVP.

## UI / theme

VS Code default dark look. Black/white/blue only, minimalist.

- Background `#1e1e1e`, panels `#252526`, borders `#3c3c3c`, text `#cccccc`
- Accent blue `#007acc` (status bar, primary button), light blue `#3794ff` for clip borders
- Waveform `#9cdcfe`, playhead white
- No gradients, shadows, or decorative effects. System font stack.

## Known limitations (fine to leave unless asked)

- No undo/redo, no project save/load, no clip splitting.
- Edits during playback restart playback from the current position after a ~120 ms debounce.
- No watch mode; rebuild with `pnpm build`.

## Before finishing a change

1. `pnpm typecheck` passes.
2. `pnpm build` passes.
3. No dependency-rule violations (check imports against the rules above).
4. README.md and this file updated if folders, commands, or rules changed.
