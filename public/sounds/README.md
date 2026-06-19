# Custom Sound Overrides

Place `.mp3`, `.wav`, or `.ogg` audio files in this directory and reference
them in `sounds.json` (same directory) to override the built-in procedural
synthesised sounds.

## How it works

1. The game tries to fetch `sounds.json` at startup.
2. If the manifest is missing or a particular entry is absent, the procedural
   synthesised sound plays instead — **no errors, no warnings**.
3. Audio files are loaded relative to the `public/` directory.

## `sounds.json` format

```json
{
  "ak-classic": {
    "fire": "sounds/ak-fire.mp3",
    "inspect": "sounds/ak-inspect.mp3"
  },
  "m4-tactical": {
    "fire": "sounds/m4-fire.mp3",
    "inspect": "sounds/m4-inspect.mp3"
  },
  "blackout-sniper": {
    "fire": "sounds/sniper-fire.wav"
  },
  "knife": {
    "fire": "sounds/knife-slash.ogg"
  }
}
```

Supported events per weapon id:

| Event      | When it plays           |
|------------|------------------------|
| `fire`     | Weapon fires / knife swings |
| `inspect`  | Inspect animation starts   |
| `equip`    | Weapon drawn / switched     |
| `reload`   | Reload begins              |
| `hit`      | Target hit                 |
| `damage`   | Player takes damage        |

Supported weapon ids:

- `ak-classic`, `m4-tactical`, `blackout-sniper`, `storm-m4`, `ember-ak`,
  `destroyer-sniper`
- `knife` (used as a fallback for all melee weapons)

## Legal

Only use audio files you have the right to redistribute — CC0, CC-BY with
attribution, or your own original recordings. Do not include copyrighted
commercial game audio (CrossFire, CS:GO, Valorant, etc.).

Recommended free sources:

- <https://freesound.org> — filter by License: CC0 / CC-BY
- <https://kenney.nl/assets/category:Audio>
- <https://opengameart.org/art-search-advanced?keys=&field_art_type_tid%5B%5D=10&sort_by=count&sort_order=DESC&field_license_tid%5B%5D=12>
