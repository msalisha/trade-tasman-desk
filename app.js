"use strict";

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

/* ---------- Incoterms content (own words, not ICC text) ---------- */
const STEPS = [
  "Export packing and marking",
  "Loading at seller’s premises",
  "Transport to origin port or terminal",
  "Export clearance",
  "Origin terminal handling",
  "Loading onto ship or main carrier",
  "Main freight",
  "Cargo insurance",
  "Unloading at destination terminal",
  "Transport to buyer’s premises",
  "Unloading at buyer’s premises",
  "Import clearance, duty and GST",
];
// S seller, B buyer, s/b not required but that party carries the risk, V depends on named place / contract
const RULES = [
  { code: "EXW", name: "Ex Works", group: "any", risk: 0, cost: 0,
    m: "S B B B B B B b B B B B",
    deliver: "Goods are made available at the seller’s premises (or another named place), not loaded and not cleared for export.",
    riskText: "When the goods are placed at the buyer’s disposal at the named place.",
    insurance: "Neither party must insure. The buyer carries the risk from the start.",
    watch: "The buyer has to clear the goods for export in the seller’s country, which a foreign buyer often can’t do. Australian and NZ exporters also need export evidence for GST zero-rating. FCA at the seller’s premises is usually the better choice." },
  { code: "FCA", name: "Free Carrier", group: "any", risk: 0.5, cost: 1,
    m: "S S V S B B B b B B B B",
    deliver: "The seller hands the export-cleared goods to the buyer’s carrier at the named place. At the seller’s premises the seller loads them; anywhere else they are handed over on the arriving vehicle, ready for unloading.",
    riskText: "When the goods are handed to the carrier nominated by the buyer.",
    insurance: "Neither party must insure. The buyer carries the risk from handover.",
    watch: "Name the place precisely (an address or terminal, not just a city). The 2020 rules let the parties agree that the buyer’s carrier issues an on-board bill of lading to the seller, which helps with letters of credit." },
  { code: "FAS", name: "Free Alongside Ship", group: "sea", risk: 1, cost: 1,
    m: "S S S S S B B b B B B B",
    deliver: "The seller places the export-cleared goods alongside the buyer’s vessel at the named port of shipment.",
    riskText: "When the goods are alongside the ship, on the quay or a barge.",
    insurance: "Neither party must insure. The buyer carries the risk from alongside.",
    watch: "Made for bulk and breakbulk cargo. For containers, use FCA." },
  { code: "FOB", name: "Free On Board", group: "sea", risk: 2, cost: 2,
    m: "S S S S S S B b B B B B",
    deliver: "The seller loads the export-cleared goods on board the vessel nominated by the buyer at the named port of shipment.",
    riskText: "When the goods are on board the ship.",
    insurance: "Neither party must insure. The buyer carries the risk once the goods are on board.",
    watch: "Widely misused for containers. A container is handed to the terminal days before loading, so the seller carries risk for goods it no longer controls. Use FCA for containerised freight." },
  { code: "CFR", name: "Cost and Freight", group: "sea", risk: 2, cost: 3,
    m: "S S S S S S S b V B B B",
    deliver: "The seller loads the goods on board and pays the freight to the named port of destination.",
    riskText: "When the goods are on board at the port of shipment, even though the seller pays freight to destination.",
    insurance: "Neither party must insure. The buyer carries the risk during the sea leg and should insure it.",
    watch: "Risk and cost pass at different points. Buyers sometimes assume the seller is responsible until arrival; they aren’t. For containers, use CPT." },
  { code: "CIF", name: "Cost, Insurance and Freight", group: "sea", risk: 2, cost: 3,
    m: "S S S S S S S S V B B B",
    deliver: "As CFR, and the seller also buys cargo insurance for the buyer’s benefit.",
    riskText: "When the goods are on board at the port of shipment.",
    insurance: "The seller must insure at minimum cover (Institute Cargo Clauses C), for at least 110% of the contract value.",
    watch: "Minimum cover is narrow. If the buyer needs all-risks cover, say so in the contract. For containers, use CIP." },
  { code: "CPT", name: "Carriage Paid To", group: "any", risk: 0.5, cost: 4,
    m: "S S S S S S S b V V B B",
    deliver: "The seller hands the goods to its carrier and pays carriage to the named place of destination.",
    riskText: "When the goods are handed to the first carrier, usually in the seller’s country.",
    insurance: "Neither party must insure. The buyer carries the risk in transit.",
    watch: "Name both the destination and, ideally, the place of delivery to the first carrier, so it’s clear where risk passes." },
  { code: "CIP", name: "Carriage and Insurance Paid To", group: "any", risk: 0.5, cost: 4,
    m: "S S S S S S S S V V B B",
    deliver: "As CPT, and the seller also buys cargo insurance for the buyer’s benefit.",
    riskText: "When the goods are handed to the first carrier.",
    insurance: "The seller must insure at all-risks level (Institute Cargo Clauses A), for at least 110% of the contract value. This is higher than CIF.",
    watch: "The higher CIP cover was a 2020 change. Check that older contract templates and insurance arrangements reflect it." },
  { code: "DAP", name: "Delivered at Place", group: "any", risk: 4, cost: 4,
    m: "S S S S S S S s S S B B",
    deliver: "The seller delivers the goods on the arriving vehicle at the named destination, ready for unloading. The buyer unloads and clears import.",
    riskText: "When the goods arrive at the named place, ready for unloading.",
    insurance: "Not required, but the seller carries the transit risk and usually insures.",
    watch: "If the goods are held up because import clearance isn’t done, extra storage and demurrage costs usually fall on the buyer." },
  { code: "DPU", name: "Delivered at Place Unloaded", group: "any", risk: 4, cost: 4,
    m: "S S S S S S S s S S S B",
    deliver: "As DAP, but the seller also unloads the goods at the named place. It replaced DAT in 2020 and can be any place, not only a terminal.",
    riskText: "When the goods have been unloaded at the named place.",
    insurance: "Not required, but the seller carries the risk until unloading and usually insures.",
    watch: "The only rule where the seller unloads at destination. Make sure the seller can arrange unloading at that place." },
  { code: "DDP", name: "Delivered Duty Paid", group: "any", risk: 4, cost: 5,
    m: "S S S S S S S s S S B S",
    deliver: "The seller delivers the goods, cleared for import with duty and taxes paid, ready for unloading at the named place.",
    riskText: "When the goods arrive at the named place, cleared for import and ready for unloading.",
    insurance: "Not required, but the seller carries all transit risk and usually insures.",
    watch: "The seller acts as importer. In Australia and NZ that means import GST, possibly GST registration, and an importer of record. Many foreign sellers can’t do this. DAP is often the practical alternative." },
];
RULES.forEach((r) => (r.cells = r.m.split(" ")));
const STOPS = ["Seller", "Origin terminal", "On board", "Destination terminal", "Buyer / named place"];

/* ---------- state ---------- */
const state = {
  market: "both",
  origin: "CN",
  q: "honey",
  rule: "FCA",
  data: null,
  ex: { from: "AU", dest: "CN", q: "wine", sel: null },
};

/* ---------- routing ---------- */
const VIEWS = ["tariff", "export", "origin", "fta", "incoterms", "news"];
function route() {
  const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "tariff";
  VIEWS.forEach((name) => ($("#view-" + name).hidden = name !== v));
  $$("nav.tabs a").forEach((a) => a.setAttribute("aria-current", a.dataset.view === v ? "page" : "false"));
  if (v === "fta" && state.data) loadFtaMap();
}
window.addEventListener("hashchange", route);

/* ---------- Incoterms view ---------- */
function renderRuleButtons() {
  for (const grp of ["any", "sea"]) {
    $("#rules-" + grp).innerHTML = RULES.filter((r) => r.group === grp)
      .map((r) => `<button type="button" class="rule-btn" data-rule="${r.code}" aria-pressed="${r.code === state.rule}" title="${esc(r.name)}">${r.code}</button>`)
      .join("");
  }
}

function routeSvg(r) {
  const W = 420, H = 130, x0 = 14, x1 = 406, y = 50;
  const xs = STOPS.map((_, i) => x0 + ((x1 - x0) * i) / (STOPS.length - 1));
  const at = (p) => x0 + ((x1 - x0) * Math.min(p, 4)) / 4;
  const costX = at(r.cost);
  const riskX = at(r.risk);
  const stops = STOPS.map((s, i) => {
    const anchor = i === 0 ? "start" : i === STOPS.length - 1 ? "end" : "middle";
    const lx = i === 0 ? xs[i] - 6 : i === STOPS.length - 1 ? xs[i] + 6 : xs[i];
    return `<circle cx="${xs[i]}" cy="${y}" r="6" fill="var(--surface)" stroke="var(--muted)" stroke-width="2"/>
      <text x="${lx}" y="${y + (i % 2 ? 44 : 26)}" text-anchor="${anchor}" font-size="12" fill="var(--muted)" font-family="IBM Plex Sans, system-ui, sans-serif">${esc(s)}</text>`;
  }).join("");
  const imp = r.cost > 4 ? `<text x="${x1}" y="${y + 66}" text-anchor="end" font-size="12" font-weight="600" fill="var(--accent)" font-family="IBM Plex Sans, system-ui, sans-serif">+ import duty and GST</text>` : "";
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(r.code)}: seller pays up to ${esc(STOPS[Math.min(Math.floor(r.cost), 4)])}; risk passes ${esc(r.riskText)}">
    <line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="var(--buyer)" stroke-width="6" stroke-linecap="round" opacity="0.55"/>
    ${r.cost > 0 ? `<line x1="${x0}" y1="${y}" x2="${costX}" y2="${y}" stroke="var(--accent)" stroke-width="6" stroke-linecap="round"/>` : ""}
    ${stops}
    <g transform="translate(${riskX} ${y - 14})">
      <path d="M0 0 L-8 -14 L8 -14 Z" fill="var(--duty)"/>
      <text x="0" y="-20" text-anchor="middle" font-size="11" font-weight="600" fill="var(--duty)" font-family="IBM Plex Sans, system-ui, sans-serif">Risk passes</text>
    </g>
    ${imp}
  </svg>`;
}

function renderRule() {
  const r = RULES.find((x) => x.code === state.rule);
  $$(".rule-btn").forEach((b) => b.setAttribute("aria-pressed", b.dataset.rule === r.code));
  $("#rule-card").innerHTML = `
    <h3>${r.code}</h3>
    <div class="full">${esc(r.name)} · ${r.group === "sea" ? "sea and inland waterway only" : "any mode of transport"}</div>
    <dl class="facts">
      <dt>Delivery</dt><dd>${esc(r.deliver)}</dd>
      <dt>Risk passes</dt><dd>${esc(r.riskText)}</dd>
      <dt>Insurance</dt><dd>${esc(r.insurance)}</dd>
    </dl>
    <div class="watch"><b>Watch for:</b> ${esc(r.watch)}</div>`;
  $("#rule-route").innerHTML = `
    <span class="label">Who pays which leg</span>
    ${routeSvg(r)}
    <div class="legend" style="margin:0">
      <span><span class="cell S">━</span> Seller’s cost</span>
      <span><span class="cell B">━</span> Buyer’s cost</span>
      <span style="color:var(--duty)">▼ Risk transfer</span>
    </div>`;
  renderMatrix();
}

function renderMatrix() {
  const sel = state.rule;
  const head = `<thead><tr><th scope="col">Cost or task</th>${RULES.map((r) =>
    `<th scope="col" class="${r.code === sel ? "sel" : ""}"><button type="button" data-rule="${r.code}" title="${esc(r.name)}">${r.code}</button></th>`).join("")}</tr></thead>`;
  const label = { S: "S", B: "B", s: "s", b: "b", V: "?" };
  const cls = { S: "S", B: "B", s: "o S", b: "o B", V: "V" };
  const body = STEPS.map((step, i) => `<tr><td>${esc(step)}</td>${RULES.map((r) => {
    const c = r.cells[i];
    return `<td class="${r.code === sel ? "sel" : ""}"><span class="cell ${cls[c]}">${label[c]}</span></td>`;
  }).join("")}</tr>`).join("");
  const riskShort = { EXW: "Seller’s premises", FCA: "Handover", FAS: "Alongside", FOB: "On board", CFR: "On board", CIF: "On board", CPT: "First carrier", CIP: "First carrier", DAP: "Arrival", DPU: "Unloaded", DDP: "Arrival" };
  const riskRow = `<tr class="risk-row"><td><strong>Risk passes at</strong></td>${RULES.map((r) => `<td class="${r.code === sel ? "sel" : ""}" style="font-size:11px">${riskShort[r.code]}</td>`).join("")}</tr>`;
  $("#matrix").innerHTML = head + `<tbody>${body}${riskRow}</tbody>`;
}

/* picker */
function pickerOptions() {
  const mode = $("#p-mode").value, freight = $("#p-freight").value;
  const risk = $("#p-risk"), extra = $("#p-extra");
  const prevRisk = risk.value, prevExtra = extra.value;
  let riskOpts, extraOpts;
  if (freight === "buyer") {
    riskOpts = mode === "sea"
      ? [["FAS", "…alongside the ship"], ["FOB", "…once loaded on board"]]
      : [["origin", "…when handed to the buyer’s carrier"]];
  } else {
    riskOpts = [["C", "…at origin, when handed to the carrier"], ["D", "…at destination"]];
  }
  risk.innerHTML = riskOpts.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
  if (riskOpts.some(([v]) => v === prevRisk)) risk.value = prevRisk;
  const rv = risk.value;
  if (freight === "buyer" && rv === "origin") extraOpts = [["FCA", "Seller clears export"], ["EXW", "Buyer clears export and loads"]];
  else if (freight === "buyer") extraOpts = [[rv, "Seller clears export"]];
  else if (rv === "C") extraOpts = mode === "sea" ? [["CIF", "Seller buys insurance"], ["CFR", "Buyer arranges insurance"]] : [["CIP", "Seller buys insurance"], ["CPT", "Buyer arranges insurance"]];
  else extraOpts = [["DAP", "Buyer unloads and clears import"], ["DPU", "Seller unloads; buyer clears import"], ["DDP", "Seller clears import and pays duty/GST"]];
  extra.innerHTML = extraOpts.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
  if (extraOpts.some(([v]) => v === prevExtra)) extra.value = prevExtra;
  extra.disabled = extraOpts.length === 1;
  const r = RULES.find((x) => x.code === extra.value);
  $("#p-answer").innerHTML = `<span class="code">${r.code}</span><span><strong>${esc(r.name)}</strong> · risk passes ${esc(r.riskText.charAt(0).toLowerCase() + r.riskText.slice(1))}</span><button type="button" data-rule="${r.code}">Show this rule</button>`;
}

/* ---------- Tariff view ---------- */
function expand(list, groups) {
  return list.flatMap((p) => (p.startsWith("@") ? groups[p.slice(1)] : [p]));
}

function prepare(au, nz, fta) {
  // AU: build readable path from heading + dash-indented parents
  const auLines = [];
  let heading = "", headingCode = "", stack = [];
  for (const it of au.items) {
    const depth = (it.desc.match(/^-+/) || [""])[0].length;
    const text = it.desc.replace(/^-+\s*/, "").replace(/:$/, "");
    if (it.code.length === 4 && depth === 0) { heading = text; headingCode = it.code; stack = []; continue; }
    if (it.code.slice(0, 4) !== headingCode) { heading = ""; headingCode = it.code.slice(0, 4); stack = []; }
    stack[depth] = text;
    stack.length = depth + 1;
    if (!it.stat) continue;
    const parents = stack.slice(1, depth).filter(Boolean);
    auLines.push({
      mkt: "AU", digits: it.code.replace(/\./g, ""), code: it.code, stat: it.stat, unit: it.unit,
      desc: cap(text), path: [cap(heading), ...parents].filter(Boolean).join(" › "), rate: it.rate, other: it.other,
    });
  }
  const nzLines = nz.items.map((it) => ({
    mkt: "NZ", digits: it.code, code: `${it.code.slice(0, 4)}.${it.code.slice(4, 6)}.${it.code.slice(6, 8)}`,
    stat: it.code.slice(8, 10) + it.check, unit: it.unit, desc: cap(it.desc), path: "", rate: it.normal, pref: it.pref, gstExempt: it.gstExempt,
  }));
  for (const l of [...auLines, ...nzLines]) l.hay = (l.path + " " + l.desc).toLowerCase();

  // origin → agreements
  const cover = (agreements, iso) => agreements.filter((a) => expand(a.partners, fta.groups).includes(iso));
  return { auLines, nzLines, fta, cover, au, nz };
}
function cap(s) {
  if (!s) return s;
  if (s === s.toUpperCase()) s = s.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function search(q, market) {
  const D = state.data;
  q = q.trim().toLowerCase();
  const pool = market === "AU" ? D.auLines : market === "NZ" ? D.nzLines : [...D.auLines, ...D.nzLines];
  if (!q) return [];
  if (/^[\d.\s]+$/.test(q)) {
    const d = q.replace(/[.\s]/g, "");
    return pool.filter((l) => l.digits.startsWith(d));
  }
  const toks = wordMatchers(q);
  return pool.filter((l) => toks.every((t) => t.test(l.hay)));
}
// Match at the start of a word, so "wine" doesn't find "swine"; drop a plural ending.
function wordMatchers(q) {
  return q.split(/\s+/).filter(Boolean)
    .map((t) => (t.length > 3 ? t.replace(/(es|s)$/, "") : t))
    .map((t) => new RegExp("(^|[^a-z0-9])" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

function rateRank(r) {
  if (!r) return 9999;
  if (/^free/i.test(r)) return 0;
  const m = r.match(/^([\d.]+)%/);
  if (m) return parseFloat(m[1]);
  // Specific rates ("$0.41/kg"): rank after percentages, cheaper first.
  const s = r.match(/^\$\s?([\d.,]+)/);
  return s ? 500 + parseFloat(s[1].replace(/,/g, "")) : 9000;
}
function rateHtml(r) {
  if (!r) return `<span class="rate">—</span>`;
  return `<span class="rate ${/^free/i.test(r) ? "free" : "duty"}">${esc(r)}</span>`;
}

const AU_SCHED_CODES = { NZ: "NZ", PG: "PG", SG: "SG", CA: "CA", MY: "MY" };
const FORUM_ISLANDS = ["CK", "FJ", "KI", "MH", "FM", "NR", "NU", "PW", "WS", "SB", "TO", "TV", "VU"];

function originCell(l) {
  const o = state.origin, D = state.data;
  if (!o) return `<span class="note">Pick an origin</span>`;
  if (o === l.mkt) return `<span class="note">Domestic goods</span>`;
  if (l.mkt === "NZ") {
    const ags = [...D.cover(D.fta.NZ, o), ...D.cover(D.fta.NZschemes, o)];
    if (!ags.length) return `<div class="pref-list"><div class="row"><span class="nm">No preference</span>${rateHtml(l.rate)}</div></div>`;
    const rows = ags.map((a) => ({ a, r: l.pref[a.code] ?? l.rate })).sort((x, y) => rateRank(x.r) - rateRank(y.r));
    const best = rateRank(rows[0].r);
    return `<div class="pref-list">${rows.slice(0, 4).map(({ a, r }) =>
      `<div class="row ${rateRank(r) === best ? "best" : ""}"><span class="nm">${esc(a.id)}</span>${rateHtml(r)}</div>`).join("")}
      ${rows.length > 4 ? `<span class="nm">+${rows.length - 4} more</span>` : ""}</div>`;
  }
  // AU
  const ags = D.cover(D.fta.AU, o);
  if (/^free$/i.test(l.rate)) return `<div class="pref-list"><div class="row best"><span class="nm">All origins</span>${rateHtml("Free")}</div></div>`;
  const schedule3 = (code) => {
    for (const [k, v] of Object.entries(l.other || {})) if (k.split("/").includes(code)) return v;
    return null;
  };
  const rows = [];
  for (const a of ags) {
    // ANZCERTA: the "NZ" rate in Schedule 3, otherwise Free (Customs Tariff Act s 16(1)(b)).
    if (a.id === "ANZCERTA") { rows.push({ nm: a.id, r: schedule3("NZ") || "Free" }); continue; }
    const s = D.auFta && D.auFta.agreements[a.id];
    rows.push({ nm: a.id, r: s ? auFtaRate(s.lines, l.digits, D.fta.countries[o]) : null });
  }
  // Non-FTA preferences printed in Schedule 3 (Papua New Guinea, Forum Islands, Canada, Malaysia, Singapore).
  const sched = o === "NZ" ? null : AU_SCHED_CODES[o] || (FORUM_ISLANDS.includes(o) ? "FI" : null);
  const s3 = sched && schedule3(sched);
  if (s3) rows.push({ nm: `Schedule 3 (${sched})`, r: s3 });
  if (!rows.length) return `<div class="pref-list"><div class="row"><span class="nm">No FTA</span>${rateHtml(l.rate)}</div></div>`;
  const known = rows.filter((x) => x.r).sort((x, y) => rateRank(x.r) - rateRank(y.r));
  const unknown = rows.filter((x) => !x.r);
  const best = known.length ? rateRank(known[0].r) : null;
  return `<div class="pref-list">${known.slice(0, 4).map((x) =>
      `<div class="row ${rateRank(x.r) === best ? "best" : ""}"><span class="nm">${esc(x.nm)}</span>${rateHtml(x.r)}</div>`).join("")}
    ${known.length > 4 ? `<span class="nm">+${known.length - 4} more</span>` : ""}
    ${unknown.map((x) => `<div class="row"><span class="nm">${esc(x.nm)}</span><a href="https://ftaportal.dfat.gov.au" target="_blank" rel="noopener">FTA rate ↗</a></div>`).join("")}</div>`;
}

// Rate for a tariff line under one Australian FTA schedule: Free unless the line is listed.
// Some CPTPP lines carry a rate for named countries only ("United Kingdom: $0.776/kg").
function auFtaRate(lines, digits, countryName) {
  const hit = lines[digits] ?? lines[digits.slice(0, 6) + "00"] ?? lines[digits.slice(0, 4) + "0000"];
  if (!hit) return "Free";
  const parts = hit.split("; ");
  if (!parts.every((p) => /^[A-Z][A-Za-z ]+: /.test(p))) return hit;
  const norm = (s) => s.toLowerCase().replace("vietnam", "viet nam").replace(/ darussalam$/, "");
  const mine = parts.find((p) => norm(p.split(":")[0]) === norm(countryName || ""));
  return mine ? mine.slice(mine.indexOf(":") + 2) : "Free";
}

function renderTariff() {
  const D = state.data;
  if (!D) return;
  const all = search(state.q, state.market).sort((a, b) => a.digits.localeCompare(b.digits) || a.mkt.localeCompare(b.mkt));
  const shown = all.slice(0, 150);
  const oName = state.origin ? D.fta.countries[state.origin] : null;
  const counts = { AU: all.filter((l) => l.mkt === "AU").length, NZ: all.filter((l) => l.mkt === "NZ").length };
  $("#tariff-summary").innerHTML = state.q.trim()
    ? `<span><strong>${all.length.toLocaleString()}</strong> tariff lines match “${esc(state.q.trim())}”</span>
       ${state.market === "both" ? `<span>${counts.AU} AU · ${counts.NZ} NZ</span>` : ""}
       ${all.length > shown.length ? `<span>Showing the first ${shown.length}. Add a word or a code to narrow it.</span>` : ""}`
    : "";
  if (!state.q.trim()) {
    $("#tariff-results").innerHTML = `<div class="empty">Type a product or an HS code to search ${(D.auLines.length + D.nzLines.length).toLocaleString()} tariff lines.</div>`;
    return;
  }
  if (!all.length) {
    $("#tariff-results").innerHTML = `<div class="empty">No lines match “${esc(state.q)}”. Try a broader word, or the first four digits of the HS code.</div>`;
    return;
  }
  $("#tariff-results").innerHTML = `<table class="tariff-table">
    <thead><tr><th scope="col">Code</th><th scope="col">Description</th><th scope="col">Unit</th><th scope="col">General rate</th><th scope="col">${oName ? "From " + esc(oName) : "By origin"}</th></tr></thead>
    <tbody>${shown.map((l) => `<tr>
      <td class="code"><span class="mkt ${l.mkt}">${l.mkt}</span>${esc(l.code)}<span style="color:var(--muted)"> · ${esc(l.stat)}</span></td>
      <td style="min-width:240px">${l.path ? `<div class="path">${esc(l.path)}</div>` : ""}<div class="desc">${esc(l.desc)}</div>${l.gstExempt ? `<div class="path">GST exempt</div>` : ""}</td>
      <td class="mono" style="font-size:13px;color:var(--muted)">${esc(l.unit || "")}</td>
      <td>${rateHtml(l.rate)}</td>
      <td style="min-width:200px">${originCell(l)}</td>
    </tr>`).join("")}</tbody></table>`;
}

function tariffFoot() {
  const D = state.data;
  $("#tariff-stamp").innerHTML = `NZ tariff: ${esc(D.nz.extracted.replace(/\s+\d+:\d+:\d+.*?NZDT/, ""))}<br>AU tariff and FTA schedules: extracted ${fmtDate(D.au.extracted)}`;
  $("#tariff-foot").textContent =
    "NZ codes show tariff item · statistical key with check letter. AU codes show tariff classification · statistical code. " +
    "NZ rates by origin come from NZ Customs’ preferential columns. Australian FTA rates come from Schedules 4A–16 of the Customs Tariff Act: originating goods are Free unless the agreement’s schedule lists the line. " +
    "Preferential rates apply only to goods that meet the agreement’s rules of origin.";
}

/* ---------- FTA view ---------- */
function renderFta() {
  const D = state.data;
  if (!D) return;
  const iso = $("#fta-country").value;
  const name = D.fta.countries[iso];
  const block = (title, list, pending, schemes, market) => {
    const covered = list.filter((a) => expand(a.partners, D.fta.groups).includes(iso));
    const rest = list.filter((a) => !covered.includes(a));
    const sch = (schemes || []).filter((a) => expand(a.partners, D.fta.groups).includes(iso));
    const pend = (pending || []).filter((a) => expand(a.partners, D.fta.groups).includes(iso));
    const li = (a, dim) => `<li class="${dim ? "dim" : ""}"><span class="ab">${esc(a.id)}${a.code && !dim ? `<span class="tag">NZ rate code ${esc(a.code)}</span>` : ""}</span>
      <span class="date">${a.inForce ? fmtDate(a.inForce) : ""}</span><span class="full">${esc(a.name)}${a.note ? " · " + esc(a.note) : ""}</span></li>`;
    const domestic = iso === market;
    return `<div class="panel agree">
      <h3>${esc(title)} <span class="count">${domestic ? "home market" : `${covered.length} of ${list.length} cover ${esc(name)}`}</span></h3>
      <ul>
        ${domestic ? `<li><span class="full">Choose another country to see ${esc(title)}’s agreements with it.</span></li>` : ""}
        ${!domestic && !covered.length && !sch.length && !pend.length ? `<li><span class="ab">No agreement in force</span><span class="full">Imports from ${esc(name)} pay the general rate.</span></li>` : ""}
        ${domestic ? "" : covered.map((a) => li(a, false)).join("")}
        ${domestic ? "" : pend.map((a) => `<li><span class="ab">${esc(a.id)}<span class="tag pend">Not in force</span></span><span class="full">${esc(a.name)} · ${esc(a.status)}</span></li>`).join("")}
        ${domestic ? "" : sch.map((a) => `<li><span class="ab">${esc(a.id)}<span class="tag">NZ rate code ${esc(a.code)}</span></span><span class="full">${esc(a.name)} (non-reciprocal preference)</span></li>`).join("")}
        ${rest.map((a) => li(a, true)).join("")}
      </ul></div>`;
  };
  $("#fta-results").innerHTML =
    block("Australia", D.fta.AU, D.fta.AUpending, null, "AU") +
    block("New Zealand", D.fta.NZ, null, D.fta.NZschemes, "NZ");

  const both = ["AANZFTA", "CPTPP", "RCEP", "PACER Plus"];
  let shared;
  if (iso === "AU" || iso === "NZ") {
    shared = `<h3>Trans-Tasman trade</h3><p class="note">Australia and New Zealand trade under CER (in force since 1 January 1983), and are also both parties to AANZFTA, CPTPP, RCEP and PACER Plus.</p>`;
  } else {
    const auSet = D.cover(D.fta.AU, iso).map((a) => a.id), nzSet = D.cover(D.fta.NZ, iso).map((a) => a.id);
    const common = both.filter((id) => auSet.includes(id) && nzSet.includes(id));
    shared = `<h3>Covered in both markets</h3><p class="note">${common.length
      ? `${esc(name)} is a party to ${common.map(esc).join(", ")} with both Australia and New Zealand. Goods made in one of those countries can often use cumulation rules when inputs come from the other parties.`
      : `No single agreement covers ${esc(name)} together with both Australia and New Zealand.`}</p>`;
  }
  $("#fta-shared").innerHTML = shared;
  paintFtaMap(false);
}

/* ---------- FTA map ---------- */
const ftaMap = { data: null, loading: false };
async function loadFtaMap() {
  if (ftaMap.data || ftaMap.loading) return;
  ftaMap.loading = true;
  try {
    const m = await fetch("data/world_map.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    const svg = $("#fta-map");
    svg.setAttribute("viewBox", `0 0 ${m.w} ${m.h}`);
    const title = svg.querySelector("title").outerHTML;
    const C = state.data.fta.countries;
    const shapes = [], dots = [];
    for (const [iso, c] of Object.entries(m.countries)) {
      const name = esc(C[iso] || iso);
      if (c.d) shapes.push(`<path data-iso="${iso}" d="${c.d}"><title>${name}</title></path>`);
      if (c.small) dots.push(`<circle data-iso="${iso}" data-dot="1" cx="${c.c[0]}" cy="${c.c[1]}" r="3.2"><title>${name}</title></circle>`);
    }
    svg.innerHTML = title + `<g>${shapes.join("")}</g><g>${dots.join("")}</g>`;
    svg.addEventListener("click", (e) => {
      const el = e.target.closest("[data-iso]");
      if (!el || !state.data.fta.countries[el.dataset.iso]) return;
      const sel = $("#fta-country");
      sel.value = el.dataset.iso;
      store.set("tt.fta", sel.value);
      renderFta();
    });
    ftaMap.data = m;
    paintFtaMap(true);
  } catch (err) {
    // The finder still works without the map; offer a retry (it also retries next time the tab opens).
    $("#fta-map-scroll").insertAdjacentHTML("afterbegin", `<p class="map-error">The map didn’t load. <button type="button" class="chip" id="fta-map-retry">Try again</button></p>`);
    $("#fta-map-retry").addEventListener("click", () => { $(".map-error").remove(); loadFtaMap(); });
  } finally {
    ftaMap.loading = false;
  }
}
function paintFtaMap(centre) {
  const D = state.data;
  if (!ftaMap.data || !D) return;
  const iso = $("#fta-country").value;
  $$("#fta-map [data-iso]").forEach((el) => {
    const k = el.dataset.iso;
    let cls;
    if (k === "AU" || k === "NZ") cls = "home";
    else {
      const au = D.cover(D.fta.AU, k).length > 0, nz = D.cover(D.fta.NZ, k).length > 0;
      cls = au && nz ? "both" : au ? "au" : nz ? "nz" : "none";
    }
    // Dots for tiny countries only show when there is something to see.
    if (el.dataset.dot) el.style.display = cls === "none" && k !== iso ? "none" : "";
    el.setAttribute("class", cls + (k === iso ? " sel" : ""));
  });
  // Raise the selected country so its outline isn't hidden by neighbours.
  $$(`#fta-map [data-iso="${iso}"]`).forEach((el) => el.parentNode.appendChild(el));
  if (centre) {
    const sc = $("#fta-map-scroll");
    sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2;
  }
}

/* ---------- Origin view ---------- */
const origin = { data: null, mkt: "all" };

function renderOriginStatic() {
  const O = origin.data;
  $("#ori-criteria").innerHTML = O.criteria.map((c) => `<div class="panel ori-card">
    <span class="ori-code">${esc(c.code)}</span><h3>${esc(c.name)}</h3><p>${esc(c.text)}</p></div>`).join("");
  $("#ori-tests").innerHTML = O.psrTests.map((t) => `<div class="ori-test"><b>${esc(t.code)}</b>${esc(t.name)}<p>${esc(t.text)}</p></div>`).join("");
  $("#ori-psr-links").innerHTML = `Find the rule for your HS code on the <a href="${O.psrLookup.AU.url}" target="_blank" rel="noopener">${esc(O.psrLookup.AU.name)} ↗</a> (Australian agreements) or the <a href="${O.psrLookup.NZ.url}" target="_blank" rel="noopener">${esc(O.psrLookup.NZ.name)} ↗</a> (NZ agreements).`;
  $("#ori-prov").innerHTML = O.provisions.map((p) => `<dt>${esc(p.name)}</dt><dd>${esc(p.text)}</dd>`).join("");
  const opt = (a) => `<option value="${esc(a.id)}">${esc(a.id)}</option>`;
  const shared = O.agreements.filter((a) => a.markets.length > 1);
  $("#oc-ag").innerHTML =
    `<optgroup label="Australia and New Zealand">${shared.map(opt).join("")}</optgroup>` +
    `<optgroup label="Australia">${O.agreements.filter((a) => a.markets.join() === "AU").map(opt).join("")}</optgroup>` +
    `<optgroup label="New Zealand">${O.agreements.filter((a) => a.markets.join() === "NZ").map(opt).join("")}</optgroup>`;
  $("#oc-ag").value = "RCEP";
  Object.entries({ "#oc-req": 40, "#oc-fob": 100000, "#oc-vnm": 45000, "#oc-vom": 40000, "#oc-fail": 6000 }).forEach(([s, v]) => ($(s).value = v));
}

function renderOriginTable() {
  const O = origin.data;
  const list = O.agreements.filter((a) => origin.mkt === "all" || a.markets.includes(origin.mkt));
  const cell = (v) => (v ? esc(v) : `<span class="gap">Not yet checked</span>`);
  $("#ori-table").innerHTML = `<thead><tr><th scope="col">Agreement</th><th scope="col">Value test</th><th scope="col">De minimis</th><th scope="col">Accumulation</th><th scope="col">Source</th></tr></thead>
    <tbody>${list.map((a) => `<tr>
      <td>${esc(a.id)}<span class="mk">${a.markets.join(" · ")}</span></td>
      <td>${cell(a.value)}</td><td>${cell(a.deMinimis)}</td><td>${cell(a.cumulation)}</td>
      <td>${a.url ? `<a href="${a.url}" target="_blank" rel="noopener">${esc(a.src)} ↗</a>` : `<span class="gap">Check the agreement text</span>`}</td>
    </tr>`).join("")}</tbody>`;
}

function renderOriginCalc() {
  const O = origin.data;
  const ag = O.agreements.find((a) => a.id === $("#oc-ag").value);
  const n = (s) => parseFloat($(s).value);
  const fob = n("#oc-fob"), vnm = n("#oc-vnm"), vom = n("#oc-vom"), fail = n("#oc-fail"), req = n("#oc-req");
  const pct = (x) => `${(Math.round(x * 10) / 10).toLocaleString()}%`;
  const out = [];
  if (!(fob > 0)) {
    $("#oc-out").innerHTML = `<div class="res"><p>Enter the FOB value of the good to run the check.</p></div>`;
    return;
  }
  const offset = ag.rvc ? ag.rvc.down - ag.rvc.up : 0;
  const reqUp = isFinite(req) ? Math.max(0, req - offset) : NaN;
  if (isFinite(vnm)) {
    const bd = ((fob - vnm) / fob) * 100;
    const ok = isFinite(req) ? bd >= req : null;
    out.push(`<div class="res ${ok === null ? "" : ok ? "pass" : "fail"}"><div class="lbl">Build-down RVC</div><div class="num">${pct(bd)}</div>
      <p>(FOB − non-originating) ÷ FOB. ${ok === null ? "Enter the required %." : ok ? `Meets ${pct(req)}.` : `Below the ${pct(req)} required.`}</p></div>`);
  }
  if (isFinite(vom)) {
    const bu = (vom / fob) * 100;
    const ok = isFinite(reqUp) ? bu >= reqUp : null;
    out.push(`<div class="res ${ok === null ? "" : ok ? "pass" : "fail"}"><div class="lbl">Build-up RVC</div><div class="num">${pct(bu)}</div>
      <p>Originating content ÷ FOB. ${ok === null ? "Enter the required %." : `${ok ? "Meets" : "Below"} ${pct(reqUp)}${offset ? ` (${ag.id} sets build-up ${offset} points lower)` : ""}.`}</p></div>`);
  }
  if (isFinite(fail)) {
    const share = (fail / fob) * 100;
    const ok = share <= ag.dmPct;
    out.push(`<div class="res ${ok ? "pass" : "fail"}"><div class="lbl">De minimis check</div><div class="num">${pct(share)}</div>
      <p>${ok ? `Within ${ag.id}’s ${ag.dmPct}% tolerance: the tariff-shift test can still be met.` : `Over ${ag.id}’s ${ag.dmPct}% tolerance: those inputs must change classification, or use the RVC route if the rule allows it.`}</p></div>`);
  }
  out.push(`<div class="res"><div class="lbl">${esc(ag.id)} rules</div><p style="margin-top:6px">${ag.value ? esc(ag.value) : "Value test not yet checked for this agreement. Use the product rule."}</p>
    ${ag.note ? `<p class="note" style="margin-top:6px">${esc(ag.note)}</p>` : ""}</div>`);
  $("#oc-out").innerHTML = out.join("");
}

function wireOrigin() {
  $$(".seg button[data-omkt]").forEach((b) => b.addEventListener("click", () => {
    origin.mkt = b.dataset.omkt;
    $$(".seg button[data-omkt]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    renderOriginTable();
  }));
  $("#oc-ag").addEventListener("change", () => {
    const ag = origin.data.agreements.find((a) => a.id === $("#oc-ag").value);
    $("#oc-req").value = ag.rvc ? ag.rvc.down : "";
    renderOriginCalc();
  });
  ["#oc-req", "#oc-fob", "#oc-vnm", "#oc-vom", "#oc-fail"].forEach((s) => $(s).addEventListener("input", renderOriginCalc));
}

async function bootOrigin() {
  try {
    const r = await fetch("data/origin.json");
    if (!r.ok) throw new Error("data/origin.json " + r.status);
    origin.data = await r.json();
    renderOriginStatic();
    renderOriginTable();
    renderOriginCalc();
    wireOrigin();
  } catch (err) {
    $("#ori-criteria").innerHTML = `<div class="panel empty">The origin data didn’t load (${esc(err.message)}). Reload the page to try again.</div>`;
  }
}

/* ---------- News view ---------- */
const NEWS_SOURCES = {
  mfat: {
    title: "New Zealand", src: "MFAT",
    notice: `Source: New Zealand Ministry of Foreign Affairs and Trade (MFAT), <a href="https://www.mfat.govt.nz/en/trade/mfat-market-reports" target="_blank" rel="noopener">Market reports ↗</a>. Crown copyright, licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0 ↗</a>. Summaries are MFAT’s own one-line descriptions; read the full report on mfat.govt.nz.`,
  },
  ifcbaa: {
    title: "Australia", src: "IFCBAA",
    notice: `Headlines link to news published by the International Forwarders &amp; Customs Brokers Association of Australia (IFCBAA). © IFCBAA, all rights reserved. Read the full articles on <a href="https://www.ifcbaa.com/IFCBAA/News/IFCBAA/News/LatestNews.aspx" target="_blank" rel="noopener">ifcbaa.com ↗</a>.`,
  },
};

async function bootNews() {
  try {
    const r = await fetch("data/news.json");
    if (!r.ok) throw new Error("data/news.json " + r.status);
    const news = await r.json();
    const upd = new Date(news.updated);
    $("#news-stamp").textContent = `Collected ${upd.toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}`;
    $("#news-cols").innerHTML = Object.entries(NEWS_SOURCES).map(([key, s]) => {
      const data = news.sources[key] || { enabled: false, items: [] };
      const body = !data.enabled
        ? `<li><p>This source is switched off.</p></li>`
        : !data.items.length
          ? `<li><p>No recent items yet.</p></li>`
          : data.items.map((i) => `<li>
              <span class="meta"><span>${fmtDate(i.date)}</span>${i.ref ? `<span>${esc(i.ref)}</span>` : ""}</span>
              <a class="t" href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)} ↗</a>
              ${i.summary ? `<p>${esc(i.summary)}</p>` : ""}
            </li>`).join("");
      return `<div class="panel news-col">
        <h3>${esc(s.title)} <span class="src">${esc(s.src)}</span></h3>
        <p class="news-notice">${s.notice}</p>
        <ul class="news-list">${body}</ul></div>`;
    }).join("");
  } catch (err) {
    $("#news-stamp").textContent = "News unavailable";
    $("#news-cols").innerHTML = `<div class="panel empty">The news didn’t load (${esc(err.message)}). Reload the page to try again.</div>`;
  }
}

/* ---------- boot ---------- */
function fillCountrySelects(fta) {
  const opts = Object.entries(fta.countries).sort((a, b) => a[1].localeCompare(b[1]))
    .map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
  $("#origin").innerHTML = `<option value="">Not specified</option>` + opts;
  $("#origin").value = state.origin;
  $("#fta-country").innerHTML = opts;
  $("#fta-country").value = store.get("tt.fta") || "CN";
  $("#ex-dest").innerHTML = opts;
  $("#ex-dest").value = state.ex.dest;
  $("#ex-q").value = state.ex.q;
}

/* ---------- Export view ---------- */
function exportSearch() {
  const D = state.data, { from, q } = state.ex;
  const pool = from === "AU" ? D.auExport : D.nzLines;
  const s = q.trim().toLowerCase();
  if (!s) return [];
  if (/^[\d.\s]+$/.test(s)) { const d = s.replace(/[.\s]/g, ""); return pool.filter((l) => l.digits.startsWith(d)); }
  const toks = wordMatchers(s);
  return pool.filter((l) => toks.every((t) => t.test(l.hay)));
}

function renderExport() {
  const D = state.data;
  if (!D) return;
  const { from, dest } = state.ex;
  const all = exportSearch().sort((a, b) => a.digits.localeCompare(b.digits));
  const shown = all.slice(0, 120);
  if (!state.ex.sel || !all.some((l) => l.digits === state.ex.sel)) state.ex.sel = shown[0]?.digits || null;
  const sel = all.find((l) => l.digits === state.ex.sel) || null;
  const codeName = from === "AU" ? "AHECC" : "NZ tariff item and statistical key";

  $("#ex-summary").innerHTML = state.ex.q.trim()
    ? `<span><strong>${all.length.toLocaleString()}</strong> ${from === "AU" ? "AHECC export codes" : "NZ export codes"} match “${esc(state.ex.q.trim())}”</span>${all.length > shown.length ? `<span>Showing the first ${shown.length}</span>` : ""}`
    : "";
  $("#ex-results").innerHTML = !state.ex.q.trim()
    ? `<div class="empty">Type a product or code to find the ${codeName} to declare.</div>`
    : !all.length
      ? `<div class="empty">No export codes match “${esc(state.ex.q)}”. Try a broader word or the first four digits.</div>`
      : `<table class="ex-table"><thead><tr><th scope="col">${from === "AU" ? "AHECC" : "Code"}</th><th scope="col">Description</th><th scope="col">Unit</th></tr></thead><tbody>
        ${shown.map((l) => `<tr class="${l.digits === state.ex.sel ? "on" : ""}">
          <td><button type="button" class="pick-code" data-pick="${l.digits}" aria-pressed="${l.digits === state.ex.sel}">${esc(l.code)}${l.stat ? " · " + esc(l.stat) : ""}</button></td>
          <td>${l.path ? `<div class="path">${esc(l.path)}</div>` : ""}<div class="desc">${esc(l.desc)}</div></td>
          <td class="mono" style="font-size:13px;color:var(--muted)">${esc(l.unit || "")}</td></tr>`).join("")}
        </tbody></table>`;

  $("#ex-check").innerHTML = checklist(from, dest, sel);
}

function checklist(from, dest, sel) {
  const D = state.data, R = D.rules, C = D.fta.countries;
  const fromName = from === "AU" ? "Australia" : "New Zealand";
  const destName = C[dest];
  const lookup = R.dutyLookup[from];
  const out = [];

  // 1. product
  if (sel) {
    const hs6 = sel.digits.slice(0, 4) + "." + sel.digits.slice(4, 6);
    out.push(`<section><h3>Export code</h3>
      <p class="big mono">${esc(sel.code)}${sel.stat ? " · " + esc(sel.stat) : ""}</p>
      <p>${esc(sel.desc)}${sel.unit ? ` <span class="note">(report in ${esc(sel.unit)})</span>` : ""}</p>
      ${(sel.notes || []).map((n) => `<p class="note">${esc(n)}</p>`).join("")}
      <p class="note">Your buyer’s tariff in ${esc(destName)} uses the same first six digits, <span class="mono">${hs6}</span>. Look up their duty rate on the <a href="${lookup.url}" target="_blank" rel="noopener">${esc(lookup.name)} ↗</a>.</p>
    </section>`);
  } else {
    out.push(`<section><h3>Export code</h3><p class="note">Search for a product, then pick a code from the list.</p></section>`);
  }

  if (dest === from) {
    out.push(`<section><h3>Destination</h3><p>Pick a destination outside ${fromName}.</p></section>`);
    return out.join("");
  }

  // 2. declaration
  const dec = R.declaration[from];
  out.push(`<section><h3>Export declaration <span class="badge ok">${esc(dec.threshold)}</span></h3>
    <p>${esc(dec.text)}</p><p class="note"><a href="${dec.link}" target="_blank" rel="noopener">${from === "AU" ? "ABF export requirements" : "NZ Customs export clearance"} ↗</a></p></section>`);

  // 3. agreements + proof of origin
  const ags = D.cover(D.fta[from], dest);
  const pend = from === "AU" ? D.cover(D.fta.AUpending, dest) : [];
  const zero = R.zeroDuty[dest];
  let agHtml = "";
  if (ags.length) {
    agHtml = ags.map((a) => {
      const p = R.proof[from][a.id];
      return `<div class="ag"><div class="ag-name">${esc(a.id)} <span class="note" style="font-weight:400">${esc(a.name)}</span></div>
        <p>${p ? esc(p.text) : "Check the agreement’s origin chapter."}</p>
        ${p ? (p.checked
          ? `<span class="badge ok">Checked ${fmtDate(R.checked)}</span> <a class="note" href="${p.url}" target="_blank" rel="noopener">${esc(p.src)} ↗</a>`
          : `<span class="badge warn">Check before relying on it</span>`) : ""}</div>`;
    }).join("");
    if (ags.length > 1) agHtml += `<p class="note">When more than one agreement applies, compare the rates and origin rules: the best one can differ product by product.</p>`;
  } else {
    agHtml = `<p>No agreement in force between ${fromName} and ${esc(destName)}. Your buyer pays ${esc(destName)}’s general (MFN) rate, and no preferential proof of origin applies.</p>`;
  }
  if (pend.length) agHtml += pend.map((a) => `<p class="note"><b>${esc(a.id)}:</b> ${esc(a.status)}.</p>`).join("");
  if (zero) agHtml = `<p class="note">${esc(zero)}</p>` + agHtml;
  out.push(`<section><h3>Agreements and proof of origin <span>${ags.length}</span></h3>${agHtml}
    <p class="note">The goods must also meet the agreement’s product-specific rule of origin for this HS code. Your buyer claims the lower rate; you supply the proof.</p></section>`);

  // 4. permits and controls
  const ctl = R.controls[from];
  const ch = sel ? sel.digits.slice(0, 2) : null;
  const flags = [];
  for (const sp of R.special) {
    if (sel && sp.from === from && sel.digits.startsWith(sp.prefix)) {
      flags.push(`<div class="flag"><b>${esc(sp.title)}:</b> ${esc(sp.text)} <a href="${sp.link}" target="_blank" rel="noopener">More ↗</a></div>`);
    }
  }
  if (ch && R.agriChapters.includes(ch)) flags.push(`<div class="flag"><b>${esc(ctl.agri.title)}:</b> ${esc(ctl.agri.text)} <a href="${ctl.agri.link}" target="_blank" rel="noopener">More ↗</a></div>`);
  if (ch && R.strategicChapters.includes(ch)) flags.push(`<div class="flag"><b>${esc(ctl.strategic.title)}:</b> ${ch === "93" ? "Arms and ammunition are controlled." : "Some goods in this chapter are controlled."} ${esc(ctl.strategic.text)} <a href="${ctl.strategic.link}" target="_blank" rel="noopener">More ↗</a></div>`);
  if (R.sanctioned.includes(dest)) flags.push(`<div class="flag"><b>${esc(ctl.sanctions.title)}:</b> UN, Australian or NZ sanctions cover ${esc(destName)}. ${esc(ctl.sanctions.text)} <a href="${ctl.sanctions.link}" target="_blank" rel="noopener">More ↗</a></div>`);
  out.push(`<section><h3>Permits and controls</h3>
    ${flags.length ? flags.join("") : `<p class="note">Nothing flagged for this chapter and destination. Some goods still need a permit:</p>`}
    <ul class="plain">${ctl.general.map((g) => `<li>${esc(g)}</li>`).join("")}</ul></section>`);
  return out.join("");
}

function wire() {
  $("#q").value = state.q;
  let t;
  $("#q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; renderTariff(); }, 120); });
  $$(".seg button[data-mkt]").forEach((b) => b.addEventListener("click", () => {
    state.market = b.dataset.mkt;
    $$(".seg button[data-mkt]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    renderTariff();
  }));
  $$(".seg button[data-from]").forEach((b) => b.addEventListener("click", () => {
    state.ex.from = b.dataset.from;
    state.ex.sel = null;
    $$(".seg button[data-from]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    if (state.ex.dest === state.ex.from) { state.ex.dest = b.dataset.from === "AU" ? "NZ" : "AU"; $("#ex-dest").value = state.ex.dest; }
    renderExport();
  }));
  $("#ex-dest").addEventListener("change", (e) => { state.ex.dest = e.target.value; renderExport(); });
  let te;
  $("#ex-q").addEventListener("input", (e) => { clearTimeout(te); te = setTimeout(() => { state.ex.q = e.target.value; state.ex.sel = null; renderExport(); }, 120); });
  $("#ex-results").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]");
    if (!b) return;
    state.ex.sel = b.dataset.pick;
    renderExport();
    if (window.matchMedia("(max-width: 880px)").matches) $("#ex-check").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#origin").addEventListener("change", (e) => { state.origin = e.target.value; renderTariff(); });
  $$(".chip[data-q]").forEach((c) => c.addEventListener("click", () => { state.q = c.dataset.q; $("#q").value = state.q; renderTariff(); }));
  $("#fta-country").addEventListener("change", (e) => { store.set("tt.fta", e.target.value); renderFta(); });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-rule]");
    if (!b) return;
    state.rule = b.dataset.rule;
    store.set("tt.rule", state.rule);
    renderRule();
    if (b.closest("#p-answer")) $("#rule-card").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  ["#p-mode", "#p-freight", "#p-risk", "#p-extra"].forEach((s) => $(s).addEventListener("change", pickerOptions));
}

async function boot() {
  route();
  const saved = store.get("tt.rule");
  if (saved && RULES.some((r) => r.code === saved)) state.rule = saved;
  renderRuleButtons();
  renderRule();
  wire();
  pickerOptions();
  bootOrigin();
  bootNews();
  try {
    const [au, nz, fta, auEx, rules] = await Promise.all(["data/au_tariff.json", "data/nz_tariff.json", "data/ftas.json", "data/au_export.json", "data/export_rules.json"]
      .map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); })));
    state.data = prepare(au, nz, fta);
    // Australian FTA schedules: optional, so the tariff still works if this file is missing.
    state.data.auFta = await fetch("data/au_fta.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    state.data.auExport = auEx.items.map((it) => ({
      mkt: "AU", digits: it.code, code: `${it.code.slice(0, 4)}.${it.code.slice(4, 6)}.${it.code.slice(6, 8)}`, stat: "",
      unit: it.unit, desc: cap(it.desc), path: it.path ? it.path.split(" › ").map(cap).join(" › ") : "", notes: it.notes || [],
      hay: (it.path + " " + it.desc).toLowerCase(),
    }));
    state.data.rules = rules;
    fillCountrySelects(fta);
    tariffFoot();
    renderTariff();
    renderFta();
    if (location.hash === "#fta") loadFtaMap();
    renderExport();
  } catch (err) {
    $("#tariff-results").innerHTML = `<div class="empty">The tariff data didn’t load (${esc(err.message)}). Reload the page to try again.</div>`;
    $("#fta-results").innerHTML = `<div class="panel empty">The agreement data didn’t load. Reload the page to try again.</div>`;
  }
}
boot();
