"""Constants for the Espresso Extractions integration."""

from homeassistant.const import Platform

DOMAIN = "espresso_extractions"
STORAGE_VERSION = 1
STORAGE_KEY = f"{DOMAIN}.data"
SIGNAL_UPDATE = f"{DOMAIN}_update"
REMOTE_EVENT = f"{DOMAIN}_remote"
PANEL_PATH = "/espresso_extractions/espresso-extractions.js"
PANEL_URL = "espresso-extractions"
PANEL_TITLE = "Espresso"
PANEL_ICON = "mdi:coffee"

PLATFORMS = [Platform.SENSOR, Platform.BUTTON]

SERVICE_START = "start_extraction"
SERVICE_STOP = "stop_extraction"
SERVICE_RECORD = "record_extraction"

ATTR_EXTRACTION_ID = "extraction_id"

RECIPES = {
    "Ristretto": 1.0,
    "Classic Espresso": 2.0,
    "Lungo": 3.0,
}
