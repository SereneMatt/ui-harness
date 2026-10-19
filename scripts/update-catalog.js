import { writeFile } from 'node:fs/promises';

const revision = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(revision || '')) throw new Error('Pass a reviewed, full Chromium DevTools commit SHA.');
const path = 'front_end/models/emulation/EmulatedDevices.ts';
const response = await fetch(`https://raw.githubusercontent.com/ChromeDevTools/devtools-frontend/${revision}/${path}`);
if (!response.ok) throw new Error(`Catalog download failed: ${response.status}`);
const source = await response.text();
const contents = source.split('// DEVICE-LIST-BEGIN')[1]?.split('// DEVICE-LIST-END')[0];
if (!contents) throw new Error('Chromium device-list markers changed. Review the importer.');
const orientations = [...contents.matchAll(/'(?:horizontal|vertical)(?:-spanned)?':\s*\{\s*'width':\s*(\d+),\s*'height':\s*(\d+)/g)];
const expected = [...contents.matchAll(/'(?:horizontal|vertical)(?:-spanned)?':\s*\{/g)].length;
if (orientations.length === 0 || orientations.length !== expected) throw new Error('An orientation could not be parsed. Review the upstream format.');
const unique = new Map(orientations.map(([, width, height]) => [`${width}x${height}`, { width: Number(width), height: Number(height) }]));
const viewports = [...unique.values()].sort((a, b) => a.width - b.width || a.height - b.height);
const license = await fetch(`https://raw.githubusercontent.com/ChromeDevTools/devtools-frontend/${revision}/LICENSE`);
if (!license.ok) throw new Error('Could not fetch the upstream license.');
const notice = `Chromium DevTools viewport catalog\nSource revision: ${revision}\n\n${await license.text()}`;
await writeFile(new URL('../THIRD_PARTY_NOTICES', import.meta.url), notice);
await writeFile(new URL('../data/chromium-viewports.json', import.meta.url), `${JSON.stringify({
  source: `https://github.com/ChromeDevTools/devtools-frontend/blob/${revision}/${path}`, revision, viewports,
}, null, 2)}\n`);
process.stdout.write(`Imported ${viewports.length} unique sizes from ${orientations.length} orientations.\n`);
