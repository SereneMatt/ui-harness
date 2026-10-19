export interface Viewport {
  width: number;
  height: number;
}

export interface WorkspaceSettings {
  version: 1;
  url: string;
  viewports: Viewport[];
  scale: 'fit' | number;
}

export const defaultViewports: Viewport[] = [
  { width: 390, height: 664 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
];

export function normalizeUrl(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) throw new Error('Enter a development URL.');
  const value = input.trim();
  const url = new URL(value.includes('://') ? value : `http://${value}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use an HTTP or HTTPS URL without embedded credentials.');
  }
  return url.href;
}

export function parseViewport(input: unknown): Viewport {
  const value = input as Partial<Viewport> | null;
  if (!value || ![value.width, value.height].every(dimension => typeof dimension === 'number' && Number.isInteger(dimension) && dimension >= 1 && dimension <= 10000)) {
    throw new Error('Viewport width and height must be whole numbers between 1 and 10000.');
  }
  return { width: value.width, height: value.height } as Viewport;
}

export function viewportKey({ width, height }: Viewport): string {
  return `${width}x${height}`;
}

export function parseSettings(input: unknown): WorkspaceSettings {
  const value = input as Partial<WorkspaceSettings> | null;
  if (!value || value.version !== 1) throw new Error('Expected a version 1 UI harness configuration.');
  if (!Array.isArray(value.viewports) || value.viewports.length < 1 || value.viewports.length > 128) {
    throw new Error('Select between 1 and 128 viewports.');
  }
  const viewports = value.viewports.map(parseViewport);
  if (new Set(viewports.map(viewportKey)).size !== viewports.length) throw new Error('Each viewport must have unique dimensions.');
  if (value.scale !== 'fit' && !(typeof value.scale === 'number' && value.scale >= 0.1 && value.scale <= 1)) {
    throw new Error('Scale must be "fit" or a number between 0.1 and 1.');
  }
  return { version: 1, url: normalizeUrl(value.url), viewports, scale: value.scale };
}
