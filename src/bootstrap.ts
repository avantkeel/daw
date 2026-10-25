import { AudioEngine } from './audio/engine';
import { renderToWav } from './audio/exporter';
import { Project } from './core/project';
import { trackChannelsFor } from './core/types';
import { byId } from './ui/dom';
import { attachFileDrop } from './ui/dropzone';
import { Timeline } from './ui/timeline';
import { MenuBar } from './ui/menubar';
import { Toolbar } from './ui/toolbar';
import { createPlatform } from './platform-factory';
import { ProjectFiles } from './project-files';

export function bootstrap(): void {
  const project = new Project();
  const engine = new AudioEngine(project);
  const platform = createPlatform();

  const togglePlay = () => (engine.playing ? engine.pause() : void engine.play());

  const toolbar = new Toolbar({
    onPlayPause: togglePlay,
    onStop: () => engine.stop(),
    onZoomIn: () => timeline.zoomBy(1.4),
    onZoomOut: () => timeline.zoomBy(1 / 1.4),
    onExport: async () => {
      if (project.duration() === 0) {
        toolbar.setStatus('Nothing to export yet. Drop some audio first.');
        return;
      }
      toolbar.setStatus('Rendering…');
      try {
        const wav = await renderToWav(project, engine.assets, engine.sampleRate);
        const saved = await platform.saveFile('mixdown.wav', wav);
        toolbar.setStatus(saved ? 'Exported mixdown.wav' : 'Export cancelled');
      } catch (err) {
        toolbar.setStatus(`Export failed: ${(err as Error).message}`);
      }
    },
  });

  const timeline = new Timeline(
    byId<HTMLCanvasElement>('timeline'),
    project,
    engine.assets,
    () => engine.position,
    (t) => engine.seek(t),
  );

  const files = new ProjectFiles(
    project,
    engine,
    platform,
    (msg) => toolbar.setStatus(msg),
    (name) => (document.title = name ? `${name} - DAW` : 'DAW'),
  );
  const mod = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';
  const undo = () => toolbar.setStatus(project.undo() ? 'Undo' : 'Nothing to undo');
  const redo = () => toolbar.setStatus(project.redo() ? 'Redo' : 'Nothing to redo');
  const newTrack = (channels: 1 | 2) => {
    const track = project.addTrack(undefined, channels);
    toolbar.setStatus(`Added ${track.name} (${channels === 1 ? 'mono' : 'stereo'})`);
  };
  new MenuBar(byId('menubar'), [
    {
      label: 'File',
      items: [
        { label: 'New Project', shortcut: `${mod}N`, onSelect: () => files.newProject() },
        { label: 'Open…', shortcut: `${mod}O`, onSelect: () => void files.open() },
        { label: 'Save', shortcut: `${mod}S`, onSelect: () => void files.save() },
        { label: 'Save As…', shortcut: `${mod}Shift+S`, onSelect: () => void files.save(true) },
        { separator: true },
        { label: 'Copy Audio to Project Folder', onSelect: () => void files.copyAudioToProject() },
        { separator: true },
        { label: 'Exit', shortcut: `${mod}Q`, onSelect: () => void platform.quit() },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: `${mod}Z`, onSelect: undo },
        { label: 'Redo', shortcut: `${mod}Y`, onSelect: redo },
      ],
    },
    {
      label: 'Track',
      items: [
        { label: 'New Mono Track', onSelect: () => newTrack(1) },
        { label: 'New Stereo Track', onSelect: () => newTrack(2) },
      ],
    },
  ]);

  const stage = byId('stage');
  attachFileDrop(stage, async (files, x, y) => {
    const where = timeline.locate(x, y);
    let first = true;
    for (const file of files) {
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
        const target = first && where.trackId ? project.getTracks().find((t) => t.id === where.trackId) : undefined;
        // One undo step for the new track (if any) plus its clip.
        project.batch(() => {
          const trackId =
            target && target.channels === channels
              ? target.id
              : project.addTrack(file.name.replace(/\.[^.]+$/, ''), channels).id;
          project.addClip(trackId, {
            assetId: asset.assetId,
            name: asset.name,
            sourceDuration: asset.duration,
            start: target ? where.time : 0,
          });
        });
        toolbar.setStatus(`Added ${asset.name} (${channels === 1 ? 'mono' : 'stereo'})`);
      } catch {
        toolbar.setStatus(`Could not decode ${file.name}`);
      }
      first = false;
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === 'n') files.newProject();
      else if (key === 'o') void files.open();
      else if (key === 's') void files.save(e.shiftKey);
      else if (key === 'q') void platform.quit();
      else if (key === 'z' && !e.shiftKey) undo();
      else if (key === 'y') redo();
      else return;
      e.preventDefault();
      return;
    }
    if (e.code === 'Space') {
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
