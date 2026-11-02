# scmscx.com plugin

A plugin for [scmJS](https://github.com/scm-js/scm-js), the browser-based StarCraft 1 /
Brood War map editor. It searches [scmscx.com](https://scmscx.com), an archive of StarCraft
maps, from inside the editor, and opens the map you pick.

It contacts scmscx.com and the forwarder described below, and nothing else. Its menu item
carries the plugin's mark (a teal magnifier over a map tile), so you can see that it uses
the network.

## Install

The plugin comes with the editor and is on by default. If you turned it off, tick it on
again in Plugins ▸ **Manage Plugins…**.

To add it by hand, open Plugins ▸ **Manage Plugins…**, paste

```
https://github.com/scm-js/plugin-scm-scx
```

and press **Add**. To pin a version, add a tag: `github:scm-js/plugin-scm-scx@v1.4.0`.

## Searching

Choose File ▸ **Find on scmscx.com…** (just below Open Recent). The dialog opens on the
newest uploads.

- Type to search scenario names, file names, descriptions, and unit and force names. It is
  the same search as the site's own, with the same sort orders.
- Filter by tileset, number of human players and minimum size.
- **More…** chooses which text is searched, and whether to include maps the site marks as
  broken, outdated or unfinished.
- Pick a map to see its minimap and details: size, tileset, players, triggers, units,
  description, forces, download counts and more.
- **Open** downloads the map and opens it in the editor. If your current map has unsaved
  changes, the editor asks about them first.
- **Random** picks one map among the matches.

You can also paste a map's address from the site (`https://scmscx.com/map/…`) into the
search box to show that map.

## Links to a map

Add `scmscx/<id>` to the editor's address to open the search dialog on one map. The id is
the last part of the map's address on the site. For example, `https://scmscx.com/map/35b32Dsq`
becomes:

```
https://scmjs.dev/editor/scmscx/35b32Dsq
```

Nothing is downloaded until you press **Open**. If the site does not know the id, the
dialog says so and lists the newest uploads. The desktop editor has no address, so these
links only work in the browser.

## Settings

The plugin's settings are in Edit ▸ **Preferences…** ▸ Plugins ▸ scmscx.com. The search
dialog also has a **Settings…** button when the site cannot be reached. You can set:

- the forwarder address, with a **Test** button
- whether typing searches at each pause, or only Enter and the **Search** button do
- where minimaps are shown: beside each result and in the details, in the details only, or
  nowhere

Every search and every minimap is one request to the site. Turning off search as you type,
or showing fewer minimaps, sends fewer requests.

## Reaching the site

The plugin asks `https://scmscx.com` first. The site's API sends no CORS header, so a
browser only lets pages served from scmscx.com read its answers. From an editor anywhere
else, that first request fails. Minimaps still show, because images are not covered by
that rule.

The plugin then goes through a forwarder: an address that passes each request on to
scmscx.com and adds the header. The default is:

```
https://scm-scx-forwarder.scmjs.dev
```

So unless your editor is served from scmscx.com, your searches pass through that host. Its
source is [scm-js/cloudflare-scm-scx-forwarder](https://github.com/scm-js/cloudflare-scm-scx-forwarder).
It is a Cloudflare Worker that forwards GET requests for the routes below and refuses
anything else. It keeps the site's answers for a while, from five minutes for a search to
thirty days for a map file, and never for a random pick. It keeps nothing about who asked.

To use your own, deploy that repository and put its address in the plugin's settings. To
use no forwarder, empty the field.

If the site starts sending the header, the first request succeeds and the forwarder is no
longer used. If neither answers, the dialog says so and links to the site's search page
for your query. You can also download a map from the site and drop it onto the editor.

## The site's API

scmscx.com has no documented API. Its About page says the routes its own pages use are
open and need no login, may change without warning, and asks anyone building on them to
get in touch. The plugin uses these, the same way the site does:

| Route | For |
| --- | --- |
| `/api/uiv2/search[/{words}]?…` | The search. Parameters left at their default are left out, as on the site. |
| `/api/uiv2/random[/{words}]?…` | One map id among the matches. |
| `/api/uiv2/map_info/{id}` | A map's details. |
| `/api/uiv2/filenames2/{id}` | The file names the site knows the map under. |
| `/api/uiv2/minimap/{id}` | The minimap PNG, as an image. |
| `/api/maps/{mpq_hash}` | The map file. |

One map is fetched at a time, when you pick it. Nothing is fetched in bulk.

## Development

`plugin.ts` is the dialogs. `client.ts` is the client for the routes above; it takes
`fetch` as a parameter, so the tests can answer requests themselves. `format.ts` has the
labels. The types come from [`@scm-js/plugin-api`](https://github.com/scm-js/plugin-api).

```sh
npm install
npm run typecheck
npm test
```

## Licence

MIT.
