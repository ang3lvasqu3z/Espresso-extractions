# Espresso Extractions

A Home Assistant custom integration for tracking espresso shots, bags, and recipes.
It ships a full panel-based journal UI plus a Lovelace dashboard card of the same
experience, and exposes remote-control buttons so a physical ESP, a phone dashboard,
or an automation can drive the timer.

![ha](https://img.shields.io/badge/homeassistant-%3E%3D2024.1-blue) ![hacs](https://img.shields.io/badge/HACS-Custom-orange)

## Features

- **Log Shot** — start/stop a brew timer, record dose, yield, recipe, and rating.
- **Coffee Bags** — track bags (roaster, roast date, flavor, cost), presets, and cost-per-shot.
- **History & Charts** — yield trends, brew-time consistency, bag comparison, target deviation, dose-vs-yield scatter, rating distribution.
- **Remote control buttons** — `espresso_extractions.remote_start/_stop/_clear/_plus/_minus/_save` fire a `espresso_extractions_remote` event that every open journal reacts to. Wire a physical ESPHome button, a Lovelace dashboard button, or an automation to any of them.
- **Dashboard card** — `espresso-extractions-panel-card` renders the full journal as a Lovelace card.

## Installation

### HACS (custom repository)

1. Add this repository as a **Custom Repository** in HACS (Category: Integration).
2. Install **Espresso Extractions**.
3. Restart Home Assistant.
4. Add the **Espresso Extractions** integration via Settings → Devices & Services → Add Integration.

### Manual

Copy `custom_components/espresso_extractions/` into your Home Assistant `config/custom_components/`
directory, then restart Home Assistant and add the integration.

## Dashboard card

If you also use the journal as a Lovelace card (`espresso-extractions-panel-card`), add
`/local/community/espresso-extractions-card/espresso-extractions-card.js` as a Lovelace
**resource** (JavaScript module), then use the card type `espresso-extractions-panel-card`.

## Remote control

Press any of the button entities — from a Lovelace dashboard, an ESPHome physical
button, or an automation:

| Entity | Action |
|---|---|
| `espresso_extractions.remote_start` | Start the brew timer |
| `espresso_extractions.remote_stop` | Stop the brew timer |
| `espresso_extractions.remote_clear` | Clear the active extraction |
| `espresso_extractions.remote_plus` | Step actual yield up (+0.1 g) |
| `espresso_extractions.remote_minus` | Step actual yield down (−0.1 g) |
| `espresso_extractions.remote_save` | Save a stopped extraction |

Every open journal reacts to these events. With no journal open, presses are ignored.

## License

MIT — see [LICENSE](LICENSE).