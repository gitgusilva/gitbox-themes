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
 *   - all fifteen color tokens present as #RRGGBB
 *   - typography fields present and within bounds
 *   - meta.version is semantic; meta.author present
 *   - README.md and preview@2x.png exist alongside it
 * And, for `index.json`:
 *   - every theme folder has an index entry and vice versa
 *   - each entry's `path` and `preview` resolve to the right files
 *
 * Usage: node scripts/validate.mjs
 * Exits with a non-zero status when any check fails.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEMES_DIR = join(ROOT, 'themes');

const COLOR_KEYS = [
  'bg', 'bgElevated', 'bgOverlay', 'surfaceHover',
  'border', 'borderStrong',
  'textStrong', 'text', 'textMuted',
  'accent', 'accentHover', 'accentFg',
  'added', 'removed', 'modified',
];
const TYPO_BOUNDS = {
  uiFontSize: [10, 20],
  editorFontSize: [9, 24],
  editorLineHeight: [0, 40],
  radius: [0, 20],
};
const HEX = /^#[0-9A-Fa-f]{6}$/;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

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

  const typo = theme.typography ?? {};
  for (const [key, [min, max]] of Object.entries(TYPO_BOUNDS)) {
    const v = typo[key];
    if (typeof v !== 'number' || v < min || v > max) fail(where, `typography.${key} must be an integer in [${min}, ${max}]`);
  }
  for (const key of ['uiFont', 'monoFont', 'editorFont']) {
    if (typeof typo[key] !== 'string' || !typo[key]) fail(where, `typography.${key} is required`);
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
    if (!existsSync(join(dir, 'preview@2x.png'))) fail(`themes/${id}`, 'missing preview@2x.png');

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

  // index.json <-> themes/ consistency
  let index;
  try {
    index = readJson(join(ROOT, 'index.json'));
  } catch (e) {
    fail('index.json', `invalid JSON: ${e.message}`);
    report();
    return;
  }

  const indexed = new Map((index.themes ?? []).map((t) => [t.id, t]));
  const folderIds = new Set(ids.filter((id) => existsSync(join(THEMES_DIR, id, 'theme.json'))));

  for (const id of folderIds) {
    if (!indexed.has(id)) fail('index.json', `missing entry for theme "${id}"`);
  }
  for (const entry of index.themes ?? []) {
    if (!folderIds.has(entry.id)) fail('index.json', `entry "${entry.id}" has no matching folder in themes/`);
    if (entry.path !== `themes/${entry.id}/theme.json`) fail('index.json', `entry "${entry.id}" path should be "themes/${entry.id}/theme.json"`);
    if (entry.preview !== `themes/${entry.id}/preview@2x.png`) fail('index.json', `entry "${entry.id}" preview should be "themes/${entry.id}/preview@2x.png"`);
  }

  report();
}

function report() {
  if (errors.length === 0) {
    console.log('OK: all themes and the registry index are valid.');
    process.exit(0);
  }
  console.error(`Found ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

main();
