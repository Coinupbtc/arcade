# The Arcade

Fourteen browser games, built off the clock and phone-first. Play them at **[coinupbtc.com/arcade](https://coinupbtc.com/arcade/)**.

| | | |
|---|---|---|
| **Grave Lantern** · horde survivor | **Bone Tide** · horde survival (Phaser 4) | **Bridgewright** · bridge physics (Matter.js) |
| **Gloamkeep** · tower defence | **Archer Keep** · castle defence | **Fishy** · eat or be eaten |
| **PULSE** · rhythm | **Orbital Decay** · survival | **Tank Duel** · artillery |
| **Phone Blackjack** · cards | **Zombie Breach** · FPS survival (Three.js) | **Slice Party** · arcade slicer |
| **Rocket Run** · endless flyer | **Bubble Bay** · bubble shooter | |

Every game is held to the same [quality checklist](https://coinupbtc.com/arcade/checklist/): boots clean on phone, desktop and landscape with zero console errors, starts by tap, key, click or gamepad,
never scrolls the page, pauses when you leave the tab, every button is at least 44 px, and its own acceptance tests pass.
Each game's card says whether it has passed, and its page shows which checks it passed and when.

## Layout

```
index.html          the shelf
game/<id>/          one page per game: controls, screenshots, checklist result
g/<id>/             the game itself (plain HTML/JS; no build step, no CDN)
checklist/          how every game is tested
media/<id>/         covers and screenshots, generated from real runs
```

Open `index.html` through any static server; the site expects to live at `/arcade/`.

## Credits

Code is MIT (see `LICENSE`). Art and audio: [Kenney](https://kenney.nl) and [KayKit](https://kaylousberg.itch.io/) packs (CC0),
plus original pieces. Input-prompt icons are Kenney's. Engines: Phaser 4, Matter.js, Three.js, and plain Canvas 2D.
