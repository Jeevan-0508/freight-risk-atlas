'use strict';

const PHASES = [
  { id: 'pre_award',  label: 'Pre-award',  hint: 'onboarding and tendering, before the load moves' },
  { id: 'in_transit', label: 'In transit', hint: 'from pickup to delivery' },
  { id: 'post_event', label: 'Post-event', hint: 'after a loss, claim or dispute' }
];
const BANDS = [
  { min: 0.60, key: 'strong',      label: 'Strong support' },
  { min: 0.35, key: 'substantial', label: 'Substantial support' },
  { min: 0.15, key: 'weak',        label: 'Weak support' },
  { min: 0,    key: 'none',        label: 'No support' }
];
const EXAMPLE = {
  geo: 'EU',
  modes: ['road'],
  phases: ['pre_award', 'in_transit'],
  present: { 'FFT-001': [0, 1, 2, 3], 'FFT-002': [0, 1], 'FFT-012': [1, 2] },
  absent:  { 'FFT-001': [4], 'FFT-002': [2, 3, 5, 6], 'FFT-012': [0, 3] }
};

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = id => document.getElementById(id);
const phaseLabel = id => (PHASES.find(p => p.id === id) || { label: id }).label;
const titleCase = s => String(s).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

let MODEL = null;
let state = { geo: 'EU', modes: new Set(['road']), phases: new Set(PHASES.map(p => p.id)) };
let obs = new Map();   // "FFT-001#3" -> 'p' | 'a'
let gates = new Set(); // "FFT-001#2" false-positive checks ruled out
let open = new Set();

function fail(msg) {
  const e = $('err');
  e.textContent = msg;
  e.style.display = 'block';
}

function bandFor(cov) {
  return BANDS.find(b => cov >= b.min) || BANDS[BANDS.length - 1];
}

function geographies() {
  const g = new Set();
  MODEL.patterns.forEach(p => (p.geography || []).forEach(x => g.add(x)));
  g.delete('Global');
  return [...g].sort();
}
function modes() {
  const m = new Set();
  MODEL.patterns.forEach(p => (p.modes || []).forEach(x => m.add(x)));
  return [...m].sort();
}

function inScopePatterns() {
  return MODEL.patterns.filter(p => {
    const geo = p.geography || [];
    if (!geo.includes(state.geo) && !geo.includes('Global')) return false;
    return (p.modes || []).some(m => state.modes.has(m));
  });
}

function scoreOf(p) {
  let total = 0, present = 0, assessed = 0;
  const matched = [], gaps = [];
  p.indicators.forEach((ind, i) => {
    if (!state.phases.has(ind.phase)) return;
    total += ind.weight;
    const v = obs.get(p.id + '#' + i);
    if (v === 'p') { present += ind.weight; assessed += ind.weight; matched.push({ ind, i }); }
    else if (v === 'a') { assessed += ind.weight; }
    else { gaps.push({ ind, i }); }
  });
  const coverage = total ? present / total : 0;
  return {
    total, present, coverage, matched, gaps,
    completeness: total ? assessed / total : 0,
    band: bandFor(total ? coverage : -1)
  };
}

/* ---------- step 1: scope ---------- */

function renderScope() {
  const btn = (val, label, pressed, group, extra) =>
    `<button class="opt" data-group="${group}" data-val="${esc(val)}" aria-pressed="${pressed}"` +
    (extra ? ` title="${esc(extra)}"` : '') + `>${esc(label)}</button>`;

  $('opt-geo').innerHTML = geographies()
    .map(g => btn(g, g, state.geo === g, 'geo')).join('');
  $('opt-mode').innerHTML = modes()
    .map(m => btn(m, titleCase(m), state.modes.has(m), 'mode')).join('');
  $('opt-phase').innerHTML = PHASES
    .map(p => btn(p.id, p.label, state.phases.has(p.id), 'phase', p.hint)).join('');

  const pats = inScopePatterns();
  const inds = pats.reduce((n, p) => n + p.indicators.filter(i => state.phases.has(i.phase)).length, 0);
  $('scope').innerHTML = `<b>${pats.length}</b> of ${MODEL.patterns.length} patterns in scope · <b>${inds}</b> indicators to consider`;
}

function onOpt(e) {
  const b = e.target.closest('button.opt');
  if (!b) return;
  const { group, val } = b.dataset;
  if (group === 'geo') state.geo = val;
  else {
    const set = group === 'mode' ? state.modes : state.phases;
    if (set.has(val)) { if (set.size > 1) set.delete(val); } else set.add(val);
  }
  renderAll();
}

/* ---------- step 2: observations ---------- */

function renderObs() {
  const pats = inScopePatterns();
  let html = '', count = 0;

  PHASES.forEach(ph => {
    if (!state.phases.has(ph.id)) return;
    const rows = [];
    pats.forEach(p => p.indicators.forEach((ind, i) => {
      if (ind.phase !== ph.id) return;
      const key = p.id + '#' + i;
      const v = obs.get(key) || 'u';
      rows.push(
        `<div class="ind ${v === 'p' ? 'on' : v === 'a' ? 'off' : ''}">` +
          `<div><div class="sig">${esc(ind.signal)}</div>` +
          `<div class="meta"><b>Observable in:</b> ${esc(ind.observable_in)} · ` +
          `<b>${esc(p.id)}</b> ${esc(p.name)} · weight <span class="w w${ind.weight}">${ind.weight}</span></div></div>` +
          `<div class="tri" data-key="${key}">` +
            `<button class="p" data-v="p" aria-pressed="${v === 'p'}">Present</button>` +
            `<button class="a" data-v="a" aria-pressed="${v === 'a'}">Absent</button>` +
            `<button class="u" data-v="u" aria-pressed="${v === 'u'}">Unknown</button>` +
          `</div></div>`
      );
    }));
    count += rows.length;
    if (rows.length) html += `<h3>${esc(ph.label)} &mdash; ${esc(ph.hint)} (${rows.length})</h3>` + rows.join('');
  });

  $('obs').innerHTML = html || `<p class="empty">No indicators are observable in the current scope. Widen the geography, mode or stage.</p>`;
  const marked = [...obs.keys()].length;
  $('obs-count').textContent = count ? `${marked} of ${count} recorded` : '';
}

function onTri(e) {
  const b = e.target.closest('.tri button');
  if (!b) return;
  const key = b.parentElement.dataset.key;
  if (b.dataset.v === 'u') obs.delete(key); else obs.set(key, b.dataset.v);
  renderObs();
  renderResults();
}

/* ---------- step 3: findings ---------- */

function renderResults() {
  const scored = inScopePatterns()
    .map(p => ({ p, s: scoreOf(p) }))
    .filter(x => x.s.total > 0)
    .sort((a, b) => b.s.coverage - a.s.coverage || b.s.present - a.s.present || a.p.id.localeCompare(b.p.id));

  const supported = scored.filter(x => x.s.present > 0).length;
  $('find-count').textContent = scored.length
    ? `${supported} of ${scored.length} in-scope patterns have supporting evidence`
    : '';

  if (!scored.length) {
    $('results').innerHTML = `<p class="empty">Nothing to assess in the current scope.</p>`;
    return;
  }

  $('results').innerHTML = scored.map(({ p, s }) => {
    const pct = Math.round(s.coverage * 100);
    const col = `var(--${p.severity})`;
    const head =
      `<div class="rh" data-id="${esc(p.id)}">` +
        `<span class="id">${esc(p.id)}</span>` +
        `<span class="rn"><b>${esc(p.name)}</b>` +
        `<span>${esc(titleCase(p.category))} · severity ${esc(p.severity)} · prevalence ${esc(p.prevalence)}</span></span>` +
        `<span class="band ${s.band.key}">${esc(s.band.label)}</span>` +
        `<span class="gauge"><span class="track"><span class="fill" style="width:${pct}%;background:${col}"></span></span>` +
        `<span class="lbl"><span>coverage</span><b>${pct}%</b></span>` +
        `<span class="lbl"><span>evidence complete</span><b>${Math.round(s.completeness * 100)}%</b></span></span>` +
      `</div>`;

    const matched = s.matched.length
      ? `<table><thead><tr><th>Confirmed indicator</th><th>Weight</th><th>Observable in</th></tr></thead><tbody>` +
        s.matched.map(({ ind }) =>
          `<tr><td class="sig">${esc(ind.signal)}<div class="ph">${esc(phaseLabel(ind.phase))}</div></td>` +
          `<td><span class="w w${ind.weight}">${ind.weight}</span></td>` +
          `<td>${esc(ind.observable_in)}</td></tr>`).join('') +
        `</tbody></table>`
      : `<p class="empty">No indicators confirmed present for this pattern in the current scope.</p>`;

    const gaps = s.gaps.length
      ? `<h3>Evidence gaps &mdash; unresolved, weighted ${s.gaps.reduce((n, g) => n + g.ind.weight, 0)} of ${s.total}</h3>` +
        `<ul class="hooks">` + s.gaps.map(({ ind }) =>
          `<li><b>${esc(ind.observable_in)}</b> &mdash; ${esc(ind.signal)}</li>`).join('') + `</ul>`
      : '';

    const fps = (p.false_positives || []).map((fp, i) => {
      const key = p.id + '#' + i;
      return `<div class="gate"><label><input type="checkbox" data-gate="${key}"${gates.has(key) ? ' checked' : ''}>` +
        `<span><b>${esc(fp.looks_like)}</b>` +
        `<div>Benign explanation: ${esc(fp.actually)}</div>` +
        `<div>Rule it out by: ${esc(fp.how_to_rule_out)}</div></span></label></div>`;
    }).join('');

    const cmKeys = { pre_award: 'preventive', in_transit: 'detective', post_event: 'responsive' };
    const shown = [...state.phases].map(ph => cmKeys[ph]).filter(Boolean);
    const cm = `<div class="cm">` + ['preventive', 'detective', 'responsive']
      .filter(k => shown.includes(k) && (p.countermeasures[k] || []).length)
      .map(k => `<section><h4>${esc(titleCase(k))}</h4><ul>` +
        p.countermeasures[k].map(c => `<li>${esc(c)}</li>`).join('') + `</ul></section>`).join('') + `</div>`;

    const hooks = (p.regulatory_hooks || []).length
      ? `<h3>Regulatory duties engaged</h3><ul class="hooks">` + p.regulatory_hooks.map(h =>
          `<li><b>${esc(h.instrument)}</b> ${esc(h.provision)} &mdash; ${esc(h.relevance)}</li>`).join('') + `</ul>`
      : '';

    const refs = (p.references || []).length
      ? `<h3>Sources</h3><ul class="refs">` + p.references.map(r =>
          `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a> &mdash; ${esc(r.publisher)}</li>`).join('') + `</ul>`
      : '';

    return `<article class="res${open.has(p.id) ? ' open' : ''}">${head}<div class="rb">` +
      `<h3>What this pattern is</h3><p style="color:var(--dim);font-size:13.5px;margin:0">${esc(p.summary)}</p>` +
      `<h3>Confirmed indicators</h3>${matched}${gaps}` +
      (fps ? `<h3>Rule these out before you act</h3>${fps}` : '') +
      `<h3>Countermeasures for the selected stages</h3>${cm}${hooks}${refs}` +
      `</div></article>`;
  }).join('');
}

function onResultClick(e) {
  if (e.target.matches('input[data-gate]')) {
    const k = e.target.dataset.gate;
    if (e.target.checked) gates.add(k); else gates.delete(k);
    return;
  }
  const h = e.target.closest('.rh');
  if (!h) return;
  const id = h.dataset.id;
  if (open.has(id)) open.delete(id); else open.add(id);
  h.parentElement.classList.toggle('open');
}

/* ---------- export ---------- */

function assessment() {
  return inScopePatterns().map(p => {
    const s = scoreOf(p);
    if (!s.total) return null;
    return {
      id: p.id, name: p.name, category: p.category, severity: p.severity,
      coverage: Math.round(s.coverage * 100),
      evidence_completeness: Math.round(s.completeness * 100),
      support: s.band.label,
      confirmed_indicators: s.matched.map(({ ind }) => ({ signal: ind.signal, weight: ind.weight, observable_in: ind.observable_in, phase: ind.phase })),
      evidence_gaps: s.gaps.map(({ ind }) => ({ signal: ind.signal, weight: ind.weight, observable_in: ind.observable_in })),
      false_positives_cleared: (p.false_positives || []).map((fp, i) => ({ looks_like: fp.looks_like, cleared: gates.has(p.id + '#' + i) })),
      regulatory_hooks: (p.regulatory_hooks || []).map(h => `${h.instrument} ${h.provision}`)
    };
  }).filter(Boolean).sort((a, b) => b.coverage - a.coverage || a.id.localeCompare(b.id));
}

function payload() {
  return {
    generated: new Date().toISOString(),
    tool: 'Freight Risk Atlas',
    risk_model: { taxonomy: MODEL.meta.taxonomy, version: MODEL.meta.version },
    scope: { geography: state.geo, modes: [...state.modes], stages: [...state.phases] },
    method: 'Coverage is the share of a pattern\'s in-scope indicator weight confirmed present. It is not a probability of fraud.',
    findings: assessment()
  };
}

function markdown() {
  const d = payload();
  const L = [];
  L.push('# Freight fraud risk assessment', '');
  L.push(`Generated: ${d.generated}`);
  L.push(`Risk model: ${d.risk_model.taxonomy} v${d.risk_model.version}`);
  L.push(`Scope: ${d.scope.geography} · ${d.scope.modes.join(', ')} · ${d.scope.stages.map(phaseLabel).join(', ')}`, '');
  L.push(`> ${d.method}`, '');
  L.push('## Summary', '', '| Pattern | Support | Coverage | Evidence complete |', '| --- | --- | --- | --- |');
  d.findings.forEach(f => L.push(`| ${f.id} ${f.name} | ${f.support} | ${f.coverage}% | ${f.evidence_completeness}% |`));
  L.push('');
  d.findings.filter(f => f.confirmed_indicators.length).forEach(f => {
    L.push(`## ${f.id} — ${f.name}`, '');
    L.push(`${f.support} · coverage ${f.coverage}% · evidence completeness ${f.evidence_completeness}% · severity ${f.severity}`, '');
    L.push('### Confirmed indicators', '');
    f.confirmed_indicators.forEach(i => L.push(`- (w${i.weight}, ${phaseLabel(i.phase)}) ${i.signal}  \n  _Source: ${i.observable_in}_`));
    if (f.evidence_gaps.length) {
      L.push('', '### Evidence gaps', '');
      f.evidence_gaps.forEach(i => L.push(`- (w${i.weight}) ${i.signal} — check: ${i.observable_in}`));
    }
    L.push('', '### False positives to rule out', '');
    f.false_positives_cleared.forEach(fp => L.push(`- [${fp.cleared ? 'x' : ' '}] ${fp.looks_like}`));
    if (f.regulatory_hooks.length) L.push('', '### Regulatory duties engaged', '', ...f.regulatory_hooks.map(h => `- ${h}`));
    L.push('');
  });
  L.push('---', '', 'Produced with Freight Risk Atlas (github.com/Jeevan-0508/freight-risk-atlas).',
    'Indicator weights and countermeasures from the Freight & Carrier Fraud Risk Taxonomy (CC BY 4.0).',
    'Not legal advice.');
  return L.join('\n');
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- example / reset ---------- */

function loadExample() {
  state.geo = EXAMPLE.geo;
  state.modes = new Set(EXAMPLE.modes);
  state.phases = new Set(EXAMPLE.phases);
  obs = new Map();
  gates = new Set();
  const byId = new Map(MODEL.patterns.map(p => [p.id, p]));
  for (const [v, map] of [['p', EXAMPLE.present], ['a', EXAMPLE.absent]]) {
    Object.entries(map).forEach(([pid, idxs]) => {
      const p = byId.get(pid);
      if (!p) return;
      idxs.forEach(i => { if (p.indicators[i] && state.phases.has(p.indicators[i].phase)) obs.set(pid + '#' + i, v); });
    });
  }
  open = new Set(['FFT-001']);
  renderAll();
  $('step3').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function reset() {
  state = { geo: 'EU', modes: new Set(['road']), phases: new Set(PHASES.map(p => p.id)) };
  obs = new Map();
  gates = new Set();
  open = new Set();
  renderAll();
}

function coverageMap() {
  const m = new Map();
  inScopePatterns().forEach(p => {
    const s = scoreOf(p);
    if (s.total && s.present) m.set(p.id, s.coverage);
  });
  return m;
}

function renderVisuals() {
  const tlHost = $('viz-timeline');
  if (!tlHost.childElementCount) tlHost.innerHTML = V.timeline(MODEL, PHASES).html;
  $('viz-network').innerHTML = V.network(MODEL, coverageMap());
}

function renderAll() { renderScope(); renderObs(); renderResults(); renderVisuals(); }

/* ---------- boot ---------- */

fetch('taxonomy.json', { cache: 'no-cache' })
  .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(d => {
    if (!d || !Array.isArray(d.patterns) || !d.patterns.length) throw new Error('risk model is empty');
    MODEL = d;
    $('src').innerHTML = `Risk model: <b>${esc(d.meta.taxonomy)}</b> v${esc(d.meta.version)} · ` +
      `${d.meta.pattern_count} patterns · ${d.meta.indicator_count} indicators · ` +
      `${d.meta.countermeasure_count} countermeasures`;
    $('opt-geo').addEventListener('click', onOpt);
    $('opt-mode').addEventListener('click', onOpt);
    $('opt-phase').addEventListener('click', onOpt);
    $('obs').addEventListener('click', onTri);
    $('results').addEventListener('click', onResultClick);
    V.bindTimeline($('viz-timeline'));
    V.bindNetwork($('viz-network'), id => {
      open.add(id);
      renderResults();
      const c = [...document.querySelectorAll('.res')].find(x => x.querySelector('.id').textContent === id);
      if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    $('btn-example').addEventListener('click', loadExample);
    $('btn-reset').addEventListener('click', reset);
    $('btn-report').addEventListener('click', () => download('freight-risk-assessment.md', markdown(), 'text/markdown;charset=utf-8'));
    $('btn-json').addEventListener('click', () => download('freight-risk-assessment.json', JSON.stringify(payload(), null, 2), 'application/json'));
    renderAll();
  })
  .catch(e => fail('Could not load the risk model (taxonomy.json): ' + e.message +
    '. If you are opening this file directly from disk, serve the folder over HTTP instead.'));
