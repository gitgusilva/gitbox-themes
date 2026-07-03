#!/usr/bin/env node
/**
 * Preview generator for the GitBox theme registry.
 *
 * For every theme in `themes/<id>/theme.json` this renders a mockup of the
 * GitBox interface, painted with that theme's tokens, and writes a retina
 * (2x) PNG to `themes/<id>/preview@2x.png`.
 *
 * Rendering is done with headless Chrome so the output matches how the real
 * app draws text, borders and rounded corners. The logical canvas is
 * 720x460 CSS pixels; a device scale factor of 2 produces a 1440x920 image,
 * hence the "@2x" suffix.
 *
 * Usage:
 *   node scripts/gen-previews.mjs            # all themes
 *   node scripts/gen-previews.mjs dracula    # a single theme by id
 *
 * Requirements: a Chrome/Chromium binary. The script tries, in order,
 * $CHROME_BIN, google-chrome, google-chrome-stable, chromium, chromium-browser.
 */
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const THEMES_DIR = join(ROOT, 'themes');

const WIDTH = 720;
const HEIGHT = 460;
const SCALE = 2;

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
  ].filter(Boolean);
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore' });
      return bin;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    'No Chrome/Chromium binary found. Set CHROME_BIN or install Google Chrome / Chromium.',
  );
}

/** Escape a string for safe interpolation inside an HTML text node. */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Build the HTML for one theme's preview. The layout mirrors GitBox: a title
 * bar, a sidebar with branches, a commit list with a graph, and a diff panel
 * showing added / removed / modified lines, plus a palette strip.
 */
function html(theme) {
  const c = theme.colors;
  const t = theme.typography;
  const swatches = Object.entries(c)
    .map(
      ([, hex]) =>
        `<div class="sw" style="background:${hex}"></div>`,
    )
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { width:${WIDTH}px; height:${HEIGHT}px; overflow:hidden; }
    body {
      font-family:${t.uiFont};
      font-size:${t.uiFontSize}px;
      color:${c.text};
      background:${c.bg};
      display:flex; flex-direction:column;
      -webkit-font-smoothing:antialiased;
    }
    .mono { font-family:${t.monoFont}; }
    /* title bar */
    .titlebar {
      height:34px; flex:0 0 auto; display:flex; align-items:center; gap:8px;
      padding:0 12px; background:${c.bgElevated};
      border-bottom:1px solid ${c.border}; color:${c.textMuted};
    }
    .dot { width:11px; height:11px; border-radius:50%; }
    .title { margin-left:6px; color:${c.textStrong}; font-weight:600; }
    .spacer { flex:1; }
    .btn {
      background:${c.accent}; color:${c.accentFg};
      padding:4px 12px; border-radius:${t.radius}px; font-weight:600; font-size:12px;
    }
    .btn.ghost { background:${c.surfaceHover}; color:${c.text}; }
    /* body */
    .body { flex:1; display:flex; min-height:0; }
    /* sidebar */
    .side {
      width:180px; flex:0 0 auto; background:${c.bgElevated};
      border-right:1px solid ${c.border}; padding:10px 0;
    }
    .side .h {
      padding:4px 14px; color:${c.textMuted}; font-size:11px;
      text-transform:uppercase; letter-spacing:.06em;
    }
    .row { padding:5px 14px; display:flex; align-items:center; gap:8px; }
    .row.sel { background:${c.surfaceHover}; }
    .row.sel .lbl { color:${c.textStrong}; font-weight:600; }
    .lbl { color:${c.text}; }
    .chip { width:8px; height:8px; border-radius:2px; }
    /* main */
    .main { flex:1; min-width:0; display:flex; flex-direction:column; }
    .commits {
      flex:0 0 auto; height:150px; border-bottom:1px solid ${c.border};
      padding:8px 0; overflow:hidden;
    }
    .commit { display:flex; align-items:center; gap:10px; padding:4px 14px; }
    .commit.sel { background:${c.surfaceHover}; }
    .node { width:10px; height:10px; border-radius:50%; background:${c.accent}; flex:0 0 auto; }
    .csub { color:${c.text}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; }
    .commit.sel .csub { color:${c.textStrong}; }
    .cmeta { color:${c.textMuted}; font-size:11px; flex:0 0 auto; }
    /* diff */
    .diff { flex:1; background:${c.bgOverlay}; padding:8px 0; overflow:hidden; font-size:12px; }
    .dl { padding:1px 14px; white-space:pre; }
    .dl.add { background:${hexA(c.added, 0.16)}; color:${c.added}; }
    .dl.del { background:${hexA(c.removed, 0.16)}; color:${c.removed}; }
    .dl.mod { color:${c.modified}; }
    .dl.ctx { color:${c.textMuted}; }
    .gutter { color:${c.textMuted}; display:inline-block; width:26px; }
    /* palette */
    .palette { flex:0 0 auto; display:flex; height:22px; }
    .sw { flex:1; }
  </style></head><body>
    <div class="titlebar">
      <div class="dot" style="background:${c.removed}"></div>
      <div class="dot" style="background:${c.modified}"></div>
      <div class="dot" style="background:${c.added}"></div>
      <span class="title">${esc(theme.name)}</span>
      <span style="color:${c.textMuted}">— gitbox</span>
      <span class="spacer"></span>
      <span class="btn ghost">Fetch</span>
      <span class="btn">Push</span>
    </div>
    <div class="body">
      <div class="side">
        <div class="h">Branches</div>
        <div class="row sel"><span class="chip" style="background:${c.accent}"></span><span class="lbl">main</span></div>
        <div class="row"><span class="chip" style="background:${c.modified}"></span><span class="lbl">develop</span></div>
        <div class="row"><span class="chip" style="background:${c.added}"></span><span class="lbl">feature/themes</span></div>
        <div class="h" style="margin-top:8px">Changes</div>
        <div class="row"><span class="chip" style="background:${c.added}"></span><span class="lbl mono">theme.json</span></div>
        <div class="row"><span class="chip" style="background:${c.modified}"></span><span class="lbl mono">README.md</span></div>
        <div class="row"><span class="chip" style="background:${c.removed}"></span><span class="lbl mono">old.css</span></div>
      </div>
      <div class="main">
        <div class="commits">
          <div class="commit sel"><span class="node"></span><span class="csub">feat(theme): add ${esc(theme.name)} palette</span><span class="cmeta">2m ago</span></div>
          <div class="commit"><span class="node" style="background:${c.modified}"></span><span class="csub">refactor: tokenize surfaces</span><span class="cmeta">1h ago</span></div>
          <div class="commit"><span class="node" style="background:${c.textMuted}"></span><span class="csub">docs: update contributing guide</span><span class="cmeta">3h ago</span></div>
          <div class="commit"><span class="node" style="background:${c.added}"></span><span class="csub">chore: bump version to 1.0.0</span><span class="cmeta">1d ago</span></div>
        </div>
        <div class="diff mono">
          <div class="dl ctx"><span class="gutter">12</span> "colors": {</div>
          <div class="dl del"><span class="gutter">-</span>   "accent": "#888888",</div>
          <div class="dl add"><span class="gutter">+</span>   "accent": "${esc(c.accent)}",</div>
          <div class="dl add"><span class="gutter">+</span>   "accentHover": "${esc(c.accentHover)}",</div>
          <div class="dl mod"><span class="gutter">~</span>   "text": "${esc(c.text)}",</div>
          <div class="dl ctx"><span class="gutter">16</span>   "added": "${esc(c.added)}"</div>
          <div class="dl ctx"><span class="gutter">17</span> }</div>
        </div>
        <div class="palette">${swatches}</div>
      </div>
    </div>
  </body></html>`;
}

/** #RRGGBB + alpha -> rgba() string, for tinted diff backgrounds. */
function hexA(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function render(chrome, theme, outPng) {
  const dir = mkdtempSync(join(tmpdir(), 'gbx-preview-'));
  const htmlPath = join(dir, `${theme.id}.html`);
  writeFileSync(htmlPath, html(theme));
  try {
    execFileSync(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--default-background-color=00000000',
        `--force-device-scale-factor=${SCALE}`,
        `--window-size=${WIDTH},${HEIGHT}`,
        `--screenshot=${outPng}`,
        `file://${htmlPath}`,
      ],
      { stdio: 'ignore' },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const chrome = findChrome();
  const only = process.argv[2];
  const ids = readdirSync(THEMES_DIR).filter((d) =>
    existsSync(join(THEMES_DIR, d, 'theme.json')),
  );
  const targets = only ? ids.filter((id) => id === only) : ids;
  if (only && targets.length === 0) {
    console.error(`No theme with id "${only}".`);
    process.exit(1);
  }
  for (const id of targets.sort()) {
    const theme = JSON.parse(readFileSync(join(THEMES_DIR, id, 'theme.json'), 'utf8'));
    const out = join(THEMES_DIR, id, 'preview@2x.png');
    render(chrome, theme, out);
    console.log(`rendered ${id} -> themes/${id}/preview@2x.png`);
  }
}

main();
