export type Id = string;

/** A track is either mono (1) or stereo (2). */
export type ChannelCount = 1 | 2;

/** Mono sources give mono tracks; stereo and anything wider (5.1, ...) give stereo tracks. */
export const trackChannelsFor = (sourceChannels: number): ChannelCount => (sourceChannels <= 1 ? 1 : 2);

export interface Clip {
  id: Id;
  assetId: Id;
  name: string;
  /** Position on the timeline (seconds). */
  start: number;
  /** In-point inside the source audio (seconds). */
  offset: number;
  /** Length on the timeline (seconds). */
  duration: number;
  /** Full length of the source audio (seconds). */
  sourceDuration: number;
  fadeIn: number;
  fadeOut: number;
}

export interface Track {
  id: Id;
  name: string;
  channels: ChannelCount;
  volume: number;
  muted: boolean;
  clips: Clip[];
}

/** Describes a source audio file. The audio data itself lives in audio/AssetStore. */
export interface AssetRef {
  id: Id;
  fileName: string;
  duration: number;
  sampleRate: number;
  channels: number;
  /** Absolute path of the original file, when the host could tell us. */
  path?: string;
}

/** A clip without its id, used when loading a project. */
export type ClipData = Omit<Clip, 'id'>;

export interface TrackData {
  name: string;
  channels: ChannelCount;
  volume: number;
  muted: boolean;
  clips: ClipData[];
}
