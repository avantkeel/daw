/** Path string helpers for project files. Pure string work, no Node. */

const normalize = (p: string) => p.replace(/\\/g, "/");
const isAbsolute = (p: string) => /^([A-Za-z]:)?[\\/]/.test(p);

/** If `path` is inside `folder`, returns it relative to `folder` (with `/`). Otherwise undefined. */
export function relativeToFolder(
  path: string,
  folder: string,
): string | undefined {
  const prefix = `${normalize(folder).replace(/\/+$/, "")}/`;
  const p = normalize(path);
  return p.startsWith(prefix) && p.length > prefix.length
    ? p.slice(prefix.length)
    : undefined;
}

/** Turns a path stored in a project file into one the host can read: relative paths are placed inside `folder`. */
export function resolveInFolder(path: string, folder: string): string {
  if (isAbsolute(path)) return path;
  return `${folder.replace(/[\\/]+$/, "")}/${path}`;
}
