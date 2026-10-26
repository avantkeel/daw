import { relativeToFolder } from './paths';
import type { Project } from './project';

/** Extension of the project file written inside the project folder. */
export const PROJECT_EXTENSION = '.audioproject';

/**
 * Serializes a Project to XML modelled on the DAWproject standard's project.xml
 * (Application / Transport / Structure / Arrangement). Similar, not fully conformant:
 * no zip container, no metadata.xml, audio is referenced as external files (not embedded).
 * Counterpart for reading: deserialize.ts.
 */

type Attrs = Record<string, string | number | boolean | undefined>;
interface XmlNode {
  tag: string;
  attrs: Attrs;
  children?: XmlNode[];
}

const x = (tag: string, attrs: Attrs = {}, children?: XmlNode[]): XmlNode => ({ tag, attrs, children });

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const num = (n: number): string => {
  const s = String(+n.toFixed(6));
  return s.includes('.') ? s : `${s}.0`;
};

/** Attributes the DAWproject schema types as integers; every other number is written as a decimal. */
const INTEGER_ATTRS = new Set(['audioChannels', 'channels', 'sampleRate', 'numerator', 'denominator']);

const attrValue = (key: string, v: string | number | boolean): string => {
  if (typeof v === 'number') return INTEGER_ATTRS.has(key) ? String(Math.round(v)) : num(v);
  return typeof v === 'boolean' ? String(v) : escapeXml(v);
};

function render(node: XmlNode, depth: number): string {
  const pad = '  '.repeat(depth);
  const attrs = Object.entries(node.attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${attrValue(k, v as string | number | boolean)}"`)
    .join('');
  if (!node.children || node.children.length === 0) return `${pad}<${node.tag}${attrs}/>`;
  const inner = node.children.map((c) => render(c, depth + 1)).join('\n');
  return `${pad}<${node.tag}${attrs}>\n${inner}\n${pad}</${node.tag}>`;
}

export interface SerializeOptions {
  appName: string;
  appVersion: string;
  /** Audio files inside this folder are written as paths relative to it, so the folder can be moved. */
  projectFolder?: string;
}

const filePath = (path: string | undefined, folder: string | undefined): string | undefined =>
  path && folder ? (relativeToFolder(path, folder) ?? path) : path;

export function serializeProject(project: Project, opts: SerializeOptions): string {
  let n = 0;
  const id = () => `id${n++}`;
  const tracks = project.getTracks();
  const masterTrackId = id();
  const masterChannelId = id();

  const trackNodes: XmlNode[] = [];
  const laneNodes: XmlNode[] = [];

  for (const t of tracks) {
    const trackId = id();
    trackNodes.push(
      x('Track', { contentType: 'audio', loaded: true, id: trackId, name: t.name }, [
        x('Channel', { audioChannels: t.channels, destination: masterChannelId, role: 'regular', solo: t.solo, id: id() }, [
          x('Volume', { max: 2, min: 0, unit: 'linear', value: t.volume }),
          x('Pan', { max: 1, min: 0, unit: 'normalized', value: 0.5 }),
          x('Mute', { value: t.muted }),
        ]),
      ]),
    );

    const clips = t.clips.map((c) => {
      const asset = project.getAsset(c.assetId);
      return x(
        'Clip',
        {
          time: c.start,
          duration: c.duration,
          contentTimeUnit: 'seconds',
          playStart: c.offset,
          playStop: c.offset + c.duration,
          fadeTimeUnit: 'seconds',
          fadeInTime: c.fadeIn,
          fadeOutTime: c.fadeOut,
          name: c.name,
        },
        [
          x(
            'Audio',
            {
              algorithm: 'raw',
              channels: asset?.channels ?? 2,
              duration: c.sourceDuration,
              sampleRate: asset?.sampleRate ?? 44100,
              id: id(),
            },
            [x('File', { path: filePath(asset?.path, opts.projectFolder) ?? asset?.fileName ?? c.name, external: true })],
          ),
        ],
      );
    });

    laneNodes.push(x('Lanes', { track: trackId, id: id() }, [x('Clips', { id: id() }, clips)]));
  }

  trackNodes.push(
    x('Track', { contentType: 'audio', loaded: true, id: masterTrackId, name: 'Master' }, [
      x('Channel', { audioChannels: 2, role: 'master', solo: false, id: masterChannelId }, [
        x('Volume', { max: 2, min: 0, unit: 'linear', value: 1 }),
        x('Pan', { max: 1, min: 0, unit: 'normalized', value: 0.5 }),
        x('Mute', { value: false }),
      ]),
    ]),
  );

  const root = x('Project', { version: '1.0' }, [
    x('Application', { name: opts.appName, version: opts.appVersion }),
    x('Transport', {}, [
      x('Tempo', { max: 666, min: 20, unit: 'bpm', value: 120 }),
      x('TimeSignature', { denominator: 4, numerator: 4 }),
    ]),
    x('Structure', {}, trackNodes),
    x('Arrangement', { id: id() }, [x('Lanes', { timeUnit: 'seconds', id: id() }, laneNodes)]),
  ]);

  return `<?xml version="1.0" encoding="UTF-8"?>\n${render(root, 0)}\n`;
}
