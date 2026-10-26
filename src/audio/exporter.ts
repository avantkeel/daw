import type { Project } from "../core/project";
import type { AssetStore } from "./assets";
import { scheduleProject } from "./scheduler";
import { encodeWav } from "./wav";

export async function renderToWav(
  project: Project,
  assets: AssetStore,
  sampleRate: number,
): Promise<ArrayBuffer> {
  const length = Math.max(1, Math.ceil(project.duration() * sampleRate));
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  scheduleProject(ctx, ctx.destination, project.getTracks(), assets, 0, 0);
  const rendered = await ctx.startRendering();
  return encodeWav(rendered);
}
