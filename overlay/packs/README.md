# World Packs (`overlay/packs/<id>/pack.json`)

A pack is presentation config — how a planet looks and what things are called. It never carries a fact: no client, no company name (npm test greps this folder), no run data. Selection is read live from the substrate through the adapter and never stored: a planet wears `WORLD_COMPANIES.companies[].world_pack` (absent → `tellefsen-campus`), a town wears `ops_clients.world_branding.pack` when that column exists and is set, else its company's pack.

| Key | What it declares |
|---|---|
| `id`, `version`, `title`, `blurb` | The id is the folder name and the value the substrate names. |
| `skin.palette` | CSS colours for the overlay's own surfaces (`--aw-*`). Bot Crossing's plot palette is upstream code and stays. |
| `skin.kit` | The KayKit asset set the world is built from. One set ships (`kaykit-space-base-bits`, `public/assets/spacebase.glb`); a pack naming another set needs that set built by `tools/build-assets.mjs` first. |
| `skin.world`, `skin.sky` | Bot Crossing's world style (`moon`, `mars`, `terra`) — terrain, sky and lighting come from that preset. Applied once per pack change; the viewer's own Tab/L choices stand afterwards. |
| `skin.lighting` | `timeOfDay` (0–1) and `autoTime`, applied with the world style. |
| `skin.filter` | A CSS filter over the canvas — `grayscale(1)` is how `neutral` goes grayscale without touching a material. |
| `skin.sounds` | The sound set name (ES-4.8 consumes it). |
| `skin.badges` | The badge glyphs the overlay's own surfaces use (the in-tray, ES-4.4). Bot Crossing's figure badges are upstream and identical under every pack — precedence never changes. |
| `names` | The nouns: `world`, `planet`, `centre`, `town`, `building`, `studio`, `agent`, `prospect`. |
| `rooms[]` | Each room, the substrate surface it mirrors (`mirrors`, `surface`) and the skill-name fragments that place a run in it (`skills`). The surface each room mirrors is the same under every pack; only names differ. |
| `default_room` | Where a run goes when no room's `skills` match. |
| `layout` | The layout file naming the pack uses — `home` is Bot Crossing's own file, `planet` the per-planet file. |

Two packs ship: `tellefsen-campus` (the RA's Spatial grammar table) and `neutral` (grayscale, generic nouns). Client packs are M3 work (U27).
