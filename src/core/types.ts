export type Id = string;

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
  volume: number;
  muted: boolean;
  clips: Clip[];
}
