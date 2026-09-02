"""Buttons for Espresso Extractions."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, REMOTE_EVENT, SERVICE_START, SERVICE_STOP

REMOTE_ACTIONS = [
    ("start", "Start", "mdi:play"),
    ("stop", "Stop", "mdi:stop"),
    ("clear", "Clear", "mdi:close"),
    ("plus", "Yield +", "mdi:plus"),
    ("minus", "Yield -", "mdi:minus"),
    ("save", "Save", "mdi:content-save"),
]


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up extraction and remote buttons."""
    entities = [ExtractionButton(hass, SERVICE_START), ExtractionButton(hass, SERVICE_STOP)]
    entities += [ExtractionRemoteButton(hass, action, label) for action, label, _ in REMOTE_ACTIONS]
    async_add_entities(entities)


class ExtractionButton(ButtonEntity):
    """Start or stop the active extraction timer."""

    _attr_has_entity_name = True

    def __init__(self, hass: HomeAssistant, action: str) -> None:
        self.hass = hass
        self._action = action
        self._attr_name = "Start Extraction" if action == SERVICE_START else "Stop Extraction"
        self._attr_unique_id = f"{DOMAIN}_{action}"

    async def async_press(self) -> None:
        """Press the button."""
        await self.hass.services.async_call(DOMAIN, self._action, {}, blocking=True)


class ExtractionRemoteButton(ButtonEntity):
    """Fire a remote control event that all open espresso journals react to."""

    _attr_has_entity_name = True

    def __init__(self, hass: HomeAssistant, action: str, label: str) -> None:
        self.hass = hass
        self._action = action
        self._attr_name = f"Remote {label}"
        self._attr_unique_id = f"{DOMAIN}_remote_{action}"

    async def async_press(self) -> None:
        """Press the button, firing the remote control event."""
        self.hass.bus.async_fire(REMOTE_EVENT, {"action": self._action})
