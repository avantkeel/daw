import type { Clip } from "./types";

/** Gain (0..1) of a clip's fades at `localTime` seconds after the clip's start. */
export function fadeGainAt(clip: Clip, localTime: number): number {
  let g = 1;
  if (clip.fadeIn > 0 && localTime < clip.fadeIn)
    g = Math.min(g, localTime / clip.fadeIn);
  const outStart = clip.duration - clip.fadeOut;
  if (clip.fadeOut > 0 && localTime > outStart)
    g = Math.min(g, (clip.duration - localTime) / clip.fadeOut);
  return Math.max(0, Math.min(1, g));
}
