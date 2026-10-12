/* Match Calculator. After login, every change sends the user's choices to the backend, which replies with counts only.
   No personal data reaches this page. The token and choices live in memory and vanish when the page closes. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const API = ((window.MC_CONFIG && window.MC_CONFIG.API_BASE) || "").replace(/\/$/, "");

  const AGES = ["18–19", "20–23", "24–27", "28–31", "32–35", "36–39", "40–44", "45–49", "50+"].map((t, i) => [i, t]);
  const MY_SKIN = [["1.5", "Very fair"], ["2", "Very very fair"], ["1", "Fair"], ["0", "Wheatish / medium"]];
  const MY_EDU = [["2", "Graduate"], ["3", "Professional degree (engineer, B.Pharm…)"], ["4", "Postgraduate or doctor"],
    ["5", "Specialist doctor or PhD"], ["1", "Intermediate"], ["0", "SSC"]];
  const MY_MARRIED = [["never", "Never married"], ["before", "Divorced / khula / widowed"]];
  const MARITAL = [["never", "Never married"], ["div", "Divorced or widowed is fine"]];
  const RELIGION = [["", "Any"], ["rel", "Says religious / namazi"], ["hafiz", "Hafiz or Aalim(a)"]];
  const FATIHA = [["", "Any"], ["follows", "Must follow it"], ["against", "Must not follow it"]];
  const REQ = [["", "Any"], ["yes", "Required"]];

  const FORMS = {
    bride: {
      me: [
        ["age", "My age", AGES, 2], ["skin", "My complexion", MY_SKIN], ["edu", "My education", MY_EDU], ["married", "My marital history", MY_MARRIED],
      ],
      want: [
        ["age_min", "His age from", AGES, 2], ["age_max", "His age up to", AGES, 3],
        ["edu", "His education at least", [["", "Any"], ["2", "Graduate"], ["3", "Professional degree"], ["4", "Postgraduate or doctor"], ["5", "Specialist or PhD"], ["doctor", "Doctors only"]], 0, "or better"],
        ["loc", "He lives in", [["", "Anywhere"], ["0", "India only"], ["1", "Abroad: Gulf or better"], ["2", "USA / Canada / UK / Australia"]]],
        ["skin", "His complexion", [["", "Any"], ["1", "Fair or fairer"], ["1.5", "Very fair or fairer"]], 0, "most men don't say"],
        ["marital", "His marital history", MARITAL],
        ["settled", "Well settled (job, business or abroad)", REQ], ["house", "Owns a house / property", REQ],
        ["religion", "Religious", RELIGION], ["fatiha", "Fatiha / Dargah", FATIHA],
      ],
    },
    groom: {
      me: [
        ["age", "My age", AGES, 3], ["skin", "My complexion", MY_SKIN], ["edu", "My education", MY_EDU],
        ["loc", "I live in", [["0", "India"], ["1", "Gulf"], ["2", "USA / Canada / UK / Australia"]]], ["married", "My marital history", MY_MARRIED],
      ],
      want: [
        ["age_min", "Her age from", AGES, 1], ["age_max", "Her age up to", AGES, 2],
        ["edu", "Her education at least", [["", "Any"], ["1", "Intermediate"], ["2", "Graduate"], ["3", "Professional degree"], ["4", "Postgraduate or doctor"], ["doctor", "Doctors only"]], 0, "or better"],
        ["skin", "Her complexion", [["", "Any"], ["1", "Fair or fairer"], ["1.5", "Very fair or fairer"], ["2", "Very very fair"]], 0, "women who state it"],
        ["marital", "Her marital history", MARITAL],
        ["religion", "Religious", RELIGION], ["fatiha", "Fatiha / Dargah", FATIHA],
      ],
    },
  };
  const BOOL = new Set(["settled", "house"]);
  const INT = new Set(["age", "age_min", "age_max"]);

  let mode = "bride", token = null, expiryTimer = null, seq = 0, debounce = null;
  const state = { bride: { me: {}, want: {} }, groom: { me: {}, want: {} } };

  // ------------------------------------------------------------------ form
  function fields(part) {
    return FORMS[mode][part].map(([id, label, opts, def = 0, hint]) => {
      const cur = state[mode][part][id] ?? opts[def][0];
      return `<label class="field"><span>${esc(label)}${hint ? ` <i>${esc(hint)}</i>` : ""}</span>
        <select data-part="${part}" data-id="${id}">${opts.map(([v, t]) =>
          `<option value="${v}" ${String(v) === String(cur) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
    }).join("");
  }
  function drawForm() {
    $("#me-title").innerHTML = `About me <i>what I offer</i>`;
    $("#want-title").innerHTML = `What I want <i>in a ${mode === "bride" ? "husband" : "wife"}</i>`;
    $("#me").innerHTML = fields("me");
    $("#want").innerHTML = fields("want");
    document.querySelectorAll("#me select, #want select").forEach((el) => el.addEventListener("change", read));
    read();
  }
  function read() {
    document.querySelectorAll("#me select, #want select").forEach((el) => {
      const { part, id } = el.dataset;
      state[mode][part][id] = INT.has(id) ? Number(el.value) : el.value;
    });
    clearTimeout(debounce);
    debounce = setTimeout(update, 150);
  }
  function payload() {
    const s = state[mode];
    const want = {};
    for (const [k, v] of Object.entries(s.want)) want[k] = BOOL.has(k) ? v === "yes" : v;
    return { mode, me: { ...s.me }, want };
  }

  // ------------------------------------------------------------------ result
  const PERSON = (x, y, size, cls) => `<g class="${cls}" transform="translate(${(x - size / 2).toFixed(1)} ${(y - size * 0.58).toFixed(1)}) scale(${(size / 24).toFixed(3)})">` +
    `<circle cx="12" cy="6.5" r="5.5"/><path d="M2 27c0-6.6 4.5-11.5 10-11.5S22 20.4 22 27z"/></g>`;

  // One person in the centre, n people in up to two rings around them.
  function circle(centreCls, ringCls, n) {
    const W = 300, C = W / 2, MAX = 40;
    const shown = Math.min(n, MAX);
    const inner = Math.min(shown, 14), outer = shown - inner;
    let g = PERSON(C, C, 54, centreCls + " centre");
    const ring = (count, r, size, offset) => {
      for (let i = 0; i < count; i++) {
        const a = (2 * Math.PI * i) / count - Math.PI / 2 + offset;
        g += PERSON(C + r * Math.cos(a), C + r * Math.sin(a), size, ringCls);
      }
    };
    ring(inner, outer ? 78 : 92, outer ? 24 : 28, 0);
    ring(outer, 128, 20, Math.PI / Math.max(outer, 1));
    return `<svg viewBox="0 0 ${W} ${W}" role="img" aria-label="${n} around 1">${g}</svg>` +
      (n > MAX ? `<p class="scale">${MAX} shown of ${n}.</p>` : "");
  }

  async function update() {
    const my = ++seq;
    const meWord = mode === "bride" ? "women" : "men", themOne = mode === "bride" ? "man" : "woman";
    const meCls = mode === "bride" ? "woman" : "man", themCls = mode === "bride" ? "man" : "woman";
    let r;
    try {
      r = await fetch(API + "/api/count", { method: "POST", cache: "no-store", credentials: "omit",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(payload()) });
    } catch { if (my === seq) $("#ratio").textContent = "Could not reach the server."; return; }
    if (my !== seq) return;
    if (r.status === 401) return lock("Your session ended. Please unlock again.");
    if (!r.ok) { $("#ratio").textContent = "Something went wrong. Try changing a choice."; return; }
    const d = await r.json();

    $("#kpis").innerHTML = [
      [`${mode === "bride" ? "Men" : "Women"} who fit what you want`, d.fit, `of ${d.partners_total}`],
      ["…and would accept you", d.accept, "going by their own ads", "hl"],
      [`${mode === "bride" ? "Women" : "Men"} your age advertising`, d.rivals, "your competition"],
    ].map(([l, v, sub, cls]) => `<div class="kpi ${cls || ""}"><div class="label">${esc(l)}</div><div class="value">${v}</div><div class="sub">${esc(sub)}</div></div>`).join("");

    if (!d.accept) {
      $("#circle").innerHTML = circle(themCls, meCls, 0);
      $("#ratio").innerHTML = `<span class="warn">No ${themOne} in the ads both fits all of this and would accept you. Try relaxing one choice.</span>`;
      return;
    }
    const ratio = d.rivals / d.accept;
    const n = Math.round(ratio);
    if (n >= 1) {
      $("#circle").innerHTML = circle(themCls, meCls, n);
      $("#ratio").innerHTML = `About <b>${n}</b> ${n === 1 ? meCls : meWord} your age for every <b>1 ${themOne}</b> who fits and would accept you.` +
        ` <span class="scale">(${ratio.toFixed(1)}, rounded)</span>`;
    } else {
      const k = Math.round(1 / ratio);       // fewer rivals than options: flip the picture
      $("#circle").innerHTML = circle(meCls, themCls, k);
      $("#ratio").innerHTML = `Good odds: about <b>${k}</b> ${k === 1 ? themOne : themOne === "man" ? "men" : "women"} who fit and would accept you for every <b>1 ${meCls}</b> your age.` +
        ` <span class="scale">(${ratio.toFixed(2)} ${meWord} per ${themOne}, rounded)</span>`;
    }
  }

  // ------------------------------------------------------------------ login (token in memory only)
  function lock(message) {
    token = null; clearTimeout(expiryTimer); seq++;
    state.bride = { me: {}, want: {} }; state.groom = { me: {}, want: {} };
    $("#calc").hidden = true; $("#login").hidden = false;
    $("#login-msg").textContent = message || "";
    $("#password").value = "";
  }

  async function start() {
    const r = await fetch(API + "/api/meta", { headers: { Authorization: "Bearer " + token }, cache: "no-store", credentials: "omit" });
    if (r.status === 401) return lock("Your session ended. Please unlock again.");
    if (!r.ok) throw new Error(String(r.status));
    const m = await r.json();
    $("#about").textContent = `Based on ${m.men} men and ${m.women} women who placed matrimonial ads in the Siasat Daily, Hyderabad, ` +
      `on ${m.papers.length} Sundays (${m.papers[0]} to ${m.papers[m.papers.length - 1]}). Someone who advertised more than once is counted once. ` +
      "These are newspaper advertisers only, not everyone looking to marry, and what each ad says was not verified. " +
      "“Would accept you” compares you with the age, complexion, education, location and marital status each ad asks for.";
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
      await start();
    } catch {
      msg.textContent = "Could not reach the server. Check your connection and try again.";
    } finally {
      btn.disabled = false;
    }
  });
  $("#logout").addEventListener("click", () => lock("Locked."));

  // ------------------------------------------------------------------ tabs
  function setMode(m) {
    mode = m;
    for (const b of ["bride", "groom"]) $("#tab-" + b).setAttribute("aria-selected", String(b === m));
    drawForm();
  }
  $("#tab-bride").addEventListener("click", () => setMode("bride"));
  $("#tab-groom").addEventListener("click", () => setMode("groom"));
})();
