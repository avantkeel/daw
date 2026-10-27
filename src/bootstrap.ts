import { AudioEngine } from "./audio/engine";
import { renderToWav } from "./audio/exporter";
import { Project } from "./core/project";
import { stripAudioExtension } from "./core/names";
import { defaultTemplate, trackChannelsFor } from "./core/types";
import { byId } from "./ui/dom";
import { askReplaceClips } from "./ui/dialog";
import { attachFileDrop } from "./ui/dropzone";
import { Timeline } from "./ui/timeline";
import { MenuBar } from "./ui/menubar";
import { showContextMenu } from "./ui/contextmenu";
import { Toolbar } from "./ui/toolbar";
import { Mixer } from "./ui/mixer";
import { createPlatform } from "./platform-factory";
import type { MixerAction } from "./platform/platform";
import { ProjectFiles } from "./project-files";

export function bootstrap(): void {
  const project = new Project();
  const engine = new AudioEngine(project);
  const platform = createPlatform();
  if (!platform.supportsMixerWindow)
    new Mixer(byId("mixer"), project, () => engine.getTrackLevels());

  const togglePlay = () =>
    engine.playing ? engine.pause() : void engine.play();

  const toolbar = new Toolbar({
    onPlayPause: togglePlay,
    onStop: () => engine.stop(),
    onToggleMixer: () => {
      void platform
        .toggleMixerWindow()
        .then((open) => toolbar.setMixerOpen(open))
        .catch((err) =>
          toolbar.setStatus(`Could not open mixer: ${(err as Error).message}`),
        );
    },
    onZoomIn: () => timeline.zoomBy(1.4),
    onZoomOut: () => timeline.zoomBy(1 / 1.4),
    onTempoChange: (tempo) => {
      if (!project.setTempo(tempo)) {
        toolbar.setStatus("BPM must be between 20 and 666");
        toolbar.setTempo(project.getTempo());
      }
    },
    onGridChange: (beats) => timeline.setGridBeats(beats),
    onExport: async () => {
      if (project.duration() === 0) {
        toolbar.setStatus("Nothing to export yet. Drop some audio first.");
        return;
      }
      toolbar.setStatus("Rendering…");
      try {
        const wav = await renderToWav(
          project,
          engine.assets,
          engine.sampleRate,
        );
        const saved = await platform.saveFile("mixdown.wav", wav);
        toolbar.setStatus(saved ? "Exported mixdown.wav" : "Export cancelled");
      } catch (err) {
        toolbar.setStatus(`Export failed: ${(err as Error).message}`);
      }
    },
  });

  const timeline = new Timeline(
    byId<HTMLCanvasElement>("timeline"),
    project,
    engine.assets,
    () => engine.position,
    (t) => engine.seek(t),
  );
  project.changed.subscribe(() => toolbar.setTempo(project.getTempo()));
  toolbar.setTempo(project.getTempo());

  const publishMixerState = () =>
    platform.updateMixerState({
      tracks: project.getTracks().map((track) => ({
        id: track.id,
        name: track.name,
        channels: track.channels,
        volume: track.volume,
        muted: track.muted,
        solo: track.solo,
      })),
      levels: Object.fromEntries(engine.getTrackLevels()),
    });
  const applyMixerAction = (action: MixerAction) => {
    switch (action.type) {
      case "set-volume":
        project.setVolume(action.trackId, action.volume);
        break;
      case "set-muted":
        project.setMuted(action.trackId, action.muted);
        break;
      case "set-solo":
        project.setSolo(action.trackId, action.solo);
        break;
      case "begin-batch":
        project.beginBatch();
        mixerBatchOpen = true;
        break;
      case "end-batch":
        project.endBatch();
        mixerBatchOpen = false;
        break;
    }
  };
  let mixerBatchOpen = false;
  if (platform.supportsMixerWindow) {
    platform.onMixerAction(applyMixerAction);
    platform.onMixerReady(publishMixerState);
    platform.onMixerWindowClosed(() => {
      if (mixerBatchOpen) {
        project.endBatch();
        mixerBatchOpen = false;
      }
      toolbar.setMixerOpen(false);
    });
    project.changed.subscribe(publishMixerState);
    window.setInterval(publishMixerState, 50);
  }

  // Loaded before ProjectFiles exists, so the starting template doesn't count as an unsaved change.
  project.load(defaultTemplate(), []);

  const files = new ProjectFiles(
    project,
    engine,
    platform,
    (msg) => toolbar.setStatus(msg),
    (name, dirty) =>
      (document.title = `${dirty ? "* " : ""}${name ? `${name} - DAW` : "DAW"}`),
  );
  platform.onCloseRequested(() => void files.exit());
  const mod = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";
  const undo = () =>
    toolbar.setStatus(project.undo() ? "Undo" : "Nothing to undo");
  const redo = () =>
    toolbar.setStatus(project.redo() ? "Redo" : "Nothing to redo");
  const splitSelectedClip = () =>
    toolbar.setStatus(
      timeline.splitSelectedClipAtPlayhead()
        ? "Split selected clip at playhead"
        : "Select a clip and place the playhead inside it to split",
    );
  const newTrack = (channels: 1 | 2) => {
    const track = project.addTrack(undefined, channels);
    toolbar.setStatus(
      `Added ${track.name} (${channels === 1 ? "mono" : "stereo"})`,
    );
  };
  const deleteClip = (clipId: string) => {
    const clip = project.findClip(clipId)?.clip;
    if (!clip) return;
    project.removeClip(clipId);
    toolbar.setStatus(`Deleted ${clip.name} (Edit > Undo brings it back)`);
  };
  const splitClip = (clipId: string) => {
    const clip = project.findClip(clipId)?.clip;
    if (!clip) return;
    toolbar.setStatus(
      timeline.splitClipAtPlayhead(clipId)
        ? `Split ${clip.name} at playhead`
        : "Move the playhead inside the clip to split it",
    );
  };
  const deleteTrack = (trackId: string) => {
    const track = project.getTracks().find((t) => t.id === trackId);
    if (!track) return;
    project.removeTrack(trackId);
    toolbar.setStatus(`Deleted ${track.name} (Edit > Undo brings it back)`);
  };
  new MenuBar(byId("menubar"), [
    {
      label: "File",
      items: [
        {
          label: "New Project",
          shortcut: `${mod}N`,
          onSelect: () => void files.newProject(),
        },
        {
          label: "Open…",
          shortcut: `${mod}O`,
          onSelect: () => void files.open(),
        },
        {
          label: "Save",
          shortcut: `${mod}S`,
          onSelect: () => void files.save(),
        },
        {
          label: "Save As…",
          shortcut: `${mod}Shift+S`,
          onSelect: () => void files.save(true),
        },
        { separator: true },
        {
          label: "Copy Audio to Project Folder",
          onSelect: () => void files.copyAudioToProject(),
        },
        { separator: true },
        {
          label: "Exit",
          shortcut: `${mod}Q`,
          onSelect: () => void files.exit(),
        },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", shortcut: `${mod}Z`, onSelect: undo },
        { label: "Redo", shortcut: `${mod}Y`, onSelect: redo },
        {
          label: "Split Clip at Playhead",
          shortcut: `${mod}E`,
          onSelect: splitSelectedClip,
        },
      ],
    },
    {
      label: "Track",
      items: [
        { label: "New Mono Track", onSelect: () => newTrack(1) },
        { label: "New Stereo Track", onSelect: () => newTrack(2) },
      ],
    },
  ]);

  const stage = byId("stage");

  // Right-click in the track area: add a mono or stereo track (and rename the track under the cursor).
  stage.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (!timeline.inTrackArea(e.clientX, e.clientY)) return;
    const items = [
      { label: "New Mono Track", onSelect: () => newTrack(1) },
      { label: "New Stereo Track", onSelect: () => newTrack(2) },
    ];
    const clipId = timeline.clipAt(e.clientX, e.clientY);
    const trackId = timeline.locate(e.clientX, e.clientY).trackId;
    if (clipId) {
      // Right-click on a clip: rename that clip (the audio file it points to is not touched).
      items.unshift(
        {
          label: "Rename Clip",
          onSelect: () => timeline.beginRenameClip(clipId),
        },
        { label: "Split Clip at Playhead", onSelect: () => splitClip(clipId) },
        { label: "Delete Clip", onSelect: () => deleteClip(clipId) },
      );
    } else if (trackId) {
      items.unshift(
        {
          label: "Rename Track",
          onSelect: () => timeline.beginRenameTrack(trackId),
        },
        { label: "Delete Track", onSelect: () => deleteTrack(trackId) },
      );
    }
    showContextMenu(e.clientX, e.clientY, items);
  });
  attachFileDrop(stage, async (files, x, y) => {
    const where = timeline.locate(x, y);
    let first = true;
    for (const file of files) {
      const clipName = stripAudioExtension(file.name);
      try {
        const asset = await engine.assets.importFile(file);
        project.registerAsset({
          id: asset.assetId,
          fileName: asset.name,
          duration: asset.duration,
          sampleRate: asset.sampleRate,
          channels: asset.channels,
          path: platform.getFilePath(file),
        });
        // Dropped on a lane: use that track if its channel layout matches the file,
        // otherwise (or when dropped elsewhere) make a new mono/stereo track to match.
        const channels = trackChannelsFor(asset.channels);
        const target =
          first && where.trackId
            ? project.getTracks().find((t) => t.id === where.trackId)
            : undefined;
        // The track the file goes on, if it can go on the one it was dropped on; otherwise a new one is made.
        const lane =
          target && target.channels === channels ? target : undefined;
        const start = target ? where.time : 0;
        // Clips on a track may not overlap: ask before deleting the ones in the way.
        const hits = lane
          ? project.clipsInRange(lane.id, start, asset.duration)
          : [];
        if (hits.length > 0) {
          const ok = await askReplaceClips(
            clipName,
            hits.map((h) => h.name),
            "does not add the file.",
          );
          if (!ok) {
            toolbar.setStatus(
              `Not added ${clipName}: it would overlap another clip`,
            );
            first = false;
            continue;
          }
        }
        // One undo step for the deleted clips, the new track (if any) and the new clip.
        project.batch(() => {
          for (const h of hits) project.removeClip(h.id);
          const trackId = lane
            ? lane.id
            : project.addTrack(clipName, channels).id;
          project.addClip(trackId, {
            assetId: asset.assetId,
            name: clipName,
            sourceDuration: asset.duration,
            start,
          });
        });
        toolbar.setStatus(
          `Added ${clipName} (${channels === 1 ? "mono" : "stereo"})`,
        );
      } catch {
        toolbar.setStatus(`Could not decode ${file.name}`);
      }
      first = false;
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === "n") void files.newProject();
      else if (key === "o") void files.open();
      else if (key === "s") void files.save(e.shiftKey);
      else if (key === "q") void files.exit();
      else if (key === "z" && !e.shiftKey) undo();
      else if (key === "y") redo();
      else if (key === "e") splitSelectedClip();
      else return;
      e.preventDefault();
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      togglePlay();
    }
  });

  const frame = () => {
    toolbar.setTime(engine.position);
    toolbar.setPlaying(engine.playing);
    if (engine.playing && engine.position >= project.duration()) engine.stop();
    requestAnimationFrame(frame);
  };
  frame();
}
