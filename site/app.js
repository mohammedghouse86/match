/* Match Calculator: counts eligible partners and same-age competitors from anonymous aggregate data (data.json).
   No personal data exists in this app. Nothing the user enters is stored or sent anywhere. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const MAX_ICONS = 60;      // above this, one icon stands for several people
  const RIVAL_SPAN = 2;      // competitors = same sex, within ±2 years of your age

  const EDU = [["0", "Any education"], ["1", "Graduate or higher"], ["2", "Professional degree or higher"], ["3", "Postgraduate or doctor"]];
  const LOC = [["any", "Anywhere"], ["india", "India only"], ["1", "Abroad (Gulf or further)"], ["2", "USA, Canada, UK or Australia"]];
  const SKIN = [["any", "Doesn't matter"], ["1", "Fair or fairer"], ["2", "Very fair"]];

  const FORMS = {
    bride: [
      { id: "age", label: "Your age", type: "num", min: 18, max: 60, value: 25 },
      { id: "max", label: "His maximum age", hint: "He will be your age or older, up to this age.", type: "num", min: 18, max: 70, value: 32 },
      { id: "edu", label: "His education", type: "select", options: EDU },
      { id: "loc", label: "Where he lives", type: "select", options: LOC },
      { id: "prev", label: "Divorced or widowed is fine", type: "check" },
    ],
    groom: [
      { id: "age", label: "Your age", type: "num", min: 18, max: 70, value: 29 },
      { id: "max", label: "Her maximum age", hint: "Anyone from 18 up to this age.", type: "num", min: 18, max: 60, value: 26 },
      { id: "edu", label: "Her education", type: "select", options: EDU },
      { id: "skin", label: "Her complexion", hint: "Counts only women who state it in their ad.", type: "select", options: SKIN },
      { id: "prev", label: "Divorced or widowed is fine", type: "check" },
    ],
  };

  let data = null;
  let mode = "bride";
  const state = { bride: {}, groom: {} };   // in memory only, cleared when the page closes

  // ------------------------------------------------------------------ form
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function drawForm() {
    const f = $("#form");
    f.innerHTML = FORMS[mode].map((q) => {
      const v = state[mode][q.id] ?? q.value ?? (q.options ? q.options[0][0] : false);
      const hint = q.hint ? `<small>${esc(q.hint)}</small>` : "";
      if (q.type === "num") return `<label class="field"><span>${esc(q.label)}</span>
        <div class="stepper"><button type="button" data-step="-1" data-for="${q.id}" aria-label="Decrease">−</button>
        <input type="number" inputmode="numeric" id="f-${q.id}" min="${q.min}" max="${q.max}" value="${v}">
        <button type="button" data-step="1" data-for="${q.id}" aria-label="Increase">+</button></div>${hint}</label>`;
      if (q.type === "select") return `<label class="field"><span>${esc(q.label)}</span>
        <select id="f-${q.id}">${q.options.map(([k, t]) => `<option value="${k}" ${k === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>${hint}</label>`;
      return `<label class="field toggle"><span>${esc(q.label)}</span><input type="checkbox" id="f-${q.id}" ${v ? "checked" : ""}></label>`;
    }).join("");
    f.querySelectorAll("input, select").forEach((el) => el.addEventListener("input", read));
    f.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
      const el = $("#f-" + b.dataset.for);
      el.value = clamp(+el.value + +b.dataset.step, +el.min, +el.max);
      read();
    }));
    read();
  }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? Math.round(v) : lo));

  function read() {
    for (const q of FORMS[mode]) {
      const el = $("#f-" + q.id);
      state[mode][q.id] = q.type === "check" ? el.checked : q.type === "num" ? clamp(+el.value, q.min, q.max) : el.value;
    }
    render();
  }

  // ------------------------------------------------------------------ counting (rows: [age, edu, loc, skin, married, count])
  const sum = (rows, keep) => rows.reduce((n, r) => n + (keep(r) ? r[5] : 0), 0);
  const maritalOk = (r, prev) => (prev ? r[4] !== 2 : r[4] === 0);   // never count men already married

  function calc() {
    const s = state[mode];
    if (mode === "bride") {
      const matches = sum(data.men, (r) => r[0] >= s.age && r[0] <= s.max && r[1] >= +s.edu && maritalOk(r, s.prev) &&
        (s.loc === "any" || (s.loc === "india" ? r[2] === 0 : r[2] >= +s.loc)));
      const rivals = sum(data.women, (r) => Math.abs(r[0] - s.age) <= RIVAL_SPAN);
      return { matches, rivals, me: "woman", them: "man", note: s.max < s.age ? "His maximum age is below your age, so no man fits." : "" };
    }
    const matches = sum(data.women, (r) => r[0] <= s.max && r[1] >= +s.edu && maritalOk(r, s.prev) &&
      (s.skin === "any" || r[3] >= +s.skin));
    const rivals = sum(data.men, (r) => Math.abs(r[0] - s.age) <= RIVAL_SPAN);
    return { matches, rivals, me: "man", them: "woman", note: "" };
  }

  // ------------------------------------------------------------------ result
  const PERSON = (cls) => `<svg class="${cls}" viewBox="0 0 24 28" aria-hidden="true"><circle cx="12" cy="6.5" r="5.5" fill="currentColor"/>` +
    `<path d="M2 27c0-6.6 4.5-11.5 10-11.5S22 20.4 22 27z" fill="currentColor"/></svg>`;
  const plural = (n, w) => `${n.toLocaleString("en-IN")} ${n === 1 ? w : w === "man" ? "men" : "women"}`;

  function render() {
    if (!data) return;
    const { matches, rivals, me, them, note } = calc();
    const per = Math.max(1, Math.ceil(Math.max(matches, rivals) / MAX_ICONS));
    const icons = (n, cls) => (n ? PERSON(cls).repeat(Math.max(1, Math.round(n / per))) : `<span class="scale">none</span>`);
    const themCls = them === "man" ? "m" : "w", meCls = me === "man" ? "m" : "w";

    $("#headline").innerHTML = `<b class="${meCls}">${plural(rivals, me)}</b> competing for <b class="${themCls}">${plural(matches, them)}</b>`;
    $("#label-match").textContent = `${them === "man" ? "Men" : "Women"} who fit what you want`;
    $("#icons-match").innerHTML = icons(matches, them);
    $("#label-rivals").textContent = `${me === "man" ? "Men" : "Women"} your age (±${RIVAL_SPAN} years) also advertising`;
    $("#icons-rivals").innerHTML = icons(rivals, me);
    $("#ratio").innerHTML = note ? `<span class="warn">${esc(note)}</span>`
      : !matches ? `<span class="warn">No ${them === "man" ? "man" : "woman"} in the data fits all of this. Try relaxing one choice.</span>`
      : `That is about <b>${(rivals / matches).toFixed(1)}</b> ${me === "man" ? "men" : "women"} your age for every ${them} who fits.`;
    $("#scale").textContent = per > 1 ? `Each icon stands for about ${per} people.` : "Each icon is one person.";
  }

  // ------------------------------------------------------------------ tabs and start-up
  function setMode(m) {
    mode = m;
    for (const b of ["bride", "groom"]) $("#tab-" + b).setAttribute("aria-selected", String(b === m));
    $("#panel").setAttribute("aria-labelledby", "tab-" + m);
    drawForm();
  }
  $("#tab-bride").addEventListener("click", () => setMode("bride"));
  $("#tab-groom").addEventListener("click", () => setMode("groom"));
  window.addEventListener("hashchange", () => setMode(location.hash === "#groom" ? "groom" : "bride"));

  // ------------------------------------------------------------------ login (token lives in memory only)
  const API = (window.MC_CONFIG && window.MC_CONFIG.API_BASE || "").replace(/\/$/, "");
  let token = null, expiryTimer = null;

  function lock(message) {
    token = null; data = null; clearTimeout(expiryTimer);
    state.bride = {}; state.groom = {};
    $("#calc").hidden = true; $("#login").hidden = false;
    $("#login-msg").textContent = message || "";
    $("#password").value = "";
  }

  async function loadData() {
    const r = await fetch(API + "/api/data", { headers: { Authorization: "Bearer " + token }, cache: "no-store", credentials: "omit" });
    if (r.status === 401) { lock("Your session ended. Please unlock again."); return; }
    if (!r.ok) throw new Error(String(r.status));
    data = await r.json();
    const total = (rows) => rows.reduce((n, x) => n + x[5], 0);
    $("#about").textContent = `Estimates from ${total(data.men)} men and ${total(data.women)} women who placed matrimonial ads in the Siasat Daily, ` +
      `Hyderabad, on ${data.papers.length} Sundays (${data.papers[0]} to ${data.papers[data.papers.length - 1]}). ` +
      "These are newspaper advertisers only, not everyone looking to marry, and what each ad says was not verified. " +
      "Ages are approximate for small groups.";
    $("#login").hidden = true; $("#calc").hidden = false;
    setMode(location.hash === "#groom" ? "groom" : "bride");
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#login-btn"), msg = $("#login-msg");
    btn.disabled = true;
    msg.textContent = "Checking… the server may take up to a minute to wake up.";
    try {
      const r = await fetch(API + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: $("#password").value }), cache: "no-store", credentials: "omit" });
      $("#password").value = "";
      const body = await r.json().catch(() => ({}));
      if (!r.ok || typeof body.token !== "string") { msg.textContent = body.error || "Could not unlock."; return; }
      token = body.token;
      expiryTimer = setTimeout(() => lock("Your session ended. Please unlock again."), Math.max(60, (body.expires_in || 3600) - 30) * 1000);
      msg.textContent = "";
      await loadData();
    } catch (err) {
      msg.textContent = "Could not reach the server. Check your connection and try again.";
    } finally {
      btn.disabled = false;
    }
  });
  $("#logout").addEventListener("click", () => lock("Locked."));
})();
