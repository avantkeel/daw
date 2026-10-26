import { fadeGainAt } from '../core/fades';
import type { Track } from '../core/types';
import type { AssetStore } from './assets';

export interface ScheduledPlayback {
  stop(): void;
}

/**
 * Turns project data into Web Audio nodes. Used for both live playback
 * (AudioContext) and export (OfflineAudioContext).
 *
 * `from`: timeline position (s) to start at. `when`: context time (s) that maps to `from`.
 */
export function scheduleProject(
  ctx: BaseAudioContext,
  destination: AudioNode,
  tracks: readonly Track[],
  assets: AssetStore,
  from: number,
  when: number,
): ScheduledPlayback {
  const sources: AudioBufferSourceNode[] = [];
  const nodes: AudioNode[] = [];
  const T = (timelineTime: number) => when + (timelineTime - from);
  const hasSolo = tracks.some((track) => track.solo);

  for (const track of tracks) {
    if (track.muted || (hasSolo && !track.solo)) continue;
    const trackGain = ctx.createGain();
    trackGain.gain.value = track.volume;
    // Fixes the track's channel layout: stereo clips on a mono track are downmixed,
    // mono clips on a stereo track are centred. Mono tracks reach the master as dual-mono.
    trackGain.channelCount = track.channels;
    trackGain.channelCountMode = 'explicit';
    trackGain.channelInterpretation = 'speakers';
    trackGain.connect(destination);
    nodes.push(trackGain);

    for (const clip of track.clips) {
      const end = clip.start + clip.duration;
      if (end <= from) continue;
      const buffer = assets.getBuffer(clip.assetId);
      if (!buffer) continue;

      const skip = Math.max(0, from - clip.start); // seconds already "played" when starting mid-clip
      const t0 = T(clip.start + skip);

      const gain = ctx.createGain();
      gain.connect(trackGain);
      nodes.push(gain);
      const g = gain.gain;

      g.setValueAtTime(fadeGainAt(clip, skip), t0);
      if (clip.fadeIn > skip) g.linearRampToValueAtTime(1, T(clip.start + clip.fadeIn));
      if (clip.fadeOut > 0) {
        const fadeOutStart = clip.duration - clip.fadeOut;
        if (fadeOutStart > skip) g.setValueAtTime(1, T(clip.start + fadeOutStart));
        g.linearRampToValueAtTime(0, T(end));
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(gain);
      src.start(t0, clip.offset + skip, clip.duration - skip);
      sources.push(src);
    }
  }

  return {
    stop() {
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
        s.disconnect();
      }
      nodes.forEach((n) => n.disconnect());
    },
  };
}
