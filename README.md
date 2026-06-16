# FPSGame

Web-based tactical training range built with Vite, Three.js, GLB model loading,
first/third-person camera switching, firearms, sniper aiming, knives, moving
targets, and hostile AI.

Live site:

https://niganmahhh.github.io/FPSGame/

## Run Locally

```bash
npm install
npm run dev
```

Open the local Vite URL, press `ENTER RANGE`, then click to lock mouse control.

## Controls

- `WASD`: move
- `Shift`: sprint
- `Space`: jump
- `Ctrl` / `C`: crouch
- Mouse move: aim
- Left mouse: fire / slash
- Right mouse: aim down sights / sniper scope
- `R`: reload
- `V`: switch first-person / third-person camera
- Mouse wheel: cycle full loadout while in control
- HUD loadout buttons: select weapons before entering or while mouse is released
- `1`: AK-47 Classic
- `2`: M4A1 Tactical
- `4`: Blackout Heavy Sniper
- `5`: Thunder M4 Prototype
- `6`: Ember Beast AK
- `7`: Destroyer Anti-Materiel Sniper
- `3` / `Q`: cycle katana, butterfly knife, dagger, combat knife, kunai, and machete

## Features

- Three.js 3D training range with shadows, fog, targets, cover, catwalks, and containers.
- Third-person and first-person camera modes.
- Mouse direction fixed to normal FPS behavior.
- CC0/redistributable AK-47, M4A1, heavy sniper, destroyer sniper, katana, butterfly knife, dagger, combat knife, kunai, and machete loadout with procedural fallbacks.
- Right-click sniper scope overlay and zoom.
- Simple Web Audio firearm, reload, slash, hit, and damage sounds.
- Female fighter player avatar with first-person and third-person presentation.
- Hostile enemy AI that patrols before engagement, then chases, attacks, takes damage, and respawns.
- External CC0 GLB models loaded from `public/models`, with procedural fallback models.
- Optional private local mod overrides from ignored `public/private-mods/mods.json`.

## Asset Notes

The project uses only public, redistributable model assets. It does not include
proprietary CrossFire, Valorant, Counter-Strike, or other commercial FPS game
model files.

Model credits and license links are listed in:

`public/models/ASSET_CREDITS.md`

Private local-only mod loading is documented in:

`docs/PRIVATE_MODS.md`
