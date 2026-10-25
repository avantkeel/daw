import { AudioEngine } from './audio/engine';
import { renderToWav } from './audio/exporter';
import { Project } from './core/project';
import { byId } from './ui/dom';
import { attachFileDrop } from './ui/dropzone';
import { Timeline } from './ui/timeline';
import { Toolbar } from './ui/toolbar';
import { createPlatform } from './platform-factory';

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

  const stage = byId('stage');
  attachFileDrop(stage, async (files, x, y) => {
    const where = timeline.locate(x, y);
    let first = true;
    for (const file of files) {
      try {
        const asset = await engine.assets.importFile(file);
        const useExisting = first && where.trackId;
        const trackId = useExisting ? where.trackId! : project.addTrack(file.name.replace(/\.[^.]+$/, '')).id;
        project.addClip(trackId, {
          assetId: asset.assetId,
          name: asset.name,
          sourceDuration: asset.duration,
          start: useExisting ? where.time : 0,
        });
        toolbar.setStatus(`Added ${asset.name}`);
      } catch {
        toolbar.setStatus(`Could not decode ${file.name}`);
      }
      first = false;
    }
  });

  window.addEventListener('keydown', (e) => {
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
