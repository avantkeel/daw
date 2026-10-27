import { Emitter } from "./core/emitter";
import type { Id } from "./core/types";
import { createPlatform } from "./platform-factory";
import type { MixerAction, MixerState } from "./platform/platform";
import { byId } from "./ui/dom";
import { Mixer, type MixerProject, type MixerTrack } from "./ui/mixer";

class RemoteMixerProject implements MixerProject {
  readonly changed = new Emitter();
  private tracks: MixerTrack[] = [];

  constructor(private send: (action: MixerAction) => void) {}

  getTracks(): readonly MixerTrack[] {
    return this.tracks;
  }

  update(state: MixerState): void {
    const changed =
      this.tracks.length !== state.tracks.length ||
      this.tracks.some((track, index) => {
        const next = state.tracks[index];
        return (
          track.id !== next.id ||
          track.name !== next.name ||
          track.channels !== next.channels ||
          track.volume !== next.volume ||
          track.muted !== next.muted ||
          track.solo !== next.solo
        );
      });
    this.tracks = state.tracks;
    if (changed) this.changed.emit();
  }

  setVolume(trackId: Id, volume: number): void {
    this.send({ type: "set-volume", trackId, volume });
  }

  setMuted(trackId: Id, muted: boolean): void {
    this.send({ type: "set-muted", trackId, muted });
  }

  setSolo(trackId: Id, solo: boolean): void {
    this.send({ type: "set-solo", trackId, solo });
  }

  beginBatch(): void {
    this.send({ type: "begin-batch" });
  }

  endBatch(): void {
    this.send({ type: "end-batch" });
  }
}

export function bootstrapMixer(): void {
  const platform = createPlatform();
  const project = new RemoteMixerProject((action) =>
    platform.sendMixerAction(action),
  );
  let mixer: Mixer | undefined;
  let levels = new Map<Id, number>();

  platform.onMixerState((state) => {
    project.update(state);
    levels = new Map(Object.entries(state.levels));
    if (!mixer) mixer = new Mixer(byId("mixer"), project, () => levels);
  });
  platform.notifyMixerReady();
}
