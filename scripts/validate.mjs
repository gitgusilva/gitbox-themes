#!/usr/bin/env node
/**
 * Dependency-free validator for the GitBox theme registry.
 *
 * Each theme lives in its own folder: `themes/<id>/`, containing
 *   - theme.json      the theme definition (required)
 *   - README.md       the theme's page (required)
 *   - preview@2x.png  the retina preview image (required)
 *
 * For every `themes/<id>/theme.json` this checks:
 *   - valid JSON and required top-level fields
 *   - id matches the folder name and the slug pattern
 *   - type is "light" or "dark"
 *   - all twenty-four color tokens present as #RRGGBB
 *   - graphMarker equals bg (the merge glyph is a cut-out of the background)
 *   - the eight graph lanes are all different from one another
 *   - typography fields present and within bounds
 *   - meta.version is semantic; meta.author present
 *   - README.md and preview@2x.png exist alongside it
 *
 * The registry is folder-driven: there is no index file to keep in sync. The
 * app discovers themes by listing the `themes/` directory, so adding a theme is
 * just adding a folder.
 *
 * Usage: node scripts/validate.mjs
 * Exits with a non-zero status when any check fails.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEMES_DIR = join(ROOT, 'themes');

const BASE_COLOR_KEYS = [
  'bg', 'bgElevated', 'bgOverlay', 'surfaceHover',
  'border', 'borderStrong',
  'textStrong', 'text', 'textMuted',
  'accent', 'accentHover', 'accentFg',
  'added', 'removed', 'modified',
];
/**
 * The eight commit-graph lanes. Required, not optional: a theme that omits them
 * falls back to one fixed palette, which made the graph look identical under
 * every theme and put lanes tuned for #1E1E1E on white backgrounds.
 */
const LANE_KEYS = ['graph1', 'graph2', 'graph3', 'graph4', 'graph5', 'graph6', 'graph7', 'graph8'];
const COLOR_KEYS = [...BASE_COLOR_KEYS, ...LANE_KEYS, 'graphMarker'];
const TYPO_BOUNDS = {
  uiFontSize: [10, 20],
  editorFontSize: [9, 24],
  editorLineHeight: [0, 40],
  radius: [0, 20],
};
const HEX = /^#[0-9A-Fa-f]{6}$/;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

// Every preview must be the retina image produced by scripts/gen-previews.mjs
// (720x460 logical at a 2x device scale). This makes the generated preview
// mandatory: an ad-hoc or wrong-sized screenshot fails validation.
const PREVIEW_W = 1440;
const PREVIEW_H = 920;

const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function validateTheme(id, theme) {
  const where = `themes/${id}/theme.json`;

  if (!SLUG.test(theme.id ?? '')) fail(where, `invalid id "${theme.id}" (expected kebab-case slug)`);
  if (theme.id !== id) fail(where, `id "${theme.id}" does not match folder name "${id}"`);
  if (!theme.name) fail(where, 'missing name');
  if (theme.type !== 'light' && theme.type !== 'dark') fail(where, `type must be "light" or "dark", got "${theme.type}"`);

  if (!theme.meta || !SEMVER.test(theme.meta.version ?? '')) fail(where, 'meta.version must be semantic (MAJOR.MINOR.PATCH)');
  if (!theme.meta?.author) fail(where, 'meta.author is required');

  const colors = theme.colors ?? {};
  for (const key of COLOR_KEYS) {
    if (!(key in colors)) fail(where, `missing color "${key}"`);
    else if (!HEX.test(colors[key])) fail(where, `color "${key}" must be #RRGGBB, got "${colors[key]}"`);
  }
  for (const key of Object.keys(colors)) {
    if (!COLOR_KEYS.includes(key)) fail(where, `unknown color "${key}"`);
  }

  // The merge glyph is drawn as a cut-out of the background: GitBox rings the
  // commit dot with --gb-bg and stamps the marker inside it. A marker of any
  // other colour stops reading as a cut-out and shows up as a blob.
  if (HEX.test(colors.graphMarker ?? '') && HEX.test(colors.bg ?? '')
      && colors.graphMarker.toUpperCase() !== colors.bg.toUpperCase()) {
    fail(where, `graphMarker must equal bg (${colors.bg}), got "${colors.graphMarker}"`);
  }

  // Eight lanes that repeat a colour make two branches indistinguishable in the
  // graph, which is the one thing the lane palette exists to prevent.
  const lanes = LANE_KEYS.map((k) => colors[k]).filter((v) => HEX.test(v ?? '')).map((v) => v.toUpperCase());
  if (lanes.length === LANE_KEYS.length && new Set(lanes).size !== LANE_KEYS.length) {
    const dupes = [...new Set(lanes.filter((v, i) => lanes.indexOf(v) !== i))];
    fail(where, `the 8 graph lanes must all differ; repeated: ${dupes.join(', ')}`);
  }

  const typo = theme.typography ?? {};
  for (const [key, [min, max]] of Object.entries(TYPO_BOUNDS)) {
    const v = typo[key];
    if (typeof v !== 'number' || v < min || v > max) fail(where, `typography.${key} must be an integer in [${min}, ${max}]`);
  }
  for (const key of ['uiFont', 'monoFont', 'editorFont']) {
    if (typeof typo[key] !== 'string' || !typo[key]) fail(where, `typography.${key} is required`);
  }
}

/** Validate that preview@2x.png exists and is a PNG of the exact retina size. */
function checkPreview(id, path) {
  if (!existsSync(path)) {
    fail(`themes/${id}`, 'missing preview@2x.png (run: node scripts/gen-previews.mjs ' + id + ')');
    return;
  }
  let buf;
  try {
    buf = readFileSync(path);
  } catch (e) {
    fail(`themes/${id}/preview@2x.png`, `unreadable: ${e.message}`);
    return;
  }
  // PNG signature + IHDR: width at byte 16, height at byte 20 (uint32 big-endian).
  const isPng = buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (!isPng) {
    fail(`themes/${id}/preview@2x.png`, 'not a PNG file');
    return;
  }
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w !== PREVIEW_W || h !== PREVIEW_H) {
    fail(`themes/${id}/preview@2x.png`, `must be ${PREVIEW_W}x${PREVIEW_H} (generated by gen-previews.mjs), got ${w}x${h}`);
  }
}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function main() {
  const ids = readdirSync(THEMES_DIR)
    .filter((d) => isDir(join(THEMES_DIR, d)))
    .sort();
  const seenIds = new Set();

  for (const id of ids) {
    const dir = join(THEMES_DIR, id);
    const themePath = join(dir, 'theme.json');

    if (!existsSync(themePath)) {
      fail(`themes/${id}`, 'missing theme.json');
      continue;
    }
    if (!existsSync(join(dir, 'README.md'))) fail(`themes/${id}`, 'missing README.md');
    checkPreview(id, join(dir, 'preview@2x.png'));

    let theme;
    try {
      theme = readJson(themePath);
    } catch (e) {
      fail(`themes/${id}/theme.json`, `invalid JSON: ${e.message}`);
      continue;
    }
    if (seenIds.has(theme.id)) fail(`themes/${id}/theme.json`, `duplicate id "${theme.id}"`);
    seenIds.add(theme.id);
    validateTheme(id, theme);
  }

  report();
}

function report() {
  if (errors.length === 0) {
    console.log('OK: all themes are valid.');
    process.exit(0);
  }
  console.error(`Found ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

main();
