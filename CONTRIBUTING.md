# Contributing a theme

Thank you for contributing to GitBox Themes. This document defines how themes are
submitted and reviewed. Pull requests that do not follow these rules will be asked
for changes before review.

## Scope

- This repository accepts **theme files only**. Application code, tooling changes,
  and unrelated edits belong in the main GitBox repository.
- **One theme per pull request.** A PR that adds or changes more than one theme
  will be split.

## Requirements

A submission is accepted only when all of the following hold:

1. **Folder location.** The theme lives in its own folder `themes/<id>/`, where
   `<id>` matches the theme's `id` field. The folder contains `theme.json`,
   `README.md`, and `preview@2x.png`.
2. **Identifier.** `id` is a unique, lowercase kebab-case slug (`^[a-z0-9][a-z0-9-]*$`).
   It must not collide with an existing theme id.
3. **Schema.** `theme.json` validates against [`schema/theme.schema.json`](schema/theme.schema.json).
4. **Colors.** All fifteen color tokens are present and are solid `#RRGGBB` values.
   Do not use alpha, `rgb()`, `hsl()`, or named colors. Transparency is applied by
   the app, never stored in a theme.
5. **Metadata.** `meta.version` follows semantic versioning (`MAJOR.MINOR.PATCH`).
   `meta.author` is required. `meta.authorEmail` and `meta.description` are optional
   but encouraged.
6. **Typography.** Keep the default typography unless the theme deliberately ships a
   font choice. Font sizes must stay within the schema bounds.
7. **Preview.** `preview@2x.png` is **required**. It is derived from the palette,
   so do not hand-edit or hand-make it. You have two options:
   - **Let CI generate it.** Open the pull request from a branch in this repository
     and the `Regenerate previews` workflow builds and commits the image for you —
     no local Chrome needed. (For pull requests from a fork, enable "Allow edits by
     maintainers" so a maintainer can add it, or generate it locally as below.)
   - **Generate it locally** with `node scripts/gen-previews.mjs <id>` (needs Google
     Chrome or Chromium). The validator enforces the exact retina size (1440x920),
     so an ad-hoc screenshot will fail.
8. **README.** `README.md` includes the theme name, the `preview@2x.png` image, and a
   short description. Copy the structure of an existing theme's README.
9. **Validation passes.** Run `node scripts/validate.mjs` locally; it must report no
   errors. CI runs the same check.

There is no index file to edit. The registry is folder-driven: the app discovers
themes by listing the `themes/` directory, so adding a folder is all it takes.

## Naming conventions

- `id`: kebab-case slug, e.g. `solarized-light`, `one-dark-pro`.
- `name`: human-readable display name, e.g. `Solarized Light`.
- Folder name: `themes/<id>/`; theme file: `themes/<id>/theme.json`.

## Quality guidelines

- **Readability first.** Body text (`text` on `bg`) should meet WCAG AA contrast
  (4.5:1). Muted text should remain legible.
- **Distinct git colors.** `added`, `removed`, and `modified` must be clearly
  distinguishable from each other and from `text`.
- **Consistent surfaces.** `bg` < `bgElevated` < `bgOverlay` should read as a
  coherent elevation scale for the theme's `type`.
- **Accent contrast.** `accentFg` must be legible on top of `accent`.

## Derivative and third-party themes

If your theme is a port of an existing theme, credit the original author in
`meta.author` and mention the source in the pull request description. Only submit
themes you have the right to distribute under this repository's license.

## Submission checklist

Copy this into your pull request description and tick each item:

- [ ] One theme added or changed in this PR
- [ ] Files live in `themes/<id>/` and `id` matches the folder name
- [ ] `id` is a unique lowercase kebab-case slug
- [ ] `theme.json` validates against `schema/theme.schema.json`
- [ ] All fifteen colors present as `#RRGGBB`
- [ ] `meta.version` is semantic; `meta.author` is set
- [ ] `README.md` and `preview@2x.png` added
- [ ] `node scripts/validate.mjs` reports no errors
- [ ] Original author credited (for ports)

## Review process

1. Automated validation (schema + folder structure + color format) runs on every PR.
2. A maintainer reviews contrast, palette coherence, and metadata.
3. Once approved and green, a maintainer merges. Merged themes appear in the app's
   theme repository automatically.

## Updating an existing theme

Keep the same `id`, bump `meta.version` (patch for tweaks, minor for palette
changes), and describe the change in the pull request. Re-importing a theme with the
same `id` updates it in place inside the app.

## License

By submitting a theme you agree to license it under this repository's
[MIT License](LICENSE).
