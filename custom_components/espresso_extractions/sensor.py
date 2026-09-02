"""Sensors for Espresso Extractions."""

from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, SIGNAL_UPDATE


SENSORS = (
    ("status", "Status", None),
    ("total_extractions", "Total Extractions", "count"),
    ("average_ratio", "Average Ratio", None),
    ("average_brew_time", "Average Brew Time", "s"),
    ("last_bean", "Last Bean", None),
    ("last_recipe", "Last Recipe", None),
    ("last_rating", "Last Rating", "rating"),
)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up extraction sensors."""
    entities = [EspressoSensor(hass, key, name, unit) for key, name, unit in SENSORS]
    async_add_entities(entities)


class EspressoSensor(SensorEntity):
    """A derived extraction statistic."""

    _attr_has_entity_name = True

    def __init__(self, hass: HomeAssistant, key: str, name: str, unit: str | None) -> None:
        self.hass = hass
        self._key = key
        self._attr_name = name
        self._attr_unique_id = f"{DOMAIN}_{key}"
        self._attr_native_unit_of_measurement = unit

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(async_dispatcher_connect(self.hass, SIGNAL_UPDATE, self._updated))

    @callback
    def _updated(self) -> None:
        self.async_write_ha_state()

    @property
    def native_value(self):
        data = self.hass.data[DOMAIN]
        extractions = data["extractions"]
        last = extractions[0] if extractions else {}
        if self._key == "status":
            return "running" if data["active"] else "idle"
        if self._key == "total_extractions":
            return len(extractions)
        if self._key == "average_ratio":
            values = [item["ratio"] for item in extractions if item.get("ratio")]
            return round(sum(values) / len(values), 2) if values else 0
        if self._key == "average_brew_time":
            values = [item["brew_time_s"] for item in extractions if item.get("brew_time_s")]
            return round(sum(values) / len(values), 1) if values else 0
        if self._key == "last_bean":
            return last.get("bean", "")
        if self._key == "last_recipe":
            return last.get("recipe", "")
        return last.get("rating", 0)
