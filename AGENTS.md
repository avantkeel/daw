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

In scope: WAV/audio import by drag and drop, clip move, trim, fade in/out, playback, mute, WAV export, saving and opening projects.

Out of scope: MIDI of any kind, VST/plugins, piano roll, instruments, effects, automation, recording.
Do not add these, and do not add dependencies for them.

## Architecture

All source is in `src/`. There is no `src/main/` folder and no `src/app/` folder.

```
src/
  renderer.ts          entry point, only calls bootstrap()
  bootstrap.ts         wires project, engine, timeline, toolbar
  platform-factory.ts  the ONLY file that chooses a host (Electron or web)
  project-files.ts     save/open projects, remembers the project location
  core/                project model, fade math, project file read/write (serialize, deserialize, xml). Pure TS.
  audio/               Web Audio: decode, peaks, scheduling, playback, WAV export
  ui/                  canvas timeline, menu bar, toolbar, drop handling, HTML/CSS
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
- Root files (`bootstrap.ts`, `platform-factory.ts`, `project-files.ts`, `renderer.ts`) may import anything.
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

- Clips on one track never overlap (touching is fine). The editor enforces it with a prompt, not in `Project`: `Project.overlapping`
  / `clipsInRange` find the clips in the way. A clip drag (move/trim) keeps its undo batch open until mouseup; if it overlaps,
  `Timeline.finishEdit` asks (`askReplaceClips`) and either deletes the overlapped clips inside the same batch or calls
  `Project.abortBatch()`, which restores the state from before the drag. File drops ask before adding. Old project files may
  still contain overlaps.
- Mono audio lives on mono tracks, stereo on stereo tracks. `Project.accepts(trackId, assetId)` is the rule; `moveClip`
  ignores a track change that fails it (the clip still moves in time) and `setChannels` ignores tracks that have clips.
- `Peaks.channels` has one array per displayed channel (1 for mono, 2 for stereo), and the timeline draws one lane per array.
- A `Track` has `channels: 1 | 2` (mono or stereo). Importing a file picks it via `trackChannelsFor(asset.channels)`
  (mono -> 1, anything wider -> 2). `audio/scheduler.ts` also forces the track's gain node to that layout
  (`channelCountMode: 'explicit'`); that only matters as a safety net (e.g. a project file that already has mismatched clips),
  since the editor itself never puts a clip on a track with a different layout.
- Times are in seconds. A `Clip` has `start` (timeline position), `offset` (in-point in the source),
  `duration` (length on timeline), `sourceDuration`, `fadeIn`, `fadeOut`.
- Trimming changes `start/offset/duration` and never touches the audio data.
- Undo/redo lives in `Project` (snapshots of the tracks; assets are not in history). Every mutating method goes
  through the private `change()`, so one call = one undo step. Gestures that make many calls (dragging a clip, a drop that
  adds a track and a clip) must wrap them in `beginBatch()`/`endBatch()` or `batch(fn)` to be a single step. New mutating
  methods must use `change()`. `load()` clears history.
- `Project` is the single source of truth. Mutate it only through its methods; each one emits
  `changed`. The UI and engine subscribe to that.
- Decoded audio lives in `AssetStore` and is referenced by `assetId`. Never put `AudioBuffer`s in `core/`.
- `audio/scheduler.ts` is shared by live playback and offline export, so playback and export
  must always sound identical. Don't duplicate its logic.

## Project files

- Saving creates a folder named after the project, containing `<name>.audioproject`
  (`<chosen path>/<name>/<name>.audioproject`). First save or Save As asks where; later saves overwrite silently.
- Triggers: File menu (New Project, Open, Save, Save As, Exit), Ctrl/Cmd+N, +O, +S, +Shift+S, +Q.
- New Project resets the project, assets and save location. Exit goes through `ProjectFiles.exit()` then `Platform.quit()`.
- Unsaved changes: `ProjectFiles` marks the project dirty on every `Project.changed` and clears it on save, open and
  New Project. New Project, Open (after the file is chosen) and Exit call `confirmDiscard()`, which shows the in-app
  Save / Don't Save / Cancel dialog (`ui/dialog.ts`). The window title gets a `* ` prefix while dirty.
- Closing the window: `Platform.setDirty()` tells the host about unsaved changes. Electron's main process then cancels the
  window `close`, sends `daw:close-requested`, and the renderer runs `ProjectFiles.exit()`; `quit` sets `forceClose` so
  it can't be blocked again. The browser uses a generic `beforeunload` prompt (it can't be customised).
- The file is XML modelled on the DAWproject `project.xml` (Application, Transport, Structure, Arrangement).
  It is "similar to", not conformant with, DAWproject: no zip container, no `metadata.xml`.
- Serialization lives in `core/serialize.ts`, parsing in `core/deserialize.ts` (with a tiny parser in
  `core/xml.ts`). All pure, string in/out. File and folder I/O lives behind
  `Platform.saveProject`; the host is given the extension and content and knows nothing about the format.
- Audio files are NOT copied on import. Clips reference the original file as `<File external="true">`,
  using its absolute path when the host knows it (`Platform.getFilePath`, Electron only) and just the file name otherwise.
- File > Copy Audio to Project Folder (`ProjectFiles.copyAudioToProject`, needs a saved project) calls
  `Platform.copyFileIntoProject` for every asset outside the project folder, copies it to `<project>/Audio/`
  (never overwriting; clashes get a ` 2`, ` 3` suffix), repoints the asset and saves. Audio inside the project folder
  is written as a path relative to it (`Audio/x.wav`, see `core/paths.ts`); Open resolves relative paths against
  the project folder. Save As writes absolute paths, since the project is moving.
- Opening replaces the current project (`Project.load`), re-reads each referenced audio file by absolute
  path via `Platform.readFile`, and decodes it. Files that can't be found become silent placeholder
  assets, so the clips and their data survive a re-save.
- Track channel count is stored as `audioChannels` on the track's `<Channel>`; files without a usable value load as stereo.
- When adding fields to `Project`/`Clip`/`Track`, update `core/serialize.ts`, `core/deserialize.ts`
  and `ProjectFiles.open`, and extend the round trip.
- Electron's `readFile` and `copyFileIntoProject` IPCs only accept audio extensions, so the renderer can't read or copy arbitrary files.

## Code conventions

- TypeScript `strict` mode. Avoid `any`; prefer small interfaces.
- Plain DOM and canvas. No UI framework unless asked.
- Keep files small and single-purpose. Prefer adding a module over growing `timeline.ts`.
- Wrap anything that can fail from user input (decoding files, export) in try/catch and show a
  message via `toolbar.setStatus(...)`.
- Prefer explicit, simple code over clever abstractions. This is an MVP.

## UI / theme

VS Code default dark look. Black/white/blue only, minimalist.

- Background `#1e1e1e`, panels `#252526`, borders `#3c3c3c`, text `#cccccc`
- Accent blue `#007acc` (status bar, primary button), light blue `#3794ff` for clip borders
- Waveform `#9cdcfe`, playhead white
- No gradients, shadows, or decorative effects. System font stack.

## Known limitations (fine to leave unless asked)

- Undo/redo covers track and clip edits only (not file-path changes from Copy Audio, not dropped assets); history is in memory, capped at 100 steps. No clip splitting. The dirty flag is "any edit since the last save", so undoing back to the saved state still counts as unsaved.
- Saved projects only contain the audio if the user ran Copy Audio to Project Folder; otherwise just references. If a source file is moved, its clips open silent.
- In the browser build, projects can be saved and opened but audio can't be reloaded (no file paths).
- Edits during playback restart playback from the current position after a ~120 ms debounce.
- No watch mode; rebuild with `pnpm build`.

## Before finishing a change

1. `pnpm typecheck` passes.
2. `pnpm build` passes.
3. No dependency-rule violations (check imports against the rules above).
4. README.md and this file updated if folders, commands, or rules changed.
