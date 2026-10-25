# DAW (MVP)

Drag audio in, move / trim / fade clips, play, export WAV. No MIDI, no plugins.

    pnpm install
    pnpm start        # build + launch Electron
    pnpm typecheck

## Controls
- Drop audio files on the timeline. Mono files make mono tracks, stereo files make stereo tracks.
  Dropped on a lane with the same layout = that track at that time; on a lane with a different layout or elsewhere = new track
- Click the Mono/Stereo label in a track header to switch that track's layout
- Drag clip body: move (also between tracks)
- Drag clip left/right edge: trim
- Drag the white square handles at the top corners: fade in / fade out
- File > New Project / Ctrl+N: starts an empty project (asks to save first if there are unsaved changes; same for Open and Exit)
- File > Exit / Ctrl+Q: quits the app. Closing the window with unsaved changes asks to save first; the title shows `*` while unsaved
- File > Open / Ctrl+O: opens a `.audioproject` and reloads its audio from the original file paths
- File > Save / Save As, or Ctrl+S / Ctrl+Shift+S: saves `<name>/<name>.audioproject` (asks where on first save)
- File > Copy Audio to Project Folder: copies audio used by the project into `<n>/Audio/` and saves (needs a saved project; desktop only)
- Edit > Undo / Redo, or Ctrl/Cmd+Z / Ctrl/Cmd+Y: undo and redo clip and track edits (a whole drag is one step)
- Track > New Mono Track / New Stereo Track: adds an empty track (drop audio on its lane later)
- Space: play/pause, Delete: remove selected clip, click ruler: seek
- Ctrl+wheel: zoom, wheel: scroll tracks vertically, Shift+wheel: scroll horizontally, `M` on a track header: mute

## Architecture (dependencies point downward only)

    src/*.ts    entry + composition root (renderer, bootstrap, platform-factory)
    ui/         canvas timeline, toolbar, drop handling (DOM only)
    audio/      Web Audio: decode, peaks, scheduling, playback, WAV export
    core/       pure TS project model + fade math (no DOM, no Electron)
    platform/   Platform interface + hosts (web/, electron/)

Electron lives only in `src/platform/electron/` (main, preload, IPC, adapter),
plus 2 of 3 builds in `scripts/build.mjs` and one line in `src/platform-factory.ts`.
To replace it: implement `Platform` for the new host, delete `platform/electron/`.
The app already runs in a plain browser via `WebPlatform` (serve `dist/`).
