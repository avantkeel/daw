import { trackChannelsFor, type ChannelCount } from './types';
import { parseXml, type XmlElement } from './xml';

/** What a project file says about a source audio file. */
export interface ParsedSource {
  fileName: string;
  /** Only set when the file stores an absolute path. */
  path?: string;
  sampleRate: number;
  channels: number;
  duration: number;
}

export interface ParsedClip {
  source: ParsedSource;
  name: string;
  start: number;
  offset: number;
  duration: number;
  fadeIn: number;
  fadeOut: number;
}

export interface ParsedTrack {
  name: string;
  channels: ChannelCount;
  volume: number;
  muted: boolean;
  solo: boolean;
  clips: ParsedClip[];
}

export interface ParsedProject {
  tracks: ParsedTrack[];
}

const child = (el: XmlElement | undefined, tag: string) => el?.children.find((c) => c.tag === tag);

const num = (v: string | undefined, fallback: number): number => {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** Reads the format written by serialize.ts. Throws if the file isn't a project. */
export function parseProject(xml: string): ParsedProject {
  const root = parseXml(xml);
  if (root.tag !== 'Project') throw new Error('Not a valid project file');

  const trackEls = (child(root, 'Structure')?.children ?? []).filter(
    (t) => t.tag === 'Track' && child(t, 'Channel')?.attrs.role !== 'master',
  );

  const lanesByTrack = new Map<string, XmlElement>();
  for (const lane of child(child(root, 'Arrangement'), 'Lanes')?.children ?? []) {
    if (lane.tag === 'Lanes' && lane.attrs.track) lanesByTrack.set(lane.attrs.track, lane);
  }

  const tracks = trackEls.map((t): ParsedTrack => {
    const channel = child(t, 'Channel');
    const clipEls = child(lanesByTrack.get(t.attrs.id ?? ''), 'Clips')?.children ?? [];
    return {
      name: t.attrs.name ?? 'Track',
      // Files written before tracks had a channel count always said 2.
      channels: trackChannelsFor(num(channel?.attrs.audioChannels, 2)),
      volume: num(child(channel, 'Volume')?.attrs.value, 1),
      muted: child(channel, 'Mute')?.attrs.value === 'true',
      solo: channel?.attrs.solo === 'true',
      clips: clipEls.filter((c) => c.tag === 'Clip').flatMap((c) => parseClip(c) ?? []),
    };
  });

  return { tracks };
}

function parseClip(el: XmlElement): ParsedClip | null {
  const audio = child(el, 'Audio');
  const file = child(audio, 'File');
  if (!audio || !file) return null;

  const rawPath = file.attrs.path ?? '';
  const duration = num(el.attrs.duration, 0);
  if (duration <= 0) return null;
  const offset = Math.max(0, num(el.attrs.playStart, 0));
  const fileName = baseName(rawPath) || el.attrs.name || 'audio';

  return {
    source: {
      fileName,
      // A bare file name can't be located reliably, so only keep real paths.
      path: /[\\/]/.test(rawPath) ? rawPath : undefined,
      sampleRate: num(audio.attrs.sampleRate, 44100),
      channels: num(audio.attrs.channels, 2),
      duration: num(audio.attrs.duration, offset + duration),
    },
    name: el.attrs.name ?? fileName,
    start: Math.max(0, num(el.attrs.time, 0)),
    offset,
    duration,
    fadeIn: Math.max(0, num(el.attrs.fadeInTime, 0)),
    fadeOut: Math.max(0, num(el.attrs.fadeOutTime, 0)),
  };
}
