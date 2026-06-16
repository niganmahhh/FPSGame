# Private Local Mods

`public/private-mods/` is intentionally ignored by git. Put your own local,
authorized GLB files there when you want private models that should not be
published to GitHub Pages.

Create this file locally:

```text
public/private-mods/mods.json
```

Example:

```json
{
  "weapons": {
    "destroyer-sniper": {
      "file": "destroyer-sniper.glb",
      "maxSize": 2.68,
      "rotation": [0, 3.14159, 0]
    },
    "dragon-blade": {
      "file": "tulong-blade.glb",
      "maxSize": 1.5,
      "rotation": [-0.15, 0, -0.62]
    },
    "butterfly-knife": "butterfly-knife.glb",
    "shadow-dagger": "shadow-dagger.glb",
    "combat-knife": "combat-knife.glb",
    "kunai-blade": "kunai.glb",
    "machete-blade": "machete.glb"
  },
  "avatar": {
    "player": {
      "file": "linghu-character.glb",
      "maxSize": 1.82,
      "alignBottom": true,
      "rotation": [0, 3.14159, 0]
    }
  },
  "monsters": {
    "cactoro": {
      "file": "monster.glb",
      "maxSize": 1.86,
      "alignBottom": true,
      "rotation": [0, 3.14159, 0]
    }
  }
}
```

Supported weapon ids:

- `ak-classic`
- `m4-tactical`
- `blackout-sniper`
- `storm-m4`
- `ember-ak`
- `destroyer-sniper`
- `dragon-blade`
- `butterfly-knife`
- `shadow-dagger`
- `combat-knife`
- `kunai-blade`
- `machete-blade`

If `mods.json` or any private GLB is missing, the game automatically falls
back to the included CC0 models.
