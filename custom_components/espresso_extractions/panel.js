class EspressoExtractionsPanel extends HTMLElement {
  set hass(value) { this._hass = value; if (value?.connection && !this._remoteSubscribed) { this._remoteSubscribed = true; this._remoteUnsub = value.connection.subscribeEvents((ev) => this._handleRemote(ev.data?.action), "espresso_extractions_remote"); } }
  get hass() { return this._hass; }

  setConfig(config) { this._cardConfig = config || {}; this._isCard = true; }
  getCardSize() { return 8; }
  static getStubConfig() { return {}; }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    if (!this._isCard) this.hideEmbeddedSidebar();
    let savedTab = "log";
    try { savedTab = window.localStorage.getItem("espresso_extractions_tab") || "log"; } catch (e) {}
    let savedHomePath = "/lovelace";
    try { savedHomePath = window.localStorage.getItem("espresso_extractions_home_path") || "/lovelace"; } catch (e) {}
    Object.assign(this, { tab: savedTab, homePath: savedHomePath, settingsOpen: false, settingsDraft: savedHomePath, bag: null, editing: null, bags: [], extractions: [], presets: [], lastSettings: {}, amountOptions: { dose_g: [], expected_yield_g: [] }, recipes: {}, active: null, formState: {}, finishModal: null, editPreset: null, filterBag: "", filterFrom: "", filterTo: "", filterRecipe: "", filterRating: "", filterStatus: "", editRow: null, selected: {}, bulkEdit: false, sortKey: "created_at", sortDir: -1, greeting: this.pickGreeting() });
    this.render();
    this.load();
    this.timerInterval = setInterval(() => { if (this.active) this.renderTimer(); }, 250);
  }

  disconnectedCallback() { clearInterval(this.timerInterval); if (this._remoteUnsub) { this._remoteUnsub(); this._remoteUnsub = null; } this._remoteSubscribed = false; }

  async load() {
    const result = await this.call("list");
    Object.assign(this, { extractions: result.extractions || [], bags: result.bags || [], amountOptions: result.amount_options || { dose_g: [], expected_yield_g: [] }, recipes: result.recipes || { Ristretto: 1, "Classic Espresso": 2, Lungo: 3 }, active: result.active });
    if (!this.bag || !this.bags.some((item) => item.id === this.bag.id)) this.bag = this.bags[0] || null;
    this.bag = this.bags.find((item) => item.id === (this.bag && this.bag.id)) || this.bags[0] || null;
    this.formState = {};
    this.render();
  }

  call(command, payload = {}) { return this.hass.callWS({ type: `espresso_extractions/${command}`, ...payload }); }
  esc(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c])); }
  number(value) { return Number(value || 0); }
  pickGreeting() {
    const messages = [
      "Happy brewing!",
      "Good coffee needs good patience.",
      "Extraction is everything. Pull on!",
      "Fresh beans, fresh start.",
      "May your crema be golden today.",
      "Dial in. Taste. Repeat.",
      "Coffee: because adulting is hard.",
      "Warm cup, calm mind.",
      "Trust the process, taste the result.",
      "Perfect shot = happy day.",
      "Let it bloom, then enjoy.",
      "You've got this — and great coffee.",
      "Brew boldly.",
      "Every shot teaches you something.",
      "Sip slow, savor every note."
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  render() {
    this.shadowRoot.innerHTML = `<style>${this.styles()}</style><main><header class="app-header">${this._isCard ? "" : `<button id="back-home" class="back-home" title="Back to dashboard" aria-label="Back to dashboard"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" fill="currentColor"/></svg></button>`}<div class="header-main"><span class="eyebrow">ESPRESSO JOURNAL</span><h1>Dial in your next shot</h1><p>Track recipes, bags, and the details that make the difference.</p></div><nav>${[["log", "Log Shot", "mdi:coffee-outline"], ["bags", "Coffee Bags", "mdi:bag-suitcase"], ["history", "History & Charts", "mdi:chart-line"]].map(([key, label, icon]) => `<button data-tab="${key}" class="nav-tab ${this.tab === key ? "active" : ""}" aria-pressed="${this.tab === key}"><ha-icon icon="${icon}"></ha-icon><span>${label}</span></button>`).join("")}</nav></header><section id="content">${this.tab === "bags" ? this.bagsView() : this.tab === "history" ? this.historyView() : this.logView()}</section>${this._isCard ? "" : this.settingsModal()}</main>`;
    // Yield step button handlers
    this.shadowRoot.querySelectorAll(".yield-step-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const input = this.shadowRoot.querySelector("input[name=yield_g]");
        if (!input) return;
        const step = parseFloat(input.step) || 0.1;
        const value = parseFloat(input.value) || 0;
        if (btn.classList.contains("yield-step-up")) {
          input.value = (value + step).toFixed(1);
        } else {
          input.value = Math.max(0, value - step).toFixed(1);
        }
        input.dispatchEvent(new Event("change"));
      });
    });
    const photo = this.shadowRoot.querySelector(".timer-card");
    if (photo) {
      photo.style.maxWidth = "560px";
      const image = document.createElement("img");
      image.className = "machine-photo";
      image.src = `/local/meraki2.png?v=${Date.now()}`;
      image.alt = "Meraki espresso machine";
      image.style.maxWidth = "100%";
      image.style.maxHeight = "420px";
      image.style.width = "auto";
      image.style.height = "auto";
      image.style.objectFit = "contain";
      image.style.borderRadius = "14px";
      image.style.marginBottom = "8px";
      image.style.display = "block";
      const stage = document.createElement("div");
      stage.className = "machine-stage";
      stage.style.position = "relative";
      stage.style.width = "fit-content";
      stage.style.maxWidth = "100%";
      stage.style.margin = "0 auto";
      stage.style.display = "block";
      photo.prepend(stage);
      stage.append(image);
      const screen = document.createElement("div");
      screen.className = `brew-screen ${this.active && !this.active.stopped_at ? "pouring" : ""}`;
      screen.style.marginLeft = "0";
      screen.style.position = "absolute";
      screen.style.left = "50.2%";
      screen.style.transform = "translateX(-50%)";
      screen.style.top = "1.5%";
      screen.style.width = "23%";
      screen.style.aspectRatio = "1";
      screen.style.borderRadius = "50%";
      const state = document.createElement("div");
      state.className = "brew-state";
      state.textContent = this.active ? (this.active.stopped_at ? "SHOT COMPLETE" : "BREWING") : "READY";
      screen.append(state);
      const brewTime = document.createElement("div");
      brewTime.className = "brew-time";
      brewTime.textContent = this.formatElapsed(this.elapsedSeconds());
      screen.append(brewTime);
      const flower = document.createElement("div");
      flower.className = "brew-flower";
      for (let index = 0; index < 8; index += 1) {
        const petal = document.createElement("i");
        petal.style.left = "-3.5px";
        petal.style.top = "-20px";
        petal.style.transform = `rotate(${index * 45}deg)`;
        flower.append(petal);
      }
      screen.append(flower);
      stage.append(screen);
      const visualStyle = document.createElement("style");
      visualStyle.textContent = ".brew-screen{position:absolute;z-index:4;left:50.2%;top:1.5%;width:23%;aspect-ratio:1;border:2px solid #ffffff55;border-radius:50%;overflow:hidden;box-shadow:0 0 14px #0008;background:radial-gradient(circle at 50% 45%,#9a4d2b,#261616 62%)}.brew-state,.brew-time{position:absolute;left:0;right:0;text-align:center;color:#fff;text-shadow:0 2px 5px #000;font-weight:700}.brew-state{top:20%;font-size:clamp(6px,1.4vw,9px);letter-spacing:1px}.brew-time{bottom:14%;font-size:clamp(12px,3.2vw,20px);font-variant-numeric:tabular-nums}.brew-flower{position:absolute;left:50%;top:50%;width:0;height:0;transform:translate(-50%,-50%);transform-origin:0 0}.brew-flower i{position:absolute;display:block;width:7px;height:20px;border-radius:50%;background:#fff8;box-shadow:0 0 8px #fff8;transform-origin:50% 100%}.brew-screen.pouring .brew-flower{animation:flower-spin 12s linear infinite}.brew-screen:not(.pouring) .brew-flower{opacity:.35}@keyframes flower-spin{to{transform:translate(-50%,-50%) rotate(360deg)}";
      this.shadowRoot.append(visualStyle);
      const fallback = photo.querySelector("svg");
      if (fallback) fallback.remove();
      const duplicateTimer = photo.querySelector(".elapsed");
      if (duplicateTimer) duplicateTimer.remove();
    }
    this.bind();
  }

  logView() {
    const options = this.bags.filter((bag) => !bag.completed_at).map((bag) => `<option value="${this.esc(bag.id)}" ${bag.id === this.bag?.id ? "selected" : ""}>${this.esc(bag.name || "Unnamed bag")}</option>`).join("");
    const ls = (this.bag?.last_settings) || {};
    const activePreset = (this.bag?.presets || []).find((p) => p.id === this.bag?.active_preset_id);
    const elapsed = this.elapsedSeconds();
    let yieldValue = "";
    if (this.editing?.yield_g !== undefined && this.editing.yield_g !== "") {
      yieldValue = this.editing.yield_g;
    } else if (this.active?.data?.yield_g !== undefined && this.active.data.yield_g !== "") {
      yieldValue = this.active.data.yield_g;
    } else {
      const expected = activePreset?.expected_yield_g ?? ls.expected_yield_g;
      yieldValue = (expected !== undefined && expected !== "" && Number(expected) > 0) ? expected : "36";
    }
    const curSession = this.bag?.active_session_id || this.bag?.id;
    const bagShots = this.extractions.filter((item) => (item.bag_session_id || item.bag_id) === curSession).length;
    const bagCost = this.bag ? (Number(this.bag.cost) || 0) : 0;
    const costPerShot = bagCost && bagShots ? `$${(bagCost / bagShots).toFixed(2)}` : null;
    return `${this.bag ? "" : '<p class="notice">Create or select a coffee bag before logging a shot.</p>'}
      <section class="bag-toolbar"><div class="bag-feature">${this.bag ? `<strong class="bag-name">${this.esc(this.bag.name || "Unnamed bag")}</strong>${(this.bag.roaster || this.bag.origin) ? `<span class="bag-meta">${this.esc([this.bag.roaster, this.bag.origin].filter(Boolean).join(" · "))}</span>` : ""}<div class="bag-stats">${bagCost ? `<span>$${bagCost.toFixed(2)}</span>` : ""}<span>${bagShots} shot${bagShots === 1 ? "" : "s"}</span>${costPerShot ? `<span class="bag-cps">${costPerShot}/shot</span>` : ""}</div>` : '<span class="bag-empty">No bag selected</span>'}</div><div class="bag-toolbar-right"><label class="bag-switch"><select id="bag-select"><option value="">Select a bag</option>${options}</select></label>${this.editing ? '<div class="bag-actions"><button id="save-edit">Save Changes</button><button id="cancel-edit" class="cancel">Cancel</button></div>' : ""}</div></section>
      <div class="timer-yield-container" style="display:flex;flex-direction:row;align-items:stretch;gap:24px;">
        <section class="timer-card ${this.active && !this.active.stopped_at ? "active" : ""}">
          <svg viewBox="0 0 360 250" aria-label="Espresso extraction timer"><rect class="machine" x="45" y="20" width="270" height="92" rx="16"/><rect class="machine-dark" x="78" y="42" width="204" height="18" rx="9"/><circle class="light" cx="270" cy="87" r="8"/><path class="portafilter" d="M128 112h104v18c0 12-10 22-22 22h-60c-12 0-22-10-22-22z"/><path class="handle" d="M232 118h48c18 0 24 10 24 17s-6 12-18 12h-54"/><path class="stream" d="M166 153v40 M194 153v40"/><path class="coffee" d="M125 202h110c0 24-20 34-55 34s-55-10-55-34z"/><path class="coffee-top" d="M132 203c20-8 76-8 96 0"/></svg>
          <div class="brew-steam"><i></i><i></i><i></i></div>
          <div class="elapsed" id="elapsed">${this.formatElapsed(elapsed)}</div>
          <div class="caption">${this.active ? (this.active.stopped_at ? "Enter final yield, then Save" : "Extracting") : "Ready for a shot"}</div>
        </section>
        <div class="actual-yield-section"><p class="brew-greeting">${this.esc(this.greeting)}</p><label style="font-size:18px;font-weight:600;color:var(--primary-text-color);margin-bottom:8px;display:flex;flex-direction:column;align-items:center;gap:8px;">Actual yield (g)<div class="yield-input-wrapper" style="display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;"><input name="yield_g" type="number" step="0.1" placeholder="Actual yield (g)" aria-label="Actual yield (g)" value="${this.esc(yieldValue)}" class="large-number-input" style="font-size:56px;padding:24px 32px;width:100%;max-width:100%;min-width:0;text-align:center;border-radius:14px;border:1px solid rgba(255,255,255,0.6);background:rgba(255,255,255,0.1);color:var(--primary-text-color);font-weight:600;box-sizing:border-box;min-height:240px;-webkit-appearance:textfield;-moz-appearance:textfield;appearance:textfield;"/><div class="yield-step-buttons" style="display:flex;gap:16px;"><button type="button" class="yield-step-btn yield-step-down" aria-label="Decrease" style="width:56px;height:56px;border-radius:50%;border:1px solid rgba(255,255,255,0.6);background:rgba(255,255,255,0.1);color:var(--primary-text-color);font-size:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation;">−</button><button type="button" class="yield-step-btn yield-step-up" aria-label="Increase" style="width:56px;height:56px;border-radius:50%;border:1px solid rgba(255,255,255,0.6);background:rgba(255,255,255,0.1);color:var(--primary-text-color);font-size:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation;">+</button></div><div class="yield-controls"><button id="timer" ${this.bag && !this.editing ? "" : "disabled"} class="yield-start-btn">${this.active ? (this.active.stopped_at ? "Save" : "Stop") : "Start"}</button><button id="clear-timer" class="yield-start-btn clear" ${this.active ? "" : "hidden"}>Clear</button></div></div></label></div>
      </div>`;
  }

  bagsView() {
    const cards = this.bags.map((bag) => { const active = bag.id === this.bag?.id; const done = Boolean(bag.completed_at); const meta = [bag.roaster, bag.roast_date].filter(Boolean).join(" · "); const sub = [bag.origin, bag.flavor_profile].filter(Boolean).join(" · "); return `<article class="bag-card ${active ? "active" : ""} ${done ? "done" : ""} ${done ? "" : "bag-card-select"}" data-id="${bag.id}"><div class="bag-card-head"><h2>${this.esc(bag.name)}</h2>${done ? '<span class="bag-done-badge">Done</span>' : '<span class="bag-progress-badge">In progress</span>'}</div><p class="bag-card-meta">${meta ? this.esc(meta) : "—"}</p>${sub ? `<p class="bag-card-sub">${this.esc(sub)}</p>` : ""}${done ? '<p class="bag-done-note">Marked done — add a roast date to reuse.</p>' : ""}<div class="bag-card-actions">${done ? `<button class="reopen-bag-card" data-id="${bag.id}">Reopen</button>` : `<button class="edit-bag-card" data-id="${bag.id}">Settings</button>`}<button class="${done ? "delete-bag-card" : "mark-done-bag-card"}" data-id="${bag.id}">${done ? "Delete" : "Mark done"}</button>${done ? "" : `<button class="delete-bag-card" data-id="${bag.id}">Delete</button>`}</div></article>`; }).join("");
    const bag = this.bag || {};
    const ls = bag.last_settings || {};
    const ep = this.editPreset || {};
    const ef = { ...ls, ...this.editPreset ? { recipe: ep.recipe, dose_g: ep.dose_g, expected_yield_g: ep.expected_yield_g, brew_time_s: ep.brew_time_s, temperature_c: ep.temperature_c, grind: ep.grind, pressure_bar: ep.pressure_bar } : {} };
    const recipes = Object.entries(this.recipes).map(([name, ratio]) => `<option value="${this.esc(name)}" ${ef.recipe === name ? "selected" : ""}>${this.esc(name)} (1:${ratio})</option>`).join("");
    const presets = (bag.presets || []).map((p) => `<option value="${this.esc(p.id)}">${this.esc(p.name)}</option>`).join("");
    const activeId = bag.active_preset_id;
    const presetChips = (bag.presets || []).map((p) => `<span class="preset-chip ${p.id === activeId ? "active" : ""}" data-id="${this.esc(p.id)}" role="button" tabindex="0" title="${p.id === activeId ? "Active preset — click a different one to switch" : "Click to make active"}">${p.id === activeId ? "● " : ""}${this.esc(p.name)}<button type="button" class="edit-preset" data-id="${this.esc(p.id)}" aria-label="Edit preset ${this.esc(p.name)}" title="Edit preset">✎</button><button type="button" class="delete-preset" data-id="${this.esc(p.id)}" aria-label="Delete preset ${this.esc(p.name)}">×</button></span>`).join("");
    return `<div class="bags-toolbar"><button id="new-bag">New Bag</button><button id="copy-bag" ${this.bag ? "" : "disabled"}>Copy Active</button></div><div class="grid">${cards || '<p class="notice">No coffee bags yet.</p>'}</div>${this.finishModalHtml()}<section class="bag-editor"><h2>${bag.id ? `Edit ${this.esc(bag.name)}` : "Create Coffee Bag"}</h2>
      <h3 class="bag-details-title">Bag details</h3>
      <form id="bag-form" class="bag-details-form"><input name="name" required placeholder="Coffee name" value="${this.esc(bag.name)}"/><input name="roaster" placeholder="Roaster" value="${this.esc(bag.roaster)}"/><input name="roast_date" type="date" value="${this.esc(bag.roast_date)}"/><input name="roast_level" placeholder="Roast level" value="${this.esc(bag.roast_level)}"/><input name="origin" placeholder="Origin / location" value="${this.esc(bag.origin)}"/><input name="process" placeholder="Processing method" value="${this.esc(bag.process)}"/><input name="varietals" placeholder="Varietals" value="${this.esc(bag.varietals)}"/><input name="flavor_profile" placeholder="Flavor profile" value="${this.esc(bag.flavor_profile)}"/><input name="cost" type="number" step="0.01" min="0" placeholder="Bag cost ($)" value="${this.esc(bag.cost)}"/><textarea name="notes" placeholder="Notes" aria-label="Notes">${this.esc(bag.notes)}</textarea><button class="form-save">Save Bag</button></form>
      ${bag.id ? `<div class="bag-settings">
        <h3>Extraction Settings</h3>
        <div class="settings-group recipe-group"><label class="field-label">Recipe<select name="recipe">${recipes}</select></label></div>
        <div class="settings-grid">
          <div class="settings-group"><span class="group-label">Portafilter</span><label class="field-label">Dose (g)<input name="dose_g" inputmode="decimal" placeholder="e.g. 18" value="${this.esc(ef.dose_g)}"/></label><label class="field-label">Expected yield (g)<input name="expected_yield_g" inputmode="decimal" placeholder="e.g. 36" value="${this.esc(ef.expected_yield_g)}"/></label></div>
          <div class="settings-group"><span class="group-label">Brew profile</span><label class="field-label">Brew time<input name="brew_time_s" inputmode="decimal" placeholder="Seconds or MM:SS" value="${this.esc(ef.brew_time_s)}"/></label><label class="field-label">Temperature (°C)<input name="temperature_c" type="number" step="0.1" placeholder="e.g. 93" value="${this.esc(ef.temperature_c)}"/></label></div>
          <div class="settings-group"><span class="group-label">Grind & pressure</span><label class="field-label">Grind<input name="grind" placeholder="e.g. Medium-fine" value="${this.esc(ef.grind)}"/></label><label class="field-label">Pressure (bar)<input name="pressure_bar" type="number" step="0.1" placeholder="e.g. 9" value="${this.esc(ef.pressure_bar)}"/></label></div>
        </div>
        ${this.editPreset ? `<div class="preset-edit-banner"><span>Editing preset: <strong>${this.esc(this.editPreset.name || "Untitled")}</strong></span><button type="button" id="cancel-edit-preset">Cancel edit</button></div>` : ""}
        <form id="bag-settings-form">${this.editPreset ? `<label class="field-label">Preset name<input name="preset_name" value="${this.esc(this.editPreset.name || "")}"/></label>` : ""}<button type="submit" class="form-save">${this.editPreset ? "Save Changes to Preset" : "Save Settings"}</button></form>
        <div class="presets-block">
          <div class="presets-head"><span class="group-label">Presets</span>${this.editPreset ? "" : `<button type="button" id="bag-save-preset">+ Save As Preset</button>`}</div>
          <div class="preset-list">${presetChips || '<span class="notice">No presets saved for this bag. Save one to reuse a recipe.</span>'}</div>
          <p class="preset-hint">${this.editPreset ? "Editing a preset — adjust the fields above, then save." : "Click a preset to make it active for this bag. ✎ edits it."}</p>
        </div>
      </div>` : ""}
    </section>`;
  }

  finishModalHtml() {
    const modal = this.finishModal;
    if (!modal) return "";
    const bag = modal.bag;
    const isReopen = modal.mode === "reopen";
    return `<div class="finish-panel" id="finish-modal"><div class="modal"><h2>${isReopen ? `Reopen ${this.esc(bag.name)}` : `Finish ${this.esc(bag.name)}`}</h2><p class="modal-sub">${isReopen ? "Provide the roast date to start a fresh session for this bag." : "Add a new bag of the same coffee, or just mark this one done."}</p><label class="modal-field">Roast date of the new bag<input id="finish-roast-date" type="date" value="${this.esc(bag.roast_date || "")}"/></label><div class="modal-actions">${isReopen ? `<button id="finish-submit" class="primary">Reopen bag</button>` : `<button id="finish-submit" class="primary">Finish with new bag</button><button id="finish-just-done">Just mark done</button>`}<button id="finish-cancel" class="cancel">Cancel</button></div></div></div>`;
  }

  historyView() {
    const bagOptions = this.bags.map((bag) => `<option value="${bag.id}" ${this.filterBag === bag.id ? "selected" : ""}>${this.esc(bag.name)}</option>`).join("");
    const recipeSet = [...new Set(this.extractions.map((i) => i.recipe).filter(Boolean))].sort();
    const recipeOptions = recipeSet.map((r) => `<option value="${this.esc(r)}" ${this.filterRecipe === r ? "selected" : ""}>${this.esc(r)}</option>`).join("");
    const ratingOptions = ["3", "4", "5"].map((r) => `<option value="${r}" ${this.filterRating === r ? "selected" : ""}>${r}+ star${r === "5" ? "" : "s"}</option>`).join("");
    const statusOptions = [["progress", "In progress"], ["done", "Done"], ["deleted", "Deleted"]].map(([v, l]) => `<option value="${v}" ${this.filterStatus === v ? "selected" : ""}>${l}</option>`).join("");
    const statuses = this.sessionStatuses();
    let records = this.extractions.filter((item) => {
      const sid = item.bag_session_id || item.bag_id;
      if (this.filterStatus && (statuses[sid] || "progress") !== this.filterStatus) return false;
      if (this.filterBag && item.bag_id !== this.filterBag) return false;
      if (this.filterRecipe && item.recipe !== this.filterRecipe) return false;
      if (this.filterRating && this.number(item.rating) < this.number(this.filterRating)) return false;
      if (this.filterFrom && item.created_at.slice(0, 10) < this.filterFrom) return false;
      if (this.filterTo && item.created_at.slice(0, 10) > this.filterTo) return false;
      return true;
    }).slice().sort((a, b) => this.sortDir * (String(a[this.sortKey]).localeCompare(String(b[this.sortKey]), undefined, { numeric: true }) || String(a.created_at).localeCompare(String(b.created_at))));
    const chrono = records.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const avgDose = records.length ? (records.reduce((s, i) => s + this.number(i.dose_g), 0) / records.length).toFixed(1) : "--";
    const avgYield = records.length ? (records.reduce((s, i) => s + this.number(i.yield_g), 0) / records.length).toFixed(1) : "--";
    const avgRatio = records.length ? (records.reduce((sum, item) => sum + this.number(item.ratio), 0) / records.length).toFixed(2) : "--";
    const avgTime = records.length ? (records.reduce((sum, item) => sum + this.number(item.brew_time_s), 0) / records.length).toFixed(1) : "--";
    const avgRating = records.length ? (records.reduce((sum, item) => sum + this.number(item.rating), 0) / records.length).toFixed(1) : "--";
    const histBag = this.bags.find((b) => b.id === this.filterBag) || null;
    const histCost = histBag ? (Number(histBag.cost) || 0) : this.bags.reduce((sum, b) => sum + (Number(b.cost) || 0), 0);
    const histSession = histBag?.active_session_id || histBag?.id;
    const histCount = histBag ? this.extractions.filter((i) => (i.bag_session_id || i.bag_id) === histSession).length : records.length;
    const histCps = histCost && histCount ? `$${(histCost / histCount).toFixed(2)}` : null;
    const th = (key, label) => `<th data-sort="${key}" class="${this.sortKey === key ? "sorted" : ""}">${label}${this.sortKey === key ? (this.sortDir < 0 ? " ▾" : " ▴") : ""}</th>`;
    const fmtDate = (ts) => this.formatDate(ts);
    const fmtTime = (sec) => this.formatTime(this.number(sec));
    const bagLabels = this.bagInstanceLabels();
    this._visible = records.map((r) => r.id);
    const recipeOptionsInline = (sel) => Object.entries(this.recipes).map(([nm, rt]) => `<option value="${this.esc(nm)}" ${nm === sel ? "selected" : ""}>${this.esc(nm)} (1:${rt})</option>`).join("");
    const mainRows = records.map((item) => {
      const sid = item.bag_session_id || item.bag_id;
      const bi = bagLabels[sid] || { label: item.bag_snapshot?.name || "Unknown", st: "progress" };
      if (this.editRow === item.id) {
        return `<tr class="shot-row editing" data-eid="${this.esc(item.id)}"><td></td><td>${this.esc(bi.label)}${this.statusTag(bi.st)}</td><td>${fmtDate(item.created_at)}</td><td><select name="recipe">${recipeOptionsInline(item.recipe)}</select></td><td><input name="dose_g" inputmode="decimal" value="${this.esc(item.dose_g ?? "")}"/></td><td><input name="yield_g" inputmode="decimal" value="${this.esc(item.yield_g ?? "")}"/></td><td><input name="brew_time_s" inputmode="decimal" value="${this.esc(item.brew_time_s ?? "")}"/></td><td><input name="ratio" inputmode="decimal" value="${this.esc(item.ratio ?? "")}"/></td><td><input name="rating" inputmode="decimal" value="${this.esc(item.rating ?? "")}"/></td><td><button class="save-inline" data-id="${this.esc(item.id)}">Save</button><button class="cancel-inline" data-id="${this.esc(item.id)}">Cancel</button></td></tr>`;
      }
      return `<tr class="shot-row" data-sid="${this.esc(sid)}"><td><input type="checkbox" class="row-check" data-id="${item.id}" ${this.selected[item.id] ? "checked" : ""}></td><td>${this.esc(bi.label)}${this.statusTag(bi.st)}</td><td>${fmtDate(item.created_at)}</td><td>${this.esc(item.recipe || "—")}</td><td>${this.number(item.dose_g) || "—"}</td><td>${this.number(item.yield_g) || "—"}</td><td>${fmtTime(item.brew_time_s)}</td><td>${item.ratio ?? "—"}</td><td>${item.rating ? `${item.rating}/5` : "—"}</td><td><button class="edit-shot" data-id="${item.id}">Edit</button><button class="delete" data-id="${item.id}">Delete</button></td></tr>`;
    }).join("");
    const sessionHeaders = this.buildSessionHeaders(records);
    const selCount = Object.keys(this.selected).length;
    const bulkControls = selCount ? `<div class="bulk-toolbar">${this.bulkEdit ? `<div class="bulk-form"><h3>Bulk edit ${selCount} shot${selCount === 1 ? "" : "s"}</h3><div class="bulk-fields"><label>Recipe<select name="recipe">${recipeOptionsInline("")}</select></label><label>Dose (g)<input name="dose_g" inputmode="decimal"/></label><label>Yield (g)<input name="yield_g" inputmode="decimal"/></label><label>Time (s)<input name="brew_time_s" inputmode="decimal"/></label><label>Ratio<input name="ratio" inputmode="decimal"/></label><label>Rating<input name="rating" inputmode="decimal"/></label></div><div class="bulk-actions"><button id="bulk-apply">Apply to ${selCount}</button><button id="bulk-cancel" class="cancel">Cancel</button></div></div>` : `<button id="bulk-start">Bulk edit ${selCount}</button><button id="bulk-delete" class="danger">Delete ${selCount}</button><button id="bulk-clear">Clear</button>`}</div>` : "";
    const tbody = this.filterBag ? `<tbody>${mainRows || '<tr><td colspan="10">No matching extractions.</td></tr>'}</tbody>` : `<tbody>${sessionHeaders}${mainRows || '<tr class="empty-row"><td colspan="10">No matching extractions.</td></tr>'}</tbody>`;
    return `<section class="filters"><label>Bag<select id="history-bag"><option value="">All bags</option>${bagOptions}</select></label><label>From<input id="history-from" type="date" value="${this.esc(this.filterFrom || "")}"/></label><label>To<input id="history-to" type="date" value="${this.esc(this.filterTo || "")}"/></label>${recipeOptions ? `<label>Recipe<select id="history-recipe"><option value="">All recipes</option>${recipeOptions}</select></label>` : ""}<label>Rating<select id="history-rating"><option value="">Any rating</option>${ratingOptions}</select></label><label>Status<select id="history-status"><option value="">Any status</option>${statusOptions}</select></label><button id="clear-filters">Clear</button></section><div class="summary-grid"><div class="metric"><span>Shots</span><strong>${records.length}</strong></div><div class="metric"><span>Avg dose</span><strong>${avgDose}<small>g</small></strong></div><div class="metric"><span>Avg yield</span><strong>${avgYield}<small>g</small></strong></div><div class="metric"><span>Avg ratio</span><strong>${avgRatio}</strong></div><div class="metric"><span>Avg brew</span><strong>${avgTime}<small>s</small></strong></div><div class="metric"><span>Avg rating</span><strong>${avgRating}<small>/5</small></strong></div><div class="metric"><span>${histBag ? "Bag cost" : "Total cost"}</span><strong>${histCost ? `$${histCost.toFixed(2)}` : "--"}</strong></div><div class="metric"><span>Cost / shot</span><strong>${histCps ?? "--"}</strong></div></div><div class="charts"><div class="chart-card"><h2>Yield trend</h2>${this.lineChart(chrono, "yield_g", "g")}</div><div class="chart-card"><h2>Brew-time consistency</h2>${this.lineChart(chrono, "brew_time_s", "s")}</div><div class="chart-card"><h2>Bag comparison</h2>${this.bagChart(chrono)}</div><div class="chart-card"><h2>Target deviation</h2>${this.deviationChart(chrono)}</div><div class="chart-card"><h2>Dose vs yield</h2>${this.scatterChart(chrono)}</div><div class="chart-card"><h2>Rating distribution</h2>${this.ratingChart(chrono)}</div></div>${bulkControls}<table><thead><tr><th><input type="checkbox" id="check-all" ${records.length && selCount === records.length ? "checked" : ""}></th><th>Bag</th>${th("created_at", "Date")}${th("recipe", "Recipe")}${th("dose_g", "Dose")}${th("yield_g", "Yield")}${th("brew_time_s", "Time")}${th("ratio", "Ratio")}${th("rating", "Rating")}<th></th></tr></thead>${tbody}</table>`;
  }

  lineChart(records, key, unit) {
    if (!records.length) return '<p class="notice">No data.</p>';
    const ordered = records.slice().reverse(); const values = ordered.map((item) => this.number(item[key])); const max = Math.max(...values, 1); const points = values.map((value, i) => `${10 + i * (280 / Math.max(values.length - 1, 1))},${105 - (value / max) * 85}`).join(" "); const dots = values.map((value, i) => `<circle cx="${10 + i * (280 / Math.max(values.length - 1, 1))}" cy="${105 - (value / max) * 85}" r="4"><title>${this.esc(ordered[i].created_at)}: ${value} ${unit}</title></circle>`).join("");
    return `<svg class="chart" viewBox="0 0 300 120"><path class="gridline" d="M10 105H290 M10 62H290 M10 20H290"/><polyline points="${points}"/>${dots}<text x="10" y="118">${values[0]} ${unit}</text><text x="245" y="15">max ${max.toFixed(1)}</text></svg>`;
  }

  bagChart(records) {
    const grouped = {};
    records.forEach((item) => {
      const sid = item.bag_session_id || item.bag_id;
      const bag = this.bags.find((b) => b.id === item.bag_id);
      const group = grouped[sid] ||= { count: 0, ratio: 0, label: bag?.name || item.bag_snapshot?.name || "Unknown", date: item.bag_snapshot?.roast_date || bag?.roast_date || null };
      group.count += 1;
      group.ratio += this.number(item.ratio);
    });
    const max = Math.max(...Object.values(grouped).map((item) => item.count), 1);
    return `<div class="bars">${Object.entries(grouped).map(([sid, value]) => `<div><span>${this.esc(value.label + (value.date ? ` (${value.date})` : ""))} · avg ${(value.ratio / value.count).toFixed(2)}</span><i style="width:${(value.count / max) * 100}%">${value.count} shots</i></div>`).join("") || "<p class='notice'>No data.</p>"}</div>`;
  }

  deviationChart(records) {
    const values = records.filter((item) => this.number(item.expected_yield_g)).slice().reverse().map((item) => ({ value: ((this.number(item.yield_g) - this.number(item.expected_yield_g)) / this.number(item.expected_yield_g)) * 100, date: item.created_at }));
    if (!values.length) return '<p class="notice">Expected yields are needed for this chart.</p>';
    const max = Math.max(...values.map((item) => Math.abs(item.value)), 1); const bars = values.map((item, index) => `<rect x="${10 + index * (280 / values.length)}" y="${item.value >= 0 ? 60 - (item.value / max) * 40 : 60}" width="${Math.max(5, 260 / values.length)}" height="${Math.abs(item.value / max) * 40}" class="${item.value >= 0 ? "positive" : "negative"}><title>${this.esc(item.date)}: ${item.value.toFixed(1)}%</title></rect>`).join("");
    return `<svg class="chart" viewBox="0 0 300 120"><path class="gridline" d="M10 60H290"/>${bars}<text x="10" y="115">below target</text><text x="235" y="115">above target</text></svg>`;
  }

  formatDate(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    if (isNaN(d)) return this.esc(ts);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  statusTag(st) {
    if (st === "done") return '<span class="hist-status hist-done">Done</span>';
    if (st === "deleted") return '<span class="hist-status hist-deleted">Deleted</span>';
    return '<span class="hist-status hist-progress">In progress</span>';
  }

  sessionStatuses() {
    const statuses = {};
    const norm = (v) => String(v || "").trim().toLowerCase();
    this.extractions.forEach((item) => {
      const sid = item.bag_session_id || item.bag_id;
      const bag = this.bags.find((b) => b.id === item.bag_id) || null;
      const snap = item.bag_snapshot;
      const name = bag?.name || snap?.name || "Unknown";
      const roaster = bag?.roaster || snap?.roaster || "";
      const match = this.bags.find((b) => norm(b.name) === norm(name) && norm(b.roaster) === norm(roaster) && norm(name));
      const st = !match ? "deleted" : (match?.completed_at ?? snap?.completed_at) ? "done" : "progress";
      if (!(sid in statuses)) statuses[sid] = st;
    });
    return statuses;
  }

  bagInstanceLabels() {
    const map = {};
    const sessions = {};
    const statuses = this.sessionStatuses();
    this.extractions.forEach((item) => {
      const sid = item.bag_session_id || item.bag_id;
      const bag = this.bags.find((b) => b.id === item.bag_id) || null;
      const snap = item.bag_snapshot;
      const name = bag?.name || snap?.name || "Unknown";
      const roaster = bag?.roaster || snap?.roaster || "";
      const rec = { sid, name, roaster, roast_date: bag?.roast_date || snap?.roast_date || null, created_at: item.created_at, st: statuses[sid] || "progress" };
      (sessions[sid] = sessions[sid] || { ...rec, count: 0 });
    });
    const groups = {};
    Object.values(sessions).forEach((s) => { const key = (s.name + "|" + s.roaster).toLowerCase(); (groups[key] = groups[key] || []).push(s); });
    Object.values(groups).forEach((list) => {
      list.sort((a, b) => String(a.roast_date || "").localeCompare(String(b.roast_date || "")) || String(a.created_at).localeCompare(String(b.created_at)));
      list.forEach((s, i) => {
        const rd = s.roast_date ? ` · ${s.roast_date.slice(0, 5)}` : "";
        map[s.sid] = { label: `${s.name}${rd} · Bag #${i + 1}`, st: s.st };
      });
    });
    return map;
  }

  buildSessionHeaders(records) {
    const order = [];
    const seen = new Set();
    records.forEach((item) => { const sid = item.bag_session_id || item.bag_id; if (!seen.has(sid)) { seen.add(sid); order.push(sid); } });
    const groups = {};
    records.forEach((item) => { const sid = item.bag_session_id || item.bag_id; (groups[sid] = groups[sid] || []).push(item); });
    const labels = this.bagInstanceLabels();
    return order.map((sid) => {
      const list = groups[sid];
      const info = labels[sid] || { label: list[0].bag_snapshot?.name || "Unknown", st: "progress" };
      const badge = this.statusTag(info.st);
      const avg = (list.reduce((s, i) => s + this.number(i.ratio), 0) / list.length).toFixed(2);
      const first = this.formatDate(list[list.length - 1]?.created_at);
      return `<tr class="session-row"><td colspan="10"><span class="session-name">${this.esc(info.label)}</span>${badge}<span class="session-meta">${list.length} shot${list.length === 1 ? "" : "s"} · avg ratio ${avg} · ${this.esc(first)}</span></td></tr>`;
    }).join("");
  }

  scatterChart(records) {
    const pts = records.map((item) => ({ x: this.number(item.dose_g), y: this.number(item.yield_g), label: item.created_at, name: item.bag_snapshot?.name || this.bags.find((b) => b.id === item.bag_id)?.name || "Unknown" }));
    const good = pts.filter((p) => p.x > 0 && p.y > 0);
    if (!good.length) return '<p class="notice">Dose and yield values are needed for this chart.</p>';
    const maxX = Math.max(...good.map((p) => p.x), 1) * 1.1;
    const maxY = Math.max(...good.map((p) => p.y), 1) * 1.1;
    const m = new Map(); const colors = {};
    let ci = 0; const palette = ["#58b889", "#e27666", "#5aa7e2", "#e2b65a", "#9a6fe0", "#e27ad7", "#4bc2c2", "#c2a05a"];
    good.forEach((p) => { if (!m.has(p.name)) m.set(p.name, palette[ci++ % palette.length]); colors[p.name] = m.get(p.name); });
    const dots = good.map((p, i) => `<circle cx="${10 + (p.x / maxX) * 280}" cy="${105 - (p.y / maxY) * 85}" r="4" fill="${colors[p.name]}"><title>${this.esc(p.name)} · ${this.esc(p.label)}: ${p.x}g dose → ${p.y}g yield</title></circle>`).join("");
    const legend = [...m.entries()].map(([name, c]) => `<span class="scatter-legend"><i style="background:${c}"></i>${this.esc(name)}</span>`).join("");
    return `<div class="scatter-wrap"><svg class="chart scatter" viewBox="0 0 300 120"><path class="gridline" d="M10 105H290 M10 62H290 M10 20H290"/><text x="10" y="118">dose →</text><text x="245" y="15">yield ↑</text>${dots}</svg><div class="scatter-legend-wrap">${legend}</div></div>`;
  }

  ratingChart(records) {
    const counts = [0, 0, 0, 0, 0];
    records.forEach((item) => { const r = this.number(item.rating); if (r >= 1 && r <= 5) counts[r - 1] += 1; });
    if (!records.some((item) => this.number(item.rating) > 0)) return '<p class="notice">Ratings are needed for this chart.</p>';
    const max = Math.max(...counts, 1);
    const bars = counts.map((c, i) => `<div class="rating-bar"><span>${i + 1}</span><i style="width:${(c / max) * 100}%">${c || ""}</i></div>`).join("");
    return `<div class="rating-chart">${bars}</div>`;
  }

  bind() {
    this.shadowRoot.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => { this.tab = button.dataset.tab; try { window.localStorage.setItem("espresso_extractions_tab", this.tab); } catch (e) {} this.editing = null; this.render(); }));
    const backBtn = this.shadowRoot.querySelector("#back-home");
    if (backBtn) {
      let singleTimer = null;
      let pressTimer = null;
      let longPressed = false;
      backBtn.addEventListener("click", () => {
        const now = Date.now();
        if (this._backLastTap && now - this._backLastTap < 350) {
          clearTimeout(singleTimer);
          singleTimer = null;
          this._backLastTap = null;
          longPressed = false;
          clearTimeout(pressTimer);
          this.openSettings();
          return;
        }
        this._backLastTap = now;
        clearTimeout(singleTimer);
        singleTimer = setTimeout(() => {
          this._backLastTap = null;
          if (!longPressed) this.goHome();
          longPressed = false;
        }, 350);
      });
      backBtn.addEventListener("pointerdown", () => {
        clearTimeout(pressTimer);
        longPressed = false;
        pressTimer = setTimeout(() => { longPressed = true; this.openSettings(); }, 650);
      });
      backBtn.addEventListener("pointerup", () => { clearTimeout(pressTimer); });
      backBtn.addEventListener("pointerleave", () => { clearTimeout(pressTimer); });
    }
    this.shadowRoot.querySelector("#settings-save")?.addEventListener("click", () => this.saveSettings());
    this.shadowRoot.querySelector("#settings-reset")?.addEventListener("click", () => { this.settingsDraft = "/lovelace"; this.saveSettings(); });
    this.shadowRoot.querySelector("#settings-cancel")?.addEventListener("click", () => { this.settingsOpen = false; this.render(); });
    this.shadowRoot.querySelector("#settings-path")?.addEventListener("input", (event) => { this.settingsDraft = event.target.value; });
    this.shadowRoot.querySelector("#bag-select")?.addEventListener("change", (event) => { this.bag = this.bags.find((bag) => bag.id === event.target.value) || null; this.formState = {}; this.render(); });
    this.shadowRoot.querySelector("#finish-submit")?.addEventListener("click", async () => { const modal = this.finishModal; if (!modal) return; const date = this.shadowRoot.querySelector("#finish-roast-date")?.value || ""; let result; if (modal.mode === "reopen") { result = await this.call("reopen_bag", { bag_id: modal.bag.id, roast_date: date }); } else { result = await this.call("complete_bag", { bag_id: modal.bag.id, roast_date: date, just_done: false }); } this.bag = result.bag; this.finishModal = null; await this.load(); });
    this.shadowRoot.querySelector("#finish-just-done")?.addEventListener("click", async () => { const modal = this.finishModal; if (!modal) return; const result = await this.call("complete_bag", { bag_id: modal.bag.id, roast_date: modal.bag.roast_date || "", just_done: true }); this.bag = result.bag; this.finishModal = null; await this.load(); });
    this.shadowRoot.querySelector("#finish-cancel")?.addEventListener("click", () => { this.finishModal = null; this.render(); });
    this.shadowRoot.querySelector("#new-bag")?.addEventListener("click", () => { this.tab = "bags"; this.bag = null; this.render(); });
    this.shadowRoot.querySelector("#copy-bag")?.addEventListener("click", async () => { this.bag = await this.call("copy_bag", { bag_id: this.bag.id }); await this.load(); });
    this.shadowRoot.querySelector("#edit-bag")?.addEventListener("click", () => { this.tab = "bags"; this.render(); });
    this.shadowRoot.querySelector("#timer")?.addEventListener("click", () => this.toggleTimer());
    this.shadowRoot.querySelector("#clear-timer")?.addEventListener("click", async () => { await this.call("clear"); this.active = null; this.updateTimerUI(); });
    this.shadowRoot.querySelector("#cancel-edit")?.addEventListener("click", () => { this.editing = null; this.render(); });
    this.shadowRoot.querySelector("#save-edit")?.addEventListener("click", () => this.saveShot());
    this.shadowRoot.querySelector("[name=yield_g]")?.addEventListener("change", (event) => this.handleYieldChange(event));
    this.shadowRoot.querySelector("#bag-form")?.addEventListener("submit", (event) => this.saveBag(event));
    this.shadowRoot.querySelector("#bag-save-preset")?.addEventListener("click", () => this.saveBagPreset());
    this.shadowRoot.querySelector("#bag-settings-form")?.addEventListener("submit", (event) => this.saveBagSettings(event));
    this.shadowRoot.querySelectorAll(".delete-preset").forEach((button) => button.addEventListener("click", async () => { if (this.bag) { await this.call("delete_preset", { bag_id: this.bag.id, preset_id: button.dataset.id }); await this.load(); } }));
    this.shadowRoot.querySelectorAll(".edit-preset").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); const preset = (this.bag?.presets || []).find((p) => p.id === button.dataset.id); if (preset) { this.editPreset = { ...preset }; this.render(); } }));
    this.shadowRoot.querySelector("#cancel-edit-preset")?.addEventListener("click", () => { this.editPreset = null; this.render(); });
    this.shadowRoot.querySelectorAll(".preset-chip").forEach((chip) => chip.addEventListener("click", async (event) => { if (event.target.closest(".delete-preset") || event.target.closest(".edit-preset")) return; if (this.bag) { await this.call("set_active_preset", { bag_id: this.bag.id, preset_id: chip.dataset.id }); await this.load(); } }));
    this.shadowRoot.querySelectorAll(".bag-card-select").forEach((card) => card.addEventListener("click", (event) => { if (event.target.closest("button")) return; this.bag = this.bags.find((bag) => bag.id === card.dataset.id); this.render(); }));
    this.shadowRoot.querySelectorAll(".edit-bag-card").forEach((button) => button.addEventListener("click", () => { this.bag = this.bags.find((bag) => bag.id === button.dataset.id); this.render(); }));
    this.shadowRoot.querySelectorAll(".mark-done-bag-card").forEach((button) => button.addEventListener("click", () => { const target = this.bags.find((bag) => bag.id === button.dataset.id); if (target) { this.finishModal = { bag: target, mode: "finish" }; this.render(); } }));
    this.shadowRoot.querySelectorAll(".reopen-bag-card").forEach((button) => button.addEventListener("click", () => { const target = this.bags.find((bag) => bag.id === button.dataset.id); if (target) { this.finishModal = { bag: target, mode: "reopen" }; this.render(); } }));
    this.shadowRoot.querySelectorAll(".delete-bag-card").forEach((button) => button.addEventListener("click", async () => { if (confirm("Delete this bag? This cannot be undone.")) { await this.call("delete_bag", { bag_id: button.dataset.id }); await this.load(); } }));
    this.shadowRoot.querySelector("#history-bag")?.addEventListener("change", (event) => { this.filterBag = event.target.value; this.render(); });
    this.shadowRoot.querySelector("#history-from")?.addEventListener("change", (event) => { this.filterFrom = event.target.value; this.render(); });
    this.shadowRoot.querySelector("#history-to")?.addEventListener("change", (event) => { this.filterTo = event.target.value; this.render(); });
    this.shadowRoot.querySelector("#history-recipe")?.addEventListener("change", (event) => { this.filterRecipe = event.target.value; this.render(); });
    this.shadowRoot.querySelector("#history-rating")?.addEventListener("change", (event) => { this.filterRating = event.target.value; this.render(); });
    this.shadowRoot.querySelector("#history-status")?.addEventListener("change", (event) => { this.filterStatus = event.target.value; this.render(); });
    this.shadowRoot.querySelector("#clear-filters")?.addEventListener("click", () => { this.filterBag = ""; this.filterFrom = ""; this.filterTo = ""; this.filterRecipe = ""; this.filterRating = ""; this.filterStatus = ""; this.render(); });
    this.shadowRoot.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => { const key = th.dataset.sort; if (this.sortKey === key) this.sortDir *= -1; else { this.sortKey = key; this.sortDir = key === "created_at" ? -1 : 1; } this.render(); }));
    this.shadowRoot.querySelectorAll(".edit-shot").forEach((button) => button.addEventListener("click", () => { this.editRow = button.dataset.id; this.render(); }));
    this.shadowRoot.querySelectorAll(".save-inline").forEach((button) => button.addEventListener("click", async () => await this.saveInlineEdit(button.dataset.id)));
    this.shadowRoot.querySelectorAll(".cancel-inline").forEach((button) => button.addEventListener("click", () => { this.editRow = null; this.render(); }));
    this.shadowRoot.querySelectorAll(".delete").forEach((button) => button.addEventListener("click", async () => { if (confirm("Delete this extraction?")) { await this.call("delete", { extraction_id: button.dataset.id }); await this.load(); } }));
    this.shadowRoot.querySelectorAll(".row-check").forEach((box) => box.addEventListener("change", () => { if (box.checked) this.selected[box.dataset.id] = true; else delete this.selected[box.dataset.id]; this.render(); }));
    this.shadowRoot.querySelector("#check-all")?.addEventListener("change", (event) => { (this._visible || []).forEach((id) => { if (event.target.checked) this.selected[id] = true; else delete this.selected[id]; }); this.render(); });
    this.shadowRoot.querySelector("#bulk-start")?.addEventListener("click", () => { this.bulkEdit = true; this.render(); });
    this.shadowRoot.querySelector("#bulk-clear")?.addEventListener("click", () => { this.selected = {}; this.bulkEdit = false; this.render(); });
    this.shadowRoot.querySelector("#bulk-cancel")?.addEventListener("click", () => { this.bulkEdit = false; this.render(); });
    this.shadowRoot.querySelector("#bulk-apply")?.addEventListener("click", async () => await this.saveBulkEdit());
    this.shadowRoot.querySelector("#bulk-delete")?.addEventListener("click", async () => {
      const ids = Object.keys(this.selected);
      if (!ids.length) return;
      if (confirm(`Delete ${ids.length} selected extraction${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) {
        for (const id of ids) await this.call("delete", { extraction_id: id });
        this.selected = {};
        this.bulkEdit = false;
        await this.load();
      }
    });
    
  }

  collectRecord() {
    const bag = this.bag || {};
    const source = this.editing ? { ...this.editing }
      : (this.active && this.active.data ? { ...this.active.data }
      : { ...(bag.last_settings || {}) });
    const record = { ...source };
    const yieldInput = this.shadowRoot.querySelector("[name=yield_g]");
    if (yieldInput && yieldInput.value !== "") record.yield_g = yieldInput.value;
    record.bag_id = bag.id || "";
    return { ...this.formState, ...record };
  }
  async handleYieldChange(event) { const box = event.target; this.formState.yield_g = box.value; if (!this.bag) return; const val = box.value; await this.call("set_active_preset_yield", { bag_id: this.bag.id, yield_g: val }); const preset = (this.bag.presets || []).find((p) => p.id === this.bag.active_preset_id); if (preset) preset.expected_yield_g = val; }
  async saveShot() { if (!this.editing) return; const record = this.collectRecord(); record.id = this.editing.id; await this.call("update", { record }); this.editing = null; this.formState = {}; await this.load(); }
  async saveInlineEdit(id) {
    const existing = this.extractions.find((item) => item.id === id);
    if (!existing) return;
    const row = this.shadowRoot.querySelector(`tr[data-eid="${this.esc(id)}"]`);
    if (!row) return;
    const record = { ...existing };
    const get = (name) => row.querySelector(`[name="${name}"]`)?.value;
    record.recipe = get("recipe") ?? record.recipe;
    if (get("dose_g") !== "" && get("dose_g") !== undefined) record.dose_g = get("dose_g");
    if (get("yield_g") !== "" && get("yield_g") !== undefined) record.yield_g = get("yield_g");
    if (get("brew_time_s") !== "" && get("brew_time_s") !== undefined) record.brew_time_s = get("brew_time_s");
    if (get("ratio") !== "" && get("ratio") !== undefined) record.ratio = get("ratio");
    if (get("rating") !== "" && get("rating") !== undefined) record.rating = get("rating");
    await this.call("update", { record });
    this.editRow = null;
    await this.load();
  }
  async saveBulkEdit() {
    const form = this.shadowRoot.querySelector(".bulk-form");
    if (!form) return;
    const get = (name) => form.querySelector(`[name="${name}"]`)?.value;
    const patch = {};
    if (get("recipe")) patch.recipe = get("recipe");
    if (get("dose_g") !== undefined && get("dose_g") !== "") patch.dose_g = get("dose_g");
    if (get("yield_g") !== undefined && get("yield_g") !== "") patch.yield_g = get("yield_g");
    if (get("brew_time_s") !== undefined && get("brew_time_s") !== "") patch.brew_time_s = get("brew_time_s");
    if (get("ratio") !== undefined && get("ratio") !== "") patch.ratio = get("ratio");
    if (get("rating") !== undefined && get("rating") !== "") patch.rating = get("rating");
    if (!Object.keys(patch).length) { this.bulkEdit = false; this.render(); return; }
    const ids = Object.keys(this.selected);
    for (const id of ids) {
      const existing = this.extractions.find((item) => item.id === id);
      if (!existing) continue;
      await this.call("update", { record: { ...existing, ...patch } });
    }
    this.selected = {};
    this.bulkEdit = false;
    await this.load();
  }
  stepYield(dir) {
    const input = this.shadowRoot.querySelector("input[name=yield_g]");
    if (!input) return;
    const step = parseFloat(input.step) || 0.1;
    const value = parseFloat(input.value) || 0;
    input.value = dir > 0 ? (value + step).toFixed(1) : Math.max(0, value - step).toFixed(1);
    input.dispatchEvent(new Event("change"));
  }
  async _handleRemote(action) {
    switch (action) {
      case "start":
        if (!this.bag || this.active || this.editing) return;
        await this.toggleTimer();
        break;
      case "stop":
        if (!this.active || this.active.stopped_at) return;
        await this.toggleTimer();
        break;
      case "save":
        if (!this.active?.stopped_at) return;
        await this.toggleTimer();
        break;
      case "clear":
        if (this.active) { await this.call("clear"); this.active = null; this.updateTimerUI(); }
        break;
      case "plus":
      case "minus":
        this.stepYield(action === "plus" ? 1 : -1);
        break;
    }
  }
  async toggleTimer() { const record = this.collectRecord(); if (this.active?.stopped_at) { await this.call("record", { record }); this.active = null; } else if (this.active) { this.active = await this.call("finish"); } else { this.active = await this.call("start", { record }); } this.updateTimerUI(); }
  async saveBag(event) { event.preventDefault(); const bag = Object.fromEntries(new FormData(event.target)); if (this.bag) bag.id = this.bag.id; this.bag = await this.call("save_bag", { bag }); await this.load(); }
  async saveBagSettings(event) { event.preventDefault(); if (!this.bag) return; const bag = this.bag; const form = this.shadowRoot.querySelector("#bag-settings-form"); const fields = Object.fromEntries(new FormData(form)); const last = {}; for (const key of ["recipe", "dose_g", "expected_yield_g", "brew_time_s", "temperature_c", "grind", "pressure_bar"]) if (fields[key] !== undefined) last[key] = fields[key]; if (this.editPreset) { const name = (fields.preset_name || this.editPreset.name || "").trim(); const next = { ...this.editPreset, name: name || this.editPreset.name, ...last }; bag.presets = (bag.presets || []).map((p) => p.id === next.id ? next : p); this.editPreset = null; this.bag = bag; await this.call("save_preset", { bag_id: bag.id, preset: next }); await this.load(); return; } bag.last_settings = { ...(bag.last_settings || {}), ...last }; if (bag.active_preset_id && last.expected_yield_g !== undefined) { const preset = (bag.presets || []).find((p) => p.id === bag.active_preset_id); if (preset) preset.expected_yield_g = last.expected_yield_g; } this.bag = bag; this.saveBagToServer(); }
  async saveBagToServer() { this.bag = await this.call("save_bag", { bag: this.bag }); await this.load(); }
  async saveBagPreset() { if (!this.bag) return; const name = prompt("Preset name:"); if (!name?.trim()) return; const form = this.shadowRoot.querySelector("#bag-settings-form"); const fields = Object.fromEntries(new FormData(form)); const preset = { name: name.trim() }; for (const key of ["recipe", "dose_g", "expected_yield_g", "brew_time_s", "temperature_c", "grind", "pressure_bar"]) if (fields[key] !== undefined) preset[key] = fields[key]; await this.call("save_preset", { bag_id: this.bag.id, preset }); await this.load(); }
  elapsedSeconds() { if (!this.active?.started_at) return 0; const end = this.active.stopped_at ? Date.parse(this.active.stopped_at) : Date.now(); return Math.max(0, (end - Date.parse(this.active.started_at)) / 1000); }
  formatTime(seconds) { return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`; }
  formatElapsed(seconds) { return `${Math.floor(seconds)}`; }
  renderTimer() { const value = this.formatElapsed(this.elapsedSeconds()); const element = this.shadowRoot.querySelector("#elapsed"); if (element) element.textContent = value; const screenTime = this.shadowRoot.querySelector(".brew-time"); if (screenTime) screenTime.textContent = value; }
  updateTimerUI() {
    const timerBtn = this.shadowRoot.querySelector("#timer");
    if (timerBtn) {
      timerBtn.textContent = this.active ? (this.active.stopped_at ? "Save" : "Stop") : "Start";
      timerBtn.disabled = !(this.bag && !this.editing);
    }
    const card = this.shadowRoot.querySelector(".timer-card");
    if (card) card.classList.toggle("active", !!(this.active && !this.active.stopped_at));
    const screenEl = this.shadowRoot.querySelector(".brew-screen");
    if (screenEl) {
      const pouring = !!(this.active && !this.active.stopped_at);
      const wasPouring = screenEl.classList.contains("pouring");
      if (pouring !== wasPouring) {
        if (pouring) {
          screenEl.classList.remove("pouring");
          void screenEl.offsetWidth;
        }
        screenEl.classList.toggle("pouring", pouring);
      }
      const stateEl = screenEl.querySelector(".brew-state");
      if (stateEl) stateEl.textContent = !this.active ? "READY" : (this.active.stopped_at ? "SHOT COMPLETE" : "BREWING");
    }
    const caption = this.shadowRoot.querySelector(".caption");
    if (caption) caption.textContent = this.active ? (this.active.stopped_at ? "Enter final yield, then Save" : "Extracting") : "Ready for a shot";
    this.renderTimer();
    const clearBtn = this.shadowRoot.querySelector("#clear-timer");
    if (clearBtn) clearBtn.hidden = !this.active;
  }

  hideEmbeddedSidebar() {
    if (window.self === window.top) return;
    if (document.getElementById("espresso-embedded-tweaks")) return;
    const style = document.createElement("style");
    style.id = "espresso-embedded-tweaks";
    style.textContent = `
      home-assistant-main { --mdc-drawer-width: 0px !important; }
      home-assistant-main ha-drawer { --mdc-drawer-width: 0px !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  goHome() {
    const path = this.homePath || "/lovelace";
    const target = window.self !== window.top ? window.top : window;
    if (target.location.pathname !== path) {
      target.location.href = path;
    }
  }

  openSettings() {
    this.settingsDraft = this.homePath || "/lovelace";
    this.settingsOpen = true;
    this.render();
    const input = this.shadowRoot.querySelector("#settings-path");
    if (input) { input.focus(); input.select(); }
  }

  saveSettings() {
    let path = (this.settingsDraft || "").trim();
    if (path && !path.startsWith("/")) path = "/" + path;
    this.homePath = path || "/lovelace";
    try { window.localStorage.setItem("espresso_extractions_home_path", this.homePath); } catch (e) {}
    this.settingsOpen = false;
    this.render();
  }

  settingsModal() {
    if (!this.settingsOpen) return "";
    return `<div class="settings-overlay" id="settings-modal"><div class="modal"><h2>Back button destination</h2><p class="modal-sub">Set the path the back button navigates to. Double-tap or long-press the back button to reopen this.</p><label class="modal-field">Home path<input id="settings-path" type="text" value="${this.esc(this.settingsDraft)}" placeholder="/lovelace"/></label><div class="modal-actions"><button id="settings-save" class="primary">Save</button><button id="settings-reset">Reset to default</button><button id="settings-cancel" class="cancel">Cancel</button></div></div></div>`;
  }

  styles() {
    return `:host{display:block;color:var(--primary-text-color);background:linear-gradient(150deg,#20292e 0%,#2b1c14 55%,#4a2c16 100%);min-height:100%;font-family:var(--primary-font-family,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif)}
main{padding:28px;max-width:1180px;margin:auto}
.app-header{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:22px}
.header-main{min-width:0}
.back-home{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;min-width:0;border-radius:50%;background:rgba(255,255,255,0.08);color:var(--primary-text-color);border:1px solid rgba(255,255,255,0.15);cursor:pointer;transition:background .15s,transform .1s;flex-shrink:0}
.back-home:hover{background:rgba(255,255,255,0.16)}
.back-home:active{transform:scale(.94)}
.eyebrow{font-size:11px;letter-spacing:2.5px;color:var(--primary-color);font-weight:700;text-transform:uppercase}
.app-header h1{font-size:clamp(26px,4.5vw,44px);margin:6px 0;letter-spacing:-.5px;font-weight:750}
.app-header p{margin:0;color:var(--secondary-text-color);font-size:15px}
nav{display:flex;gap:8px;background:rgba(255,255,255,0.06);padding:6px;border-radius:16px;border:1px solid rgba(255,255,255,0.08)}
.nav-tab{display:inline-flex;align-items:center;gap:8px;margin:0;padding:10px 16px;min-width:0;border-radius:12px;background:transparent;color:var(--secondary-text-color);font-size:14px;font-weight:600;border:0;cursor:pointer;transition:background .15s,color .15s,box-shadow .15s;white-space:nowrap}
.nav-tab:hover{background:rgba(255,255,255,0.08);color:var(--primary-text-color)}
.nav-tab.active{background:var(--primary-color);color:#fff;box-shadow:0 4px 14px rgba(0,0,0,0.25)}
.nav-tab ha-icon{--mdc-icon-size:18px}
.toolbar,.filters{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:16px 0;padding:16px;border-radius:16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);box-shadow:0 10px 30px rgba(0,0,0,0.2)}
.bag-toolbar{display:flex;align-items:center;gap:18px;flex-wrap:wrap;justify-content:space-between;margin:16px 0;padding:18px 20px;border-radius:18px;background:linear-gradient(135deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03));border:1px solid rgba(255,255,255,0.12);box-shadow:0 12px 30px rgba(0,0,0,0.2)}
.bag-feature{display:flex;flex-direction:column;gap:2px;min-width:0;margin-right:auto}
.bag-eyebrow{font-size:10px;letter-spacing:2px;color:var(--primary-color);font-weight:700}
.bag-name{font-size:22px;font-weight:700;line-height:1.2;color:var(--primary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px}
.bag-meta{font-size:13px;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px}
.bag-empty{font-size:15px;color:var(--secondary-text-color)}
.bag-switch{display:flex;align-items:center;gap:8px;margin:0;padding:0;white-space:nowrap;background:transparent;border:0;border-radius:0;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none}
.bag-switch select{width:auto;min-width:180px;padding:10px 12px;font-size:14px}
.bag-switch select:focus{outline:none;box-shadow:none;border-color:var(--primary-color)}
.bag-actions{display:flex;gap:8px;flex-wrap:wrap}
.bag-actions button{min-width:0;padding:10px 16px;font-size:13px}
.bag-toolbar-right{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.bag-stats{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:8px 0 2px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.14)}
.bag-stats span{font-size:12.5px;font-weight:600;color:rgba(255,255,255,0.7);white-space:nowrap}
.bag-stats .bag-cps{color:#bef0d6}
#mark-done{min-width:0;padding:10px 16px;font-size:13px;background:rgba(255,110,110,0.14);border:1px solid rgba(255,120,120,0.4);color:rgba(255,180,180,0.95);backdrop-filter:none;-webkit-backdrop-filter:none}
.bags-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:16px 0}
.bags-toolbar button{min-width:0;padding:8px 14px;font-size:13px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);color:var(--primary-text-color);backdrop-filter:none;-webkit-backdrop-filter:none}
.bags-toolbar button:hover{filter:brightness(1.12);background:rgba(255,255,255,0.1)}
form{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin:18px 0;padding:20px;border:1px solid rgba(255,255,255,0.1);border-radius:18px;background:rgba(255,255,255,0.04);box-shadow:0 12px 32px rgba(0,0,0,0.22)}
input,select,output,textarea{font:inherit;padding:13px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.08);color:inherit;width:100%;box-sizing:border-box;transition:border-color .15s,box-shadow .15s,background .15s}
select option{background:#20232c;color:var(--primary-text-color)}
select option:hover,select option:checked{background:var(--primary-color,#58b889);color:#fff}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--primary-color);box-shadow:0 0 0 3px color-mix(in srgb,var(--primary-color) 25%,transparent);background:rgba(255,255,255,0.1)}
.form-heading{grid-column:1/-1;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.form-heading h2{margin-right:auto;font-size:18px;font-weight:700}
button.cancel{background:rgba(255,255,255,0.12);color:var(--primary-text-color);border:1px solid rgba(255,255,255,0.2)}
button{cursor:pointer;background:var(--primary-color);color:#fff;border:0;padding:13px 22px;border-radius:12px;font-size:15px;font-weight:600;min-width:120px;backdrop-filter:blur(5px);transition:filter .15s,transform .1s,background .15s}
button:hover{filter:brightness(1.08)}
button:active{transform:scale(.98)}
button:disabled{opacity:.4;cursor:not-allowed}
textarea{min-height:70px;grid-column:1/-1;resize:vertical}
.notice{padding:14px;border-radius:12px;background:rgba(255,255,255,0.06);color:var(--secondary-text-color);border:1px solid rgba(255,255,255,0.08)}
.timer-card{position:relative;width:100%;max-width:560px;margin:0 auto;padding:20px;text-align:center;border:1px solid rgba(255,255,255,0.14);border-radius:24px;background:linear-gradient(150deg,#26333a,#5a2f1a);box-shadow:0 20px 44px rgba(0,0,0,0.35)}.timer-card svg{width:100%;max-height:250px}.machine{fill:#77838a;stroke:#d8e0e3;stroke-width:3}.machine-dark{fill:#202a30}.light{fill:#9aa7ae}.active .light{fill:#ff9a4a;filter:drop-shadow(0 0 10px #ff9a4a)}.portafilter{fill:#343b40;stroke:#c0cbd0;stroke-width:3}.handle{fill:none;stroke:#343b40;stroke-width:14;stroke-linecap:round}.stream{fill:none;stroke:#a85d2e;stroke-width:5;stroke-linecap:round;stroke-dasharray:8 8;opacity:.2}.active .stream{opacity:1;animation:pour .55s linear infinite}.coffee{fill:#75401f;stroke:#d39a5f;stroke-width:3}.coffee-top{fill:none;stroke:#e5ad70;stroke-width:3}.elapsed{font-size:52px;color:#fff;font-variant-numeric:tabular-nums;font-weight:700}.caption{margin:4px 0 14px;color:#d9e1e5}
.grid,.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.charts{margin:20px 0}
.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.metric,.bag-card,.charts>div{padding:20px;border:1px solid rgba(255,255,255,0.1);border-radius:18px;background:rgba(255,255,255,0.05);box-shadow:0 12px 30px rgba(0,0,0,0.22)}
.bag-editor{margin:20px 0;padding:20px;border:1px solid rgba(255,255,255,0.1);border-radius:18px;background:rgba(255,255,255,0.05);box-shadow:0 12px 30px rgba(0,0,0,0.22)}
.bag-editor h2{margin:0 0 8px;font-size:20px}
.bag-card{display:flex;flex-direction:column;gap:8px;cursor:pointer}
.bag-card.active{border-color:rgba(88,184,137,0.5);box-shadow:0 0 0 1px rgba(88,184,137,0.4),0 12px 30px rgba(0,0,0,0.22)}
.bag-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.bag-card-head h2{margin:0;font-size:18px}
.bag-progress-badge{flex-shrink:0;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#ffd48a;background:rgba(255,180,60,0.18);border:1px solid rgba(255,180,60,0.6);border-radius:999px;padding:3px 8px}
.bag-card-meta{margin:0;color:var(--primary-text-color);font-weight:500;font-size:14px}
.bag-card-sub{margin:0;color:var(--secondary-text-color);font-size:13px}
.bag-card-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
.bag-card-actions button{min-width:0;flex:1;padding:9px 12px;font-size:13px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);color:var(--primary-text-color);backdrop-filter:none;-webkit-backdrop-filter:none}
.bag-card-actions button:hover{filter:brightness(1.12);background:rgba(255,255,255,0.1)}
.bag-card-actions button.delete-bag-card{border-color:rgba(255,120,120,0.45);background:rgba(255,80,80,0.12);color:rgba(255,170,170,0.95)}
.bag-card.done{opacity:.62;cursor:default;border-color:rgba(255,255,255,0.08)}
.bag-done-badge{flex-shrink:0;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#d9c9a0;background:rgba(210,180,110,0.2);border:1px solid #b39d63;border-radius:999px;padding:3px 8px}
.bag-done-note{margin:0;color:var(--secondary-text-color);font-size:12px;font-style:italic}
.bag-card-actions button.reopen-bag-card{border-color:rgba(88,184,137,0.5);background:rgba(88,184,137,0.14);color:#bef0d6}
.finish-panel{margin:16px 0 0;padding:20px;border:1px solid rgba(88,184,137,0.4);border-radius:14px;background:rgba(88,184,137,0.06);box-shadow:0 8px 24px rgba(0,0,0,0.18)}
.modal{background:var(--card-background-color,#1c1c24);border:1px solid rgba(255,255,255,0.14);border-radius:14px;padding:20px}
.modal h2{margin:0 0 6px;font-size:19px}
.modal-sub{margin:0 0 16px;color:var(--secondary-text-color);font-size:14px}
.modal-field{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:600;margin-bottom:18px}
.modal-field input{font-size:15px}
.modal-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
.modal-actions button{min-width:0;flex:1;padding:10px 14px;font-size:14px}
.modal-actions button.primary{border-color:#58b889;background:rgba(88,184,137,0.2);color:#bef0d6}
.modal-actions button.cancel{opacity:.7}
.settings-overlay{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px)}
.settings-overlay .modal{width:100%;max-width:420px}
.bag-details-title{margin:18px 0 0;font-size:14px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--secondary-text-color)}
.bag-settings{margin-top:8px;padding:16px;border:1px solid rgba(255,255,255,0.1);border-radius:14px;background:rgba(255,255,255,0.03)}
.bag-settings h3{margin:0 0 12px;font-size:16px;color:var(--primary-color)}
.settings-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:4px 0 16px}
.settings-group{display:flex;flex-direction:column;gap:12px;min-width:0}
.settings-group .group-label,.presets-head .group-label{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--secondary-text-color)}
.field-label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;color:var(--secondary-text-color);margin:0}
.field-label input,.field-label select{font-size:15px;color:var(--primary-text-color)}
.recipe-group{max-width:none;margin-bottom:4px}
.presets-block{margin-top:6px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.08)}
.presets-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.presets-head button{min-width:0;padding:8px 12px}
.preset-list{display:flex;flex-wrap:wrap;gap:8px}
.preset-hint{margin:10px 0 0;font-size:12px;color:var(--secondary-text-color)}
@media (max-width:720px){.settings-grid{grid-template-columns:1fr}}
.preset-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 12px 7px 10px;border-radius:999px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.14);font-size:13px;cursor:pointer;user-select:none;transition:background .12s,border-color .12s,transform .05s}
.preset-chip:hover{background:rgba(255,255,255,0.14);border-color:rgba(255,255,255,0.28)}
.preset-chip:active{transform:scale(.97)}
.preset-chip.active{background:rgba(88,184,137,0.25);border-color:#58b889;color:#bef0d6}
.preset-chip:not(.active):not(.preset-chip-done){border-style:dashed}
.preset-chip button{min-width:0;width:20px;height:20px;padding:0;border-radius:50%;font-size:14px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid transparent}
.preset-chip .edit-preset{background:rgba(255,255,255,0.14);color:var(--primary-text-color)}
.preset-chip .edit-preset:hover{background:rgba(255,255,255,0.26)}
.preset-chip .delete-preset{background:var(--error-color,#e27666)}
.preset-edit-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;margin-bottom:12px;border-radius:10px;background:rgba(88,184,137,0.12);border:1px solid rgba(88,184,137,0.4);font-size:14px;color:var(--primary-text-color)}
.preset-edit-banner button{min-width:0;padding:6px 10px;font-size:13px}
.metric span{display:block;color:var(--secondary-text-color);font-size:12px;text-transform:uppercase;letter-spacing:.8px;font-weight:600}
.metric strong{display:block;font-size:30px;margin-top:8px;font-weight:750}
.metric small{font-size:13px;margin-left:3px;color:var(--secondary-text-color)}
.chart{width:100%;height:150px}.chart polyline{fill:none;stroke:var(--primary-color);stroke-width:3}.chart circle{fill:var(--primary-color);cursor:pointer}.gridline{stroke:var(--divider-color);stroke-width:1}.positive{fill:#58b889}.negative{fill:#e27666}.chart text{fill:var(--secondary-text-color);font-size:9px}.bars div{margin:12px 0}.bars span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bars i{display:block;background:var(--primary-color);height:26px;color:#fff;font-style:normal;padding:4px 10px;border-radius:6px;font-weight:600}
table{width:100%;border-collapse:collapse;background:rgba(255,255,255,0.05);border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.1)}
th,td{text-align:left;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.08)}
th{font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:var(--secondary-text-color);background:rgba(255,255,255,0.04)}
tr:last-child td{border-bottom:0}
.delete{background:var(--error-color,#e27666)}
.filters label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--secondary-text-color);margin:0}
.chart-card h2{margin:0 0 10px;font-size:15px;color:var(--primary-text-color)}
th{cursor:pointer;user-select:none}
th[data-sort]:hover{color:var(--primary-color)}
th.sorted{color:var(--primary-color)}
.session-row td{background:rgba(88,184,137,0.10);font-weight:600;padding:8px 14px}
.session-row .session-name{color:#bef0d6;margin-right:10px}
.session-row .session-meta{font-weight:400;color:var(--secondary-text-color);font-size:12px}
.hist-status{display:inline-block;margin-left:8px;font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;border-radius:999px;padding:2px 7px;vertical-align:middle}
.hist-status.hist-done{color:#bef0d6;background:rgba(88,184,137,0.25);border:1px solid #58b889}
.hist-status.hist-progress{color:#ffd48a;background:rgba(255,180,60,0.18);border:1px solid rgba(255,180,60,0.6)}
.hist-status.hist-deleted{color:var(--secondary-text-color);background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.18)}
.shot-row.editing td{background:rgba(88,184,137,0.06)}
.shot-row.editing input,.shot-row.editing select{width:auto;min-width:0;padding:6px 8px;font-size:13px;border-radius:8px}
.shot-row.editing button{margin:0 2px;padding:6px 10px}
.bulk-toolbar{display:flex;align-items:center;gap:10px;margin:12px 0;padding:10px 14px;border:1px solid rgba(88,184,137,0.4);border-radius:12px;background:rgba(88,184,137,0.08)}
.bulk-toolbar button{margin:0}
.bulk-form{width:100%;display:flex;flex-direction:column;gap:12px}
.bulk-form h3{margin:0;font-size:15px}
.bulk-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}
.bulk-fields label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--secondary-text-color);margin:0}
.bulk-fields input,.bulk-fields select{width:100%;padding:8px 10px;font-size:13px}
.bulk-actions{display:flex;gap:10px}
.row-check{width:16px;height:16px;accent-color:var(--primary-color)}
th input[type=checkbox]{accent-color:var(--primary-color)}
.bulk-toolbar button.danger{border-color:rgba(255,120,120,0.45);background:rgba(255,80,80,0.12);color:rgba(255,170,170,0.95)}
.bulk-toolbar button.danger:hover{filter:brightness(1.12);background:rgba(255,80,80,0.2)}
.scatter-wrap{display:flex;flex-direction:column;gap:8px}
.scatter-legend-wrap{display:flex;flex-wrap:wrap;gap:10px}
.scatter-legend{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--secondary-text-color)}
.scatter-legend i{width:10px;height:10px;border-radius:50%;display:inline-block}
.chart.scatter circle{stroke:rgba(0,0,0,0.3)}
.rating-chart{display:flex;flex-direction:column;gap:8px}
.rating-bar{display:flex;align-items:center;gap:8px}
.rating-bar span{width:14px;text-align:right;font-size:12px;color:var(--secondary-text-color)}
.rating-bar i{display:block;background:var(--primary-color);height:20px;color:#fff;font-style:normal;padding:2px 8px;border-radius:5px;font-size:12px;line-height:16px}
/* BREWING ANIMATION (winner): glowing halo + rising steam wisps */
.timer-card.active{box-shadow:0 20px 44px rgba(0,0,0,.35),0 0 34px rgba(233,166,90,.6);border-color:rgba(233,166,90,.65);animation:halo 1.7s ease-in-out infinite}
@keyframes halo{0%,100%{box-shadow:0 20px 44px rgba(0,0,0,.35),0 0 24px rgba(233,166,90,.45)}50%{box-shadow:0 20px 44px rgba(0,0,0,.35),0 0 52px rgba(233,166,90,.85)}}
.brew-steam{position:absolute;left:50%;top:8px;transform:translateX(-50%);display:flex;gap:10px;pointer-events:none;opacity:0;transition:opacity .3s}
.timer-card.active .brew-steam{opacity:1}
.brew-steam i{width:12px;height:42px;border:2px solid rgba(255,255,255,.5);border-bottom:none;border-radius:50% 50% 0 0;opacity:0;animation:wisp 2.4s ease-out infinite}
.brew-steam i:nth-child(1){animation-delay:.2s}.brew-steam i:nth-child(2){animation-delay:1s}.brew-steam i:nth-child(3){animation-delay:1.7s}
@keyframes wisp{0%{transform:translateY(6px) scale(.7);opacity:0}35%{opacity:.6}100%{transform:translateY(-36px) translateX(6px) scale(1.05);opacity:0}}
.timer-card svg{overflow:visible}
@keyframes pour{to{stroke-dashoffset:-16px}}

.timer-yield-container{display:flex;flex-direction:column;gap:16px;max-width:100%;width:100%;box-sizing:border-box}
.actual-yield-section{width:100%;max-width:430px;margin:0 auto;background:linear-gradient(145deg,#26333a,#6d3825);border:1px solid #ffffff22;border-radius:24px;box-shadow:0 18px 36px #0004;padding:20px;box-sizing:border-box;display:flex;flex-direction:column}
.actual-yield-section label{display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;flex:1;height:100%;margin:0;background:transparent;padding:0;border:0;border-radius:0;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none}
.brew-greeting{margin:0 0 64px;text-align:center;font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:500;color:rgba(255,255,255,0.85);font-style:italic;line-height:1.4;transform:translateY(48px)}
.brew-greeting::before{content:"“";font-size:30px;color:rgba(255,255,255,0.55);vertical-align:top;margin-right:2px}
.brew-greeting::after{content:"”";font-size:30px;color:rgba(255,255,255,0.55);vertical-align:top;margin-left:2px}
@media(min-width:600px){
  .timer-yield-container{flex-direction:row;align-items:stretch;gap:24px}
  .timer-card{flex:1 1 400px;max-width:560px;margin:0}
  .actual-yield-section{flex:1 1 400px;margin:0;max-width:560px}
  .actual-yield-section label{text-align:left}
}
@media(max-width:599px){
  main{padding:14px}
  .app-header{align-items:flex-start}
  .back-home{margin-bottom:4px}
  .summary-grid{grid-template-columns:repeat(2,1fr)}
  nav{margin:10px 0;overflow-x:auto;width:100%}
  .nav-tab{white-space:nowrap}
  .form-heading{align-items:stretch;flex-direction:column}
  table{font-size:12px;display:block;overflow-x:auto;white-space:nowrap}
  .timer-card{flex:1 1 0;min-width:0;max-width:none}
  .actual-yield-section{flex:1 1 0;min-width:0;max-width:none;padding:12px}
}
/* Large actual yield input - maximum specificity for Shadow DOM */
.actual-yield-section label .large-number-input,
.actual-yield-section label input.large-number-input,
div.actual-yield-section label .large-number-input,
div.actual-yield-section label input.large-number-input{
  font-size:42px !important;
  padding:20px 32px !important;
  width:100% !important;
  max-width:none !important;
  text-align:center !important;
  border-radius:14px !important;
  border:1px solid rgba(255,255,255,0.6) !important;
  background:rgba(255,255,255,0.1) !important;
  color:var(--primary-text-color) !important;
  font-weight:600 !important;
  box-sizing:border-box !important;
  min-height:60px !important;
  backdrop-filter: none !important; -webkit-backdrop-filter: none !important; filter: none !important;
}
.actual-yield-section output{display:block;margin-top:10px;font-size:14px;color:var(--secondary-text-color)}
.extraction-settings{margin:16px auto;max-width:600px;padding:16px;border:1px solid #ffffff22;border-radius:16px;background:rgba(38, 50, 58, 0.6)}
.extraction-settings summary{cursor:pointer;font-size:16px;font-weight:600;color:var(--primary-color);padding:8px 0;user-select:none;display:flex;align-items:center;gap:10px}
.extraction-settings[open] summary{margin-bottom:16px}
label{display:block;margin:6px 0;padding:4px 8px;border-radius:6px;background:rgba(255,255,255,0.08);color:var(--primary-text-color);font-size:12px;white-space:normal}
.form-row{display:flex;align-items:center;gap:8px;margin:6px 0}
input:focus+label{color:var(--primary-color)}
/* Hide native number input spinners */
.actual-yield-section input[type=number]::-webkit-inner-spin-button,
.actual-yield-section input[type=number]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.actual-yield-section input[type=number] {
  -moz-appearance: textfield;
}
/* Yield step buttons */
.yield-step-buttons { display: flex; gap: 16px; }
.yield-step-btn {
  width: 56px; height: 56px; min-width: 0; border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.6);
  background: rgba(255,255,255,0.1);
  color: var(--primary-text-color);
  font-size: 28px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; touch-action: manipulation;
  transition: background 0.15s, transform 0.1s;
  backdrop-filter: none; -webkit-backdrop-filter: none; filter: none;
}
.yield-step-btn:active { background: rgba(255,255,255,0.2); transform: scale(0.95); }
.yield-start-btn {
  width: 96px; height: 56px; min-width: 0; border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.6);
  background: rgba(255,255,255,0.1);
  color: var(--primary-text-color);
  font-size: 16px; font-weight: 600;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; touch-action: manipulation;
  transition: background 0.15s, transform 0.1s;
  backdrop-filter: none; -webkit-backdrop-filter: none; filter: none;
}
.yield-start-btn:active { background: rgba(255,255,255,0.2); transform: scale(0.95); }
.yield-controls{display:flex;gap:12px;align-items:center;justify-content:center}
.yield-start-btn.clear{width:auto;padding:0 22px;border-color:rgba(255,120,120,0.5);background:rgba(255,80,80,0.12);color:rgba(255,170,170,0.95)}
.yield-start-btn[hidden]{display:none!important}
.yield-step-btn,
.actual-yield-section input.large-number-input,
.actual-yield-section button {
  outline: none !important;
  box-shadow: none !important;
  -webkit-tap-highlight-color: transparent;
}
`;

  }
}

if (!customElements.get("espresso-extractions-panel")) {
  customElements.define("espresso-extractions-panel", EspressoExtractionsPanel);
}

class EspressoExtractionsPanelCard extends EspressoExtractionsPanel {}
if (!customElements.get("espresso-extractions-panel-card")) {
  customElements.define("espresso-extractions-panel-card", EspressoExtractionsPanelCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c && c.type === "espresso-extractions-panel-card")) {
  window.customCards.push({
    type: "espresso-extractions-panel-card",
    name: "Espresso Journal (Full Panel)",
    description: "Full Espresso Journal: Log Shot, Coffee Bags, and History & Charts.",
    preview: false,
  });
}
