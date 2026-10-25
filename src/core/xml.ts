export interface XmlElement {
  tag: string;
  attrs: Record<string, string>;
  children: XmlElement[];
}

const unescapeXml = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const TOKEN = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
const ATTR = /([\w:.-]+)\s*=\s*"([^"]*)"/g;

/**
 * Tiny XML parser, just enough for our own project files:
 * elements and double-quoted attributes. Text nodes, CDATA and namespaces are ignored.
 */
export function parseXml(text: string): XmlElement {
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;

  for (const m of text.matchAll(TOKEN)) {
    const [, closing, tag, rawAttrs, selfClosing] = m;
    if (tag === undefined) continue; // declaration or comment

    if (closing) {
      const open = stack.pop();
      if (!open || open.tag !== tag) throw new Error(`Invalid XML: unexpected </${tag}>`);
      continue;
    }

    const attrs: Record<string, string> = {};
    for (const a of rawAttrs.matchAll(ATTR)) attrs[a[1]] = unescapeXml(a[2]);
    const el: XmlElement = { tag, attrs, children: [] };

    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(el);
    else if (!root) root = el;
    else throw new Error('Invalid XML: multiple root elements');

    if (!selfClosing) stack.push(el);
  }

  if (!root || stack.length > 0) throw new Error('Invalid XML');
  return root;
}
