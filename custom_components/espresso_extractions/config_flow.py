"""Config flow for Espresso Extractions."""

from __future__ import annotations

from homeassistant import config_entries
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResult
import voluptuous as vol

from .const import DOMAIN


async def _async_has_entry(hass: HomeAssistant) -> bool:
    """Return whether the single integration entry already exists."""
    return any(entry.domain == DOMAIN for entry in hass.config_entries.async_entries(DOMAIN))


class EspressoExtractionsConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle setup of Espresso Extractions."""

    VERSION = 1

    async def async_step_user(self, user_input: dict | None = None) -> FlowResult:
        """Create the integration entry."""
        if await _async_has_entry(self.hass):
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(title="Espresso Extractions", data={})

        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))
