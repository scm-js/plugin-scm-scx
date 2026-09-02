# scmscx.com plugin

A plugin for [scmJS](https://github.com/jeany55/scm-js), the browser-based StarCraft 1 /
Brood War map editor. It searches [scmscx.com](https://scmscx.com), an archive of
StarCraft maps, from inside the editor and opens the map you pick. The plugin talks to
scmscx.com and to nothing else; the two menu items it adds carry its mark (a magnifier
over a map tile, in teal) so it is plain which entries leave the browser.

## Install

In scmJS: **Plugins ▸ Manage Plugins…**, paste

```
https://github.com/scm-js/plugin-scm-scx
```

and press **Add**. It is in that list by default. To pin a version, add a ref:
`github:scm-js/plugin-scm-scx@v1.0.0`.

## What it adds

- **File ▸ Find on scmscx.com…** (under Open Recent). The dialog opens on the newest
  uploads. Type to search scenario names, file names, descriptions, unit and force names
  (the same search as the site's own page, with its sort orders); filter by tileset, human
  player count and minimum size; *More…* chooses which text is matched and whether maps
  the site marks as broken, outdated or unfinished are included. Pick a map to see its
  minimap and details: files, size and tileset, players, game version, triggers, units
  and other objects, EUD use, upload and download counts, the description and the
  forces. **Open** downloads it and opens it in the editor (a modified map goes through
  the usual Close Scenario question first). **Random** picks one map among the matches.
  Pasting a map address from the site (`https://scmscx.com/map/…`) shows that map.
- **Plugins ▸ scmscx.com Settings…**. An optional forwarder address, and a test.

## Reaching the site

Requests go to `https://scmscx.com` directly. Its API sends no CORS header, so a browser
lets only pages served from scmscx.com read the answers: from an editor served anywhere
else the connection fails, and the dialog says so, links to the site's search page for
the query, and reminds you that a downloaded map can be dropped onto the editor. The
minimaps still show, since an image is not subject to that rule.

The plugin tries the site first every time, so it works with no change the day the site
allows it. Until then, a *forwarder* — an address of your own that passes each request
on to scmscx.com and adds the header — can be set in Settings; it is tried when the site
itself does not answer. `forwarder/worker.js` is one, written for Cloudflare Workers:
create a worker, paste the file in, deploy it, and enter the worker's address in
Settings. It forwards GET requests for the routes below and nothing else. To make it the
default for everyone who installs the plugin, put its address in `DEFAULT_SETTINGS` in
`plugin.ts`.

## The site's API

scmscx.com has no documented API. Its About page says the routes its own front end uses
are open and unauthenticated, may change without warning, and asks anyone building on
them to get in touch. The plugin uses these, exactly as the front end does:

| Route | For |
| --- | --- |
| `/api/uiv2/search[/{words}]?…` | the search; parameters at their default are left out, like the site does |
| `/api/uiv2/random[/{words}]?…` | one map id among the matches |
| `/api/uiv2/map_info/{id}` | a map's details |
| `/api/uiv2/filenames2/{id}` | the file names the site knows it under |
| `/api/uiv2/minimap/{id}` | the minimap PNG (as an `<img>`) |
| `/api/maps/{mpq_hash}` | the map file |

One map is fetched at a time, when you pick it. Nothing is fetched in bulk.

## Layout

`plugin.ts` is the dialogs (plain DOM), `client.ts` the typed client for the routes above
(`fetch` injected, so the tests answer requests themselves), `format.ts` the labels.
`plugin-api/` is the editor's emitted type declarations, vendored so the repository
type-checks alone.

```sh
npm install
npm run typecheck
npm test
```

## Licence

MIT.
