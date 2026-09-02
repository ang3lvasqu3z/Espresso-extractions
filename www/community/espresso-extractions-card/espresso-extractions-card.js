class EspressoExtractionsCard extends HTMLElement {
  set hass(value) {
    this._hass = value;
    this.render();
  }

  setConfig(config) {
    this.config = {
      title: "Espresso Journal",
      show_timer: true,
      show_stats: true,
      ...config,
    };
    this.render();
  }

  connectedCallback() {
    this.load();
    this.timerInterval = setInterval(() => this.render(), 1000);
  }

  disconnectedCallback() {
    clearInterval(this.timerInterval);
  }

  async load() {
    if (!this._hass?.callWS) return;
    try {
      this.data = await this._hass.callWS({ type: "espresso_extractions/list" });
      this.render();
    } catch (error) {
      this.error = error;
      this.render();
    }
  }

  render() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    const data = this.data || {};
    const active = data.active;
    const latest = data.extractions?.[0];
    const bag = data.bags?.find((item) => item.id === latest?.bag_id);
    const state = this._hass?.states || {};
    const total = state["sensor.total_extractions"]?.state || data.extractions?.length || 0;
    const ratio = state["sensor.average_ratio"]?.state || "--";
    const avgTime = state["sensor.average_brew_time"]?.state || "--";
    const elapsed = active ? this.elapsed(active) : 0;
    this.shadowRoot.innerHTML = `<style>${this.styles()}</style><ha-card><div class="top"><div><span class="eyebrow">ESPRESSO</span><h2>${this.escape(this.config?.title || "Espresso Journal")}</h2></div><span class="status ${active ? "active" : ""}">${active ? (active.stopped_at ? "STOPPED" : "BREWING") : "READY"}</span></div>${this.config?.show_timer !== false ? `<div class="timer"><img src="/local/meraki2.png" alt="Meraki espresso machine"/><div class="overlay ${active && !active.stopped_at ? "active" : ""}"><strong>${this.formatTime(elapsed)}</strong><span>${active ? "BREWING" : "READY"}</span><i class="flower">✿</i></div></div>` : ""}<div class="details"><span>${this.escape(bag?.name || "No shot recorded")}</span><span>${latest ? `${latest.dose_g} g in · ${latest.yield_g} g out · 1:${latest.ratio}` : "Log a shot in Espresso Journal"}</span></div>${this.config?.show_stats !== false ? `<div class="stats"><div><b>${total}</b><small>shots</small></div><div><b>${ratio}</b><small>avg ratio</small></div><div><b>${avgTime}</b><small>avg seconds</small></div></div>` : ""}</ha-card>`;
  }

  elapsed(active) {
    const end = active.stopped_at ? Date.parse(active.stopped_at) : Date.now();
    return Math.max(0, (end - Date.parse(active.started_at)) / 1000);
  }
  formatTime(seconds) { return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`; }
  escape(value) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&", "<": "<", ">": ">", "\"": "&", "'": "&#039;" }[c])); }

  styles() {
    return `:host{display:block}.top{display:flex;justify-content:space-between;align-items:start;padding:18px 18px 8px}.eyebrow{font-size:10px;letter-spacing:2px;color:var(--primary-color);font-weight:700}.top h2{margin:4px 0;font-size:20px}.status{font-size:11px;letter-spacing:1px;color:var(--secondary-text-color)}.status.active{color:#e89050;font-weight:700}.timer{position:relative;overflow:hidden;margin:8px 18px;border-radius:14px;background:#16181a;text-align:center}.timer img{display:block;width:100%;max-height:210px;object-fit:contain;margin:0 auto}.overlay{position:absolute;left:50.5%;top:1%;transform:translateX(-50%);width:22%;aspect-ratio:1;border-radius:50%;background:#5d2e21dd;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;text-shadow:0 2px 4px #000}.overlay strong{font-size:clamp(14px,5vw,28px);font-variant-numeric:tabular-nums}.overlay span{font-size:9px;letter-spacing:1px}.flower{font-style:normal;font-size:18px;line-height:12px;color:#fff9}.overlay.active .flower{animation:spin 12s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.details{display:flex;flex-direction:column;gap:4px;padding:12px 18px;color:var(--secondary-text-color);font-size:13px}.details span:first-child{color:var(--primary-text-color);font-weight:700}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px 18px 18px}.stats div{padding:10px;border-radius:10px;background:var(--secondary-background-color);text-align:center}.stats b,.stats small{display:block}.stats b{font-size:20px}.stats small{font-size:11px;color:var(--secondary-text-color)}`;
  }
}

customElements.define("espresso-extractions-card", EspressoExtractionsCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "espresso-extractions-card",
  name: "Espresso Extractions Card",
  description: "Current espresso timer, latest shot, and extraction statistics.",
});
