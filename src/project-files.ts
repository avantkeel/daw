import type { AudioEngine } from './audio/engine';
import { parseProject, type ParsedSource } from './core/deserialize';
import { relativeToFolder, resolveInFolder } from './core/paths';
import type { Project } from './core/project';
import { PROJECT_EXTENSION, serializeProject } from './core/serialize';
import type { AssetRef, ClipData, TrackData } from './core/types';
import type { Platform, ProjectLocation } from './platform/platform';

const APP_NAME = 'DAW';
const APP_VERSION = '0.1.0';
/** Folder inside the project folder that holds copied audio. */
const AUDIO_FOLDER = 'Audio';

interface LoadedAsset {
  ref: AssetRef;
  loaded: boolean;
}

/**
 * Saving and opening projects. Remembers where the project lives: the first save (or Save As)
 * asks the host for a location, later saves overwrite silently. Opening sets the same location.
 */
export class ProjectFiles {
  private current: ProjectLocation | null = null;
  private missingSeq = 0;

  constructor(
    private project: Project,
    private engine: AudioEngine,
    private platform: Platform,
    private onStatus: (message: string) => void,
    /** `null` means an unsaved, unnamed project. */
    private onNameChange: (name: string | null) => void,
  ) {}

  /** Discards the current project and starts an empty one. */
  newProject(): void {
    this.engine.stop();
    this.engine.assets.clear();
    this.project.load([], []);
    this.current = null;
    this.onNameChange(null);
    this.onStatus('New project');
  }

  async save(saveAs = false): Promise<void> {
    try {
      const saved = await this.platform.saveProject({
        suggestedName: this.current?.name ?? 'Untitled',
        fileExtension: PROJECT_EXTENSION,
        // Save As may move the project, so only a plain Save can safely write paths relative to the folder.
        content: serializeProject(this.project, {
          appName: APP_NAME,
          appVersion: APP_VERSION,
          projectFolder: saveAs ? undefined : this.current?.location,
        }),
        existing: saveAs ? undefined : (this.current ?? undefined),
      });
      if (!saved) {
        this.onStatus('Save cancelled');
        return;
      }
      this.current = saved;
      this.onNameChange(saved.name);
      this.onStatus(`Saved ${saved.location}`);
    } catch (err) {
      this.onStatus(`Save failed: ${(err as Error).message}`);
    }
  }

  /**
   * Copies every audio file that lives outside the project folder into `<project>/Audio/`,
   * points the project at the copies and saves. Needs a saved project (so there is a folder).
   */
  async copyAudioToProject(): Promise<void> {
    const folder = this.current;
    if (!folder) {
      this.onStatus('Save the project first, then copy its audio into the project folder.');
      return;
    }
    let copied = 0;
    let failed = 0;
    for (const asset of this.project.getAssets()) {
      if (!asset.path || relativeToFolder(asset.path, folder.location)) continue; // unknown location, or already inside
      try {
        const dest = await this.platform.copyFileIntoProject(folder, AUDIO_FOLDER, asset.path);
        this.project.setAssetPath(asset.id, dest);
        copied++;
      } catch {
        failed++;
      }
    }
    if (copied > 0) await this.save();
    const parts = [copied > 0 ? `Copied ${copied} audio file(s) to ${AUDIO_FOLDER}/` : 'No audio files needed copying'];
    if (failed > 0) parts.push(`${failed} could not be copied (missing or unreadable)`);
    this.onStatus(`${parts.join('. ')}.`);
  }

  async open(): Promise<void> {
    try {
      const opened = await this.platform.openProject(PROJECT_EXTENSION);
      if (!opened) {
        this.onStatus('Open cancelled');
        return;
      }
      const parsed = parseProject(opened.content);
      this.onStatus(`Opening ${opened.location.name}…`);

      this.engine.stop();
      this.engine.assets.clear();

      // One asset per distinct source file, even if several clips use it.
      const assets = new Map<string, LoadedAsset>();
      const tracks: TrackData[] = [];
      for (const pt of parsed.tracks) {
        const clips: ClipData[] = [];
        for (const pc of pt.clips) {
          const key = pc.source.path ?? pc.source.fileName;
          let asset = assets.get(key);
          if (!asset) {
            asset = await this.loadAsset(pc.source, opened.location.location);
            assets.set(key, asset);
          }
          // The real file may differ from what was saved, so fit the clip to it.
          const sourceDuration = asset.ref.duration;
          const duration = Math.max(0.01, Math.min(pc.duration, sourceDuration - pc.offset));
          const fadeIn = Math.min(pc.fadeIn, duration);
          clips.push({
            assetId: asset.ref.id,
            name: pc.name,
            start: pc.start,
            offset: pc.offset,
            duration,
            sourceDuration,
            fadeIn,
            fadeOut: Math.min(pc.fadeOut, duration - fadeIn),
          });
        }
        tracks.push({ name: pt.name, channels: pt.channels, volume: pt.volume, muted: pt.muted, clips });
      }

      const all = [...assets.values()];
      this.project.load(tracks, all.map((a) => a.ref));
      this.current = opened.location;
      this.onNameChange(opened.location.name);

      const missing = all.filter((a) => !a.loaded).length;
      this.onStatus(
        missing > 0
          ? `Opened ${opened.location.name}. ${missing} audio file(s) not found; those clips are silent.`
          : `Opened ${opened.location.name}`,
      );
    } catch (err) {
      this.onStatus(`Open failed: ${(err as Error).message}`);
    }
  }

  /** Loads the audio, or returns a silent placeholder so the clips (and their data) are kept. */
  private async loadAsset(src: ParsedSource, projectFolder: string): Promise<LoadedAsset> {
    // Audio copied into the project folder is stored relative to it.
    const path = src.path ? resolveInFolder(src.path, projectFolder) : undefined;
    if (path) {
      try {
        const data = await this.platform.readFile(path);
        const a = await this.engine.assets.importBuffer(data);
        return {
          loaded: true,
          ref: {
            id: a.assetId,
            fileName: src.fileName,
            path,
            duration: a.duration,
            sampleRate: a.sampleRate,
            channels: a.channels,
          },
        };
      } catch {
        /* fall through to placeholder */
      }
    }
    return {
      loaded: false,
      ref: {
        id: `missing_${++this.missingSeq}`,
        fileName: src.fileName,
        path,
        duration: src.duration,
        sampleRate: src.sampleRate,
        channels: src.channels,
      },
    };
  }
}
