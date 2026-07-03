# Theme submission

## Theme

- Name:
- Id (folder `themes/<id>/`):
- Type: light / dark
- Author:
- Source / original author (for ports):

## Description

<!-- Briefly describe the theme and any notable palette decisions. -->

## Checklist

- [ ] One theme added or changed in this PR
- [ ] Files live in `themes/<id>/` and `id` matches the folder name
- [ ] `id` is a unique lowercase kebab-case slug
- [ ] `themes/<id>/theme.json` validates against `schema/theme.schema.json`
- [ ] All fifteen colors present as `#RRGGBB`
- [ ] `meta.version` is semantic; `meta.author` is set
- [ ] `themes/<id>/README.md` added (with the `preview@2x.png` image)
- [ ] `themes/<id>/preview@2x.png` added (`node scripts/gen-previews.mjs <id>`)
- [ ] `index.json` entry added (with `path` and `preview`)
- [ ] `node scripts/validate.mjs` reports no errors
- [ ] Original author credited (for ports)
