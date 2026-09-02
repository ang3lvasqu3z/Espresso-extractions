"""Espresso Extractions integration."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import voluptuous as vol
from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.storage import Store

from .const import (
    ATTR_EXTRACTION_ID,
    DOMAIN,
    PANEL_ICON,
    PANEL_PATH,
    PANEL_TITLE,
    PANEL_URL,
    PLATFORMS,
    RECIPES,
    SERVICE_RECORD,
    SERVICE_START,
    SERVICE_STOP,
    SIGNAL_UPDATE,
    STORAGE_KEY,
    STORAGE_VERSION,
)

DATA_KEY = DOMAIN


def _now() -> str:
    """Return an ISO timestamp in UTC."""
    return datetime.now(timezone.utc).isoformat()


def _as_number(value: Any) -> float:
    """Parse numeric input, including a friendly MM:SS duration."""
    if value in (None, "", "unknown", "unavailable"):
        return 0.0
    if isinstance(value, str) and ":" in value:
        minutes, seconds = value.split(":", 1)
        return (float(minutes) * 60) + float(seconds)
    return float(value)


def _data(hass: HomeAssistant) -> dict[str, Any]:
    """Return integration runtime data."""
    return hass.data[DATA_KEY]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Espresso Extractions from a config entry."""
    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    stored = await store.async_load() or {}
    bags = stored.get("bags", [])
    extractions = stored.get("extractions", [])
    if not bags and stored.get("beans"):
        for bean in stored["beans"]:
            bags.append({"id": uuid4().hex, "name": bean, "created_at": _now()})
    for bag in bags:
        bag.setdefault("presets", [])
        bag.setdefault("last_settings", {})
        bag.setdefault("active_preset_id", None)
        if not bag.get("active_session_id"):
            bag["active_session_id"] = uuid4().hex
        bag.setdefault("sessions", [])
        bag.setdefault("completed_at", None)
    legacy_presets = stored.get("presets", [])
    legacy_last = stored.get("last_settings", {})
    if legacy_presets and bags:
        for bag in bags:
            if not bag.get("presets"):
                bag["presets"] = list(legacy_presets)
                break
        else:
            bags[0]["presets"] = bags[0].get("presets", []) + list(legacy_presets)
    if legacy_last and bags:
        bags[0]["last_settings"] = {**legacy_last, **bags[0].get("last_settings", {})}
    bag_by_name = {bag.get("name"): bag for bag in bags}
    for extraction in extractions:
        if not extraction.get("bag_id") and extraction.get("bean") in bag_by_name:
            bag = bag_by_name[extraction["bean"]]
            extraction["bag_id"] = bag["id"]
            extraction["bag_snapshot"] = dict(bag)
    by_key: dict = {}
    for bag in bags:
        key = (str(bag.get("name", "")).strip().lower(), str(bag.get("roaster", "")).strip().lower())
        by_key.setdefault(key, []).append(bag)
    for key_group in by_key.values():
        if len(key_group) <= 1:
            continue
        keep = next((b for b in key_group if not b.get("completed_at")), key_group[0])
        for bag in key_group:
            if bag is not keep:
                bags.remove(bag)
    live_ids = {b["id"] for b in bags}
    for extraction in extractions:
        if extraction.get("bag_id") in live_ids and not extraction.get("bag_session_id"):
            owner = next((b for b in bags if b["id"] == extraction["bag_id"]), None)
            if owner:
                extraction["bag_session_id"] = owner.get("active_session_id")
    data = {
        "store": store,
        "extractions": extractions,
        "active": stored.get("active"),
        "bags": bags,
        "amount_options": stored.get("amount_options", {"dose_g": [], "expected_yield_g": []}),
    }
    for extraction in extractions:
        for key in ("dose_g", "expected_yield_g"):
            value = extraction.get(key)
            if value and value not in data["amount_options"].setdefault(key, []):
                data["amount_options"][key].append(value)
    for values in data["amount_options"].values():
        values.sort()
    hass.data[DATA_KEY] = data

    await hass.http.async_register_static_paths(
        [StaticPathConfig(PANEL_PATH, str(Path(__file__).with_name("panel.js")), False)]
    )
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="espresso-extractions-panel",
        frontend_url_path=PANEL_URL,
        module_url=PANEL_PATH,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        require_admin=False,
        config={},
        config_panel_domain=DOMAIN,
    )
    _register_services(hass)
    _register_websocket(hass)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload Espresso Extractions."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        frontend.async_remove_panel(hass, PANEL_URL)
        hass.data.pop(DATA_KEY, None)
    return unloaded


async def _save(hass: HomeAssistant) -> None:
    """Persist current data and notify entities."""
    data = _data(hass)
    await data["store"].async_save(
        {
            "extractions": data["extractions"],
            "active": data["active"],
            "bags": data["bags"],
            "amount_options": data["amount_options"],
        }
    )
    async_dispatcher_send(hass, SIGNAL_UPDATE)


def _validate_extraction(data: dict[str, Any]) -> dict[str, Any]:
    """Normalize a manually entered extraction."""
    result = {
        "id": data.get("id") or uuid4().hex,
        "created_at": data.get("created_at") or _now(),
        "bag_id": str(data.get("bag_id", "")).strip(),
        "bean": str(data.get("bean", "")).strip(),
        "recipe": str(data.get("recipe", "")).strip(),
        "dose_g": _as_number(data.get("dose_g", 0)),
        "yield_g": _as_number(data.get("yield_g", 0)),
        "expected_yield_g": _as_number(data.get("expected_yield_g", 0)),
        "brew_time_s": _as_number(data.get("brew_time_s", 0)),
        "temperature_c": _as_number(data.get("temperature_c", 0)),
        "grind": str(data.get("grind", "")).strip(),
        "pressure_bar": _as_number(data.get("pressure_bar", 0)),
        "rating": int(data.get("rating", 0) or 0),
        "notes": str(data.get("notes", "")).strip(),
    }
    result["ratio"] = round(result["yield_g"] / result["dose_g"], 2) if result["dose_g"] else 0
    return result


async def _record(hass: HomeAssistant, data: dict[str, Any]) -> dict[str, Any]:
    """Record an extraction and fire its event."""
    extraction = _validate_extraction(data)
    runtime = _data(hass)
    runtime["extractions"].insert(0, extraction)
    runtime["extractions"] = runtime["extractions"][:500]
    bag = next((item for item in runtime["bags"] if item["id"] == extraction.get("bag_id")), None)
    if bag and bag.get("completed_at"):
        raise ValueError("This bag is marked done. Reopen it with a roast date before logging shots.")
    if bag:
        extraction["bag_session_id"] = bag.get("active_session_id") or bag["id"]
        extraction["bag_snapshot"] = dict(bag)
        bag["last_settings"] = {
            key: extraction.get(key)
            for key in ("dose_g", "expected_yield_g", "brew_time_s", "temperature_c", "grind", "pressure_bar", "recipe")
        }
        active_id = bag.get("active_preset_id")
        if active_id:
            preset = next((p for p in bag.get("presets", []) if p.get("id") == active_id), None)
            if preset and extraction.get("yield_g", 0) > 0:
                preset["expected_yield_g"] = extraction["yield_g"]
    for key in ("dose_g", "expected_yield_g"):
        value = extraction.get(key)
        if value and value not in runtime["amount_options"][key]:
            runtime["amount_options"][key].append(value)
            runtime["amount_options"][key].sort()
    runtime["active"] = None
    await _save(hass)
    hass.bus.async_fire(f"{DOMAIN}_extraction_recorded", extraction)
    return extraction


def _coffee_bag_close(bag: dict[str, Any]) -> dict[str, Any]:
    """Close the currently active bag session without opening a new one. Marks the bag completed."""
    sessions = bag.setdefault("sessions", [])
    prev = bag.get("active_session_id")
    if prev and not any(s.get("session_id") == prev for s in sessions):
        sessions.append(
            {
                "session_id": prev,
                "roast_date": bag.get("roast_date"),
                "cost": bag.get("cost"),
                "started_at": bag.get("created_at"),
                "completed_at": _now(),
            }
        )
    bag["completed_at"] = _now()
    return bag


def _reopen_bag(bag: dict[str, Any], roast_date: str | None = None, cost: Any = None) -> dict[str, Any]:
    """Close the current bag session and open a fresh one on the same bag row."""
    _coffee_bag_close(bag)
    bag["active_session_id"] = uuid4().hex
    if roast_date is not None:
        bag["roast_date"] = roast_date
    if cost is not None:
        bag["cost"] = cost
    bag["completed_at"] = None
    return bag


def _register_services(hass: HomeAssistant) -> None:
    """Register integration services once."""
    if hass.services.has_service(DOMAIN, SERVICE_RECORD):
        return

    extraction_schema = {
        vol.Optional("bean", default=""): cv.string,
        vol.Optional("recipe", default=""): cv.string,
        vol.Optional("dose_g", default=0): vol.Coerce(float),
        vol.Optional("yield_g", default=0): vol.Coerce(float),
        vol.Optional("brew_time_s", default=0): vol.Coerce(float),
        vol.Optional("temperature_c", default=0): vol.Coerce(float),
        vol.Optional("grind", default=""): cv.string,
        vol.Optional("pressure_bar", default=0): vol.Coerce(float),
        vol.Optional("rating", default=0): vol.All(vol.Coerce(int), vol.Range(min=0, max=5)),
        vol.Optional("notes", default=""): cv.string,
    }

    async def start(call: ServiceCall) -> None:
        _data(hass)["active"] = {"started_at": _now(), "data": dict(call.data)}
        await _save(hass)
    async def stop(call: ServiceCall) -> None:
        active = _data(hass).get("active")
        if not active:
            return
        started = datetime.fromisoformat(active["started_at"])
        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
        payload = {**active["data"], **dict(call.data), "brew_time_s": elapsed}
        await _record(hass, payload)

    async def record(call: ServiceCall) -> None:
        await _record(hass, dict(call.data))

    hass.services.async_register(DOMAIN, SERVICE_START, start, vol.Schema(extraction_schema))
    hass.services.async_register(DOMAIN, SERVICE_STOP, stop, vol.Schema(extraction_schema))
    hass.services.async_register(DOMAIN, SERVICE_RECORD, record, vol.Schema(extraction_schema))


def _register_websocket(hass: HomeAssistant) -> None:
    """Register panel websocket commands once."""
    if hass.data.get(f"{DOMAIN}_websocket"):
        return
    hass.data[f"{DOMAIN}_websocket"] = True

    @websocket_api.websocket_command({"type": f"{DOMAIN}/list"})
    @websocket_api.async_response
    async def list_extractions(hass: HomeAssistant, connection, msg: dict) -> None:
        connection.send_result(
            msg["id"],
            {
                "extractions": _data(hass)["extractions"],
                "active": _data(hass)["active"],
                "bags": _data(hass)["bags"],
                "recipes": RECIPES,
                "amount_options": _data(hass)["amount_options"],
            },
        )

    @websocket_api.websocket_command({"type": f"{DOMAIN}/record", "record": dict})
    @websocket_api.async_response
    async def record_extraction(hass: HomeAssistant, connection, msg: dict) -> None:
        extraction = await _record(hass, msg["record"])
        connection.send_result(msg["id"], extraction)

    @websocket_api.websocket_command({"type": f"{DOMAIN}/start", "record": dict})
    @websocket_api.async_response
    async def start_extraction(hass: HomeAssistant, connection, msg: dict) -> None:
        _data(hass)["active"] = {"started_at": _now(), "data": msg.get("record", {})}
        await _save(hass)
        connection.send_result(msg["id"], _data(hass)["active"])

    @websocket_api.websocket_command({"type": f"{DOMAIN}/stop", "record": dict})
    @websocket_api.async_response
    async def stop_extraction(hass: HomeAssistant, connection, msg: dict) -> None:
        active = _data(hass).get("active")
        if not active:
            connection.send_error(msg["id"], "no_active_extraction", "No extraction is active")
            return
        started = datetime.fromisoformat(active["started_at"])
        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
        extraction = await _record(hass, {**active["data"], **msg["record"], "brew_time_s": elapsed})
        connection.send_result(msg["id"], extraction)

    @websocket_api.websocket_command({"type": f"{DOMAIN}/finish"})
    @websocket_api.async_response
    async def finish_extraction(hass: HomeAssistant, connection, msg: dict) -> None:
        active = _data(hass).get("active")
        if not active:
            connection.send_error(msg["id"], "no_active_extraction", "No extraction is active")
            return
        active["stopped_at"] = _now()
        started = datetime.fromisoformat(active["started_at"])
        active["data"]["brew_time_s"] = (
            datetime.fromisoformat(active["stopped_at"]) - started
        ).total_seconds()
        await _save(hass)
        connection.send_result(msg["id"], active)

    @websocket_api.websocket_command({"type": f"{DOMAIN}/clear"})
    @websocket_api.async_response
    async def clear_extraction(hass: HomeAssistant, connection, msg: dict) -> None:
        _data(hass)["active"] = None
        await _save(hass)
        connection.send_result(msg["id"], {"cleared": True})

    @websocket_api.websocket_command({"type": f"{DOMAIN}/delete", ATTR_EXTRACTION_ID: cv.string})
    @websocket_api.async_response
    async def delete_extraction(hass: HomeAssistant, connection, msg: dict) -> None:
        runtime = _data(hass)
        runtime["extractions"] = [item for item in runtime["extractions"] if item["id"] != msg[ATTR_EXTRACTION_ID]]
        await _save(hass)
        connection.send_result(msg["id"], {"deleted": True})

    @websocket_api.websocket_command({"type": f"{DOMAIN}/update", "record": dict})
    @websocket_api.async_response
    async def update_extraction(hass: HomeAssistant, connection, msg: dict) -> None:
        record = _validate_extraction(msg["record"])
        records = _data(hass)["extractions"]
        for index, existing in enumerate(records):
            if existing["id"] == record["id"]:
                record["created_at"] = existing.get("created_at", record["created_at"])
                record["bag_snapshot"] = existing.get("bag_snapshot")
                bag = next((item for item in _data(hass)["bags"] if item["id"] == record.get("bag_id")), None)
                if bag:
                    record["bag_snapshot"] = dict(bag)
                records[index] = record
                await _save(hass)
                connection.send_result(msg["id"], record)
                return
        connection.send_error(msg["id"], "not_found", "Extraction not found")

    @websocket_api.websocket_command({"type": f"{DOMAIN}/save_bag", "bag": dict})
    @websocket_api.async_response
    async def save_bag(hass: HomeAssistant, connection, msg: dict) -> None:
        bag = dict(msg["bag"])
        bag["id"] = bag.get("id") or uuid4().hex
        bag["created_at"] = bag.get("created_at") or _now()
        bags = _data(hass)["bags"]
        for index, existing in enumerate(bags):
            if existing["id"] == bag["id"]:
                bag.setdefault("presets", existing.get("presets", []))
                bag.setdefault("last_settings", existing.get("last_settings", {}))
                bag.setdefault("active_preset_id", existing.get("active_preset_id"))
                bag.setdefault("cost", existing.get("cost"))
                bag.setdefault("completed_at", existing.get("completed_at"))
                bag.setdefault("active_session_id", existing.get("active_session_id") or uuid4().hex)
                bag.setdefault("sessions", existing.get("sessions", []))
                bags[index] = bag
                break
        else:
            if not bag.get("completed_at"):
                for other in bags:
                    if not other.get("completed_at"):
                        _coffee_bag_close(other)
            key = (str(bag.get("name", "")).strip().lower(), str(bag.get("roaster", "")).strip().lower())
            existing = next((x for x in bags if (str(x.get("name", "")).strip().lower(), str(x.get("roaster", "")).strip().lower()) == key and key[0]), None)
            if existing:
                _reopen_bag(existing, bag.get("roast_date"), bag.get("cost"))
                for field in ("origin", "process", "varietals", "flavor_profile", "notes", "roast_level"):
                    if field in bag:
                        existing[field] = bag[field]
                bag = existing
            else:
                bag["active_session_id"] = uuid4().hex
                bag["sessions"] = []
                bag.setdefault("presets", [])
                bag.setdefault("last_settings", {})
                bag.setdefault("active_preset_id", None)
                bag.setdefault("cost", None)
                bag.setdefault("completed_at", None)
                bags.append(bag)
        await _save(hass)
        connection.send_result(msg["id"], bag)

    @websocket_api.websocket_command({"type": f"{DOMAIN}/copy_bag", "bag_id": cv.string})
    @websocket_api.async_response
    async def copy_bag(hass: HomeAssistant, connection, msg: dict) -> None:
        source = next((bag for bag in _data(hass)["bags"] if bag["id"] == msg["bag_id"]), None)
        if not source:
            connection.send_error(msg["id"], "not_found", "Bag not found")
            return
        dup = dict(source)
        dup["id"] = uuid4().hex
        dup["name"] = f"{source.get('name', '')} (copy)".strip()
        dup["active_session_id"] = uuid4().hex
        dup["sessions"] = []
        dup["completed_at"] = None
        dup["presets"] = [dict(p) for p in source.get("presets", [])]
        dup["last_settings"] = dict(source.get("last_settings", {}))
        dup["active_preset_id"] = source.get("active_preset_id")
        for other in _data(hass)["bags"]:
            if not other.get("completed_at"):
                _coffee_bag_close(other)
        _data(hass)["bags"].append(dup)
        await _save(hass)
        connection.send_result(msg["id"], dup)

    @websocket_api.websocket_command({"type": f"{DOMAIN}/save_preset", "bag_id": cv.string, "preset": dict})
    @websocket_api.async_response
    async def save_preset(hass: HomeAssistant, connection, msg: dict) -> None:
        bag = next((item for item in _data(hass)["bags"] if item["id"] == msg["bag_id"]), None)
        if not bag:
            connection.send_error(msg["id"], "not_found", "Bag not found")
            return
        preset = dict(msg["preset"])
        preset["id"] = preset.get("id") or uuid4().hex
        presets = bag.setdefault("presets", [])
        for index, existing in enumerate(presets):
            if existing["id"] == preset["id"]:
                presets[index] = preset
                break
        else:
            presets.append(preset)
        await _save(hass)
        connection.send_result(msg["id"], preset)

    @websocket_api.websocket_command({"type": f"{DOMAIN}/set_active_preset", "bag_id": cv.string, "preset_id": cv.string})
    @websocket_api.async_response
    async def set_active_preset(hass: HomeAssistant, connection, msg: dict) -> None:
        bag = next((item for item in _data(hass)["bags"] if item["id"] == msg["bag_id"]), None)
        if not bag:
            connection.send_error(msg["id"], "not_found", "Bag not found")
            return
        preset_id = msg["preset_id"]
        if preset_id:
            if not any(p.get("id") == preset_id for p in bag.get("presets", [])):
                connection.send_error(msg["id"], "not_found", "Preset not found")
                return
        bag["active_preset_id"] = preset_id or None
        await _save(hass)
        connection.send_result(msg["id"], bag)

    @websocket_api.websocket_command({"type": f"{DOMAIN}/set_active_preset_yield", "bag_id": cv.string, "yield_g": cv.string})
    @websocket_api.async_response
    async def set_active_preset_yield(hass: HomeAssistant, connection, msg: dict) -> None:
        bag = next((item for item in _data(hass)["bags"] if item["id"] == msg["bag_id"]), None)
        if not bag:
            connection.send_error(msg["id"], "not_found", "Bag not found")
            return
        active_id = bag.get("active_preset_id")
        preset = next((p for p in bag.get("presets", []) if p.get("id") == active_id), None) if active_id else None
        if preset:
            preset["expected_yield_g"] = _as_number(msg["yield_g"])
            await _save(hass)
        connection.send_result(msg["id"], bag)

    @websocket_api.websocket_command({"type": f"{DOMAIN}/delete_preset", "bag_id": cv.string, "preset_id": cv.string})
    @websocket_api.async_response
    async def delete_preset(hass: HomeAssistant, connection, msg: dict) -> None:
        bag = next((item for item in _data(hass)["bags"] if item["id"] == msg["bag_id"]), None)
        if bag:
            if bag.get("active_preset_id") == msg["preset_id"]:
                bag["active_preset_id"] = None
            bag["presets"] = [p for p in bag.get("presets", []) if p["id"] != msg["preset_id"]]
        await _save(hass)
        connection.send_result(msg["id"], {"deleted": True})

    @websocket_api.websocket_command({"type": f"{DOMAIN}/delete_bag", "bag_id": cv.string})
    @websocket_api.async_response
    async def delete_bag(hass: HomeAssistant, connection, msg: dict) -> None:
        runtime = _data(hass)
        before = len(runtime["bags"])
        runtime["bags"] = [bag for bag in runtime["bags"] if bag["id"] != msg["bag_id"]]
        if runtime.get("active") and runtime["active"].get("data", {}).get("bag_id") == msg["bag_id"]:
            runtime["active"] = None
        await _save(hass)
        connection.send_result(msg["id"], {"deleted": before != len(runtime["bags"])})

    @websocket_api.websocket_command({"type": f"{DOMAIN}/complete_bag", "bag_id": cv.string, "roast_date": cv.string, "just_done": cv.boolean})
    @websocket_api.async_response
    async def complete_bag(hass: HomeAssistant, connection, msg: dict) -> None:
        runtime = _data(hass)
        bag = next((b for b in runtime["bags"] if b["id"] == msg["bag_id"]), None)
        if not bag:
            connection.send_error(msg["id"], "not_found", "Bag not found")
            return
        if msg.get("just_done"):
            _coffee_bag_close(bag)
        else:
            _reopen_bag(bag, msg.get("roast_date") or bag.get("roast_date"))
        await _save(hass)
        connection.send_result(msg["id"], {"bag": bag})

    @websocket_api.websocket_command({"type": f"{DOMAIN}/reopen_bag", "bag_id": cv.string, "roast_date": cv.string})
    @websocket_api.async_response
    async def reopen_bag(hass: HomeAssistant, connection, msg: dict) -> None:
        runtime = _data(hass)
        bag = next((b for b in runtime["bags"] if b["id"] == msg["bag_id"]), None)
        if not bag:
            connection.send_error(msg["id"], "not_found", "Bag not found")
            return
        _reopen_bag(bag, msg.get("roast_date") or bag.get("roast_date"))
        await _save(hass)
        connection.send_result(msg["id"], {"bag": bag})

    for command in (
        list_extractions,
        record_extraction,
        start_extraction,
        stop_extraction,
        finish_extraction,
        clear_extraction,
        delete_extraction,
        update_extraction,
        save_bag,
        copy_bag,
        save_preset,
        set_active_preset,
        set_active_preset_yield,
        delete_preset,
        delete_bag,
        complete_bag,
        reopen_bag,
    ):
        websocket_api.async_register_command(hass, command)
