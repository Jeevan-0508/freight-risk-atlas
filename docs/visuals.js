'use strict';

const CAT_COLOUR = {
  identity: '#38bdf8', contractual: '#a78bfa', cargo_loss: '#f87171',
  documentary: '#fbbf24', digital: '#34d399', insider: '#fb923c',
  financial: '#f472b6', regulatory: '#94a3b8'
};
const SEV_COLOUR = { low: '#4ade80', medium: '#fbbf24', high: '#fb923c', critical: '#f87171' };

const V = (() => {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const tc = s => String(s).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  let tip;

  function showTip(html, x, y) {
    if (!tip) { tip = document.createElement('div'); tip.id = 'tip'; document.body.appendChild(tip); }
    tip.innerHTML = html;
    tip.style.display = 'block';
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(x + 14, innerWidth - r.width - 8)) + 'px';
    tip.style.top = Math.max(8, Math.min(y + 14, innerHeight - r.height - 8)) + 'px';
  }
  const hideTip = () => { if (tip) tip.style.display = 'none'; };

  /* ---------- detection timeline ---------- */

  function timeline(model, phases) {
    const rows = phases.map(ph => {
      const inds = [];
      model.patterns.forEach(p => p.indicators.forEach(i => {
        if (i.phase === ph.id) inds.push({ i, p });
      }));
      const byCat = {};
      inds.forEach(({ i, p }) => { byCat[p.category] = (byCat[p.category] || 0) + i.weight; });
      return { ph, inds, byCat, weight: inds.reduce((n, x) => n + x.i.weight, 0) };
    });
    const grand = rows.reduce((n, r) => n + r.weight, 0);
    const maxW = Math.max(...rows.map(r => r.weight));

    const html = rows.map(r => {
      const segs = Object.entries(r.byCat).sort((a, b) => b[1] - a[1]).map(([c, w]) =>
        `<span data-cat="${esc(c)}" style="width:${w / r.weight * 100}%;background:${CAT_COLOUR[c] || '#64748b'}"></span>`).join('');
      const dots = r.inds.sort((a, b) => b.i.weight - a.i.weight).map(({ i, p }) => {
        const s = 5 + i.weight * 2;
        return `<b data-sig="${esc(i.signal)}" data-src="${esc(i.observable_in)}" data-pat="${esc(p.id + ' ' + p.name)}"` +
          ` data-w="${i.weight}" style="width:${s}px;height:${s}px;background:${CAT_COLOUR[p.category] || '#64748b'}"></b>`;
      }).join('');
      return `<div class="row"><div class="top"><b>${esc(r.ph.label)}</b>` +
        `<span>${esc(r.ph.hint)} · ${r.inds.length} indicators</span>` +
        `<i>${r.weight} (${Math.round(r.weight / grand * 100)}%)</i></div>` +
        `<div class="stack" style="width:${r.weight / maxW * 100}%">${segs}</div>` +
        `<div class="dots">${dots}</div></div>`;
    }).join('');

    const cats = [...new Set(model.patterns.map(p => p.category))].sort();
    const legend = `<div class="legend">` + cats.map(c =>
      `<span><i style="background:${CAT_COLOUR[c] || '#64748b'}"></i>${esc(tc(c))}</span>`).join('') + `</div>`;

    const late = rows[rows.length - 1];
    const early = rows[0];
    const insight = `<p class="insight"><b>${Math.round(late.weight / grand * 100)}% of all detection weight sits after the loss.</b>
      Only ${Math.round(early.weight / grand * 100)}% is available before the load is awarded, which is the one stage where
      a loss can still be prevented rather than explained. Bar length is total indicator weight; segments are fraud categories.</p>`;

    return { html: html + legend + insight, rows, grand };
  }

  function bindTimeline(root) {
    root.addEventListener('mouseover', e => {
      const b = e.target.closest('.dots b');
      if (b) return showTip(`${esc(b.dataset.sig)}<span>Weight ${esc(b.dataset.w)} · ${esc(b.dataset.pat)}</span>` +
        `<span>Observable in: ${esc(b.dataset.src)}</span>`, e.clientX, e.clientY);
      const s = e.target.closest('.stack span');
      if (s) return showTip(`${esc(tc(s.dataset.cat))}<span>Share of this stage's indicator weight</span>`, e.clientX, e.clientY);
    });
    root.addEventListener('mouseout', hideTip);
    root.addEventListener('mousemove', e => {
      if (tip && tip.style.display === 'block') {
        const t = e.target.closest('.dots b, .stack span');
        if (t) showTip(tip.innerHTML, e.clientX, e.clientY); else hideTip();
      }
    });
  }

  /* ---------- pattern network ---------- */

  function layout(nodes, edges, W, H) {
    // deterministic seeded start so the picture is identical on every load
    let seed = 20260906;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    nodes.forEach((n, k) => {
      const a = k / nodes.length * Math.PI * 2;
      n.x = W / 2 + Math.cos(a) * W * 0.3 + (rnd() - 0.5) * 20;
      n.y = H / 2 + Math.sin(a) * H * 0.3 + (rnd() - 0.5) * 20;
      n.vx = n.vy = 0;
    });
    const idx = new Map(nodes.map(n => [n.id, n]));
    const links = edges.map(([a, b]) => [idx.get(a), idx.get(b)]).filter(([a, b]) => a && b);

    for (let step = 0; step < 400; step++) {
      const cool = 1 - step / 400;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d2 = dx * dx + dy * dy || 0.01;
          const min = a.r + b.r + 16;
          const f = 42000 / d2;
          const d = Math.sqrt(d2);
          const ux = dx / d, uy = dy / d;
          a.vx -= ux * f; a.vy -= uy * f; b.vx += ux * f; b.vy += uy * f;
          if (d < min) { const push = (min - d) * 0.5; a.vx -= ux * push; a.vy -= uy * push; b.vx += ux * push; b.vy += uy * push; }
        }
      }
      links.forEach(([a, b]) => {
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - 132) * 0.045;
        const ux = dx / d, uy = dy / d;
        a.vx += ux * f * d * 0.02; a.vy += uy * f * d * 0.02;
        b.vx -= ux * f * d * 0.02; b.vy -= uy * f * d * 0.02;
      });
      nodes.forEach(n => {
        n.vx += (W / 2 - n.x) * 0.012; n.vy += (H / 2 - n.y) * 0.012;
        n.x += n.vx * 0.5 * cool; n.y += n.vy * 0.5 * cool;
        n.vx *= 0.82; n.vy *= 0.82;
        n.x = Math.max(n.r + 4, Math.min(W - n.r - 4, n.x));
        n.y = Math.max(n.r + 14, Math.min(H - n.r - 4, n.y));
      });
    }
    return links;
  }

  let graph = null;

  function buildGraph(model) {
    const W = 560, H = 430;
    const nodes = model.patterns.map(p => ({
      id: p.id, p, r: 12 + p.indicators.length * 1.5
    }));
    const seen = new Set(), edges = [];
    model.patterns.forEach(p => (p.related || []).forEach(r => {
      const k = [p.id, r].sort().join('|');
      if (!seen.has(k)) { seen.add(k); edges.push([p.id, r]); }
    }));
    // laid out once so the picture never jumps as the assessment changes
    const links = layout(nodes, edges, W, H);
    return { W, H, nodes, links };
  }

  function network(model, coverage) {
    if (!graph) graph = buildGraph(model);
    const { W, H, nodes, links } = graph;

    const lines = links.map(([a, b]) =>
      `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"></line>`).join('');
    const circles = nodes.map(n => {
      const cov = coverage.get(n.id) || 0;
      const ring = cov > 0
        ? `<circle class="ring" cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${(n.r + 5).toFixed(1)}" stroke-opacity="${(0.3 + cov * 0.7).toFixed(2)}"></circle>`
        : '';
      return ring +
        `<circle class="node" data-id="${esc(n.id)}" cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r.toFixed(1)}"` +
        ` fill="${SEV_COLOUR[n.p.severity] || '#64748b'}" fill-opacity="0.3" stroke="${SEV_COLOUR[n.p.severity] || '#64748b'}"` +
        ` data-name="${esc(n.p.name)}" data-cat="${esc(n.p.category)}" data-sev="${esc(n.p.severity)}"` +
        ` data-inds="${n.p.indicators.length}" data-links="${(n.p.related || []).length}" data-cov="${Math.round(cov * 100)}"></circle>` +
        `<text x="${n.x.toFixed(1)}" y="${(n.y + 3.5).toFixed(1)}">${esc(n.id.replace('FFT-', ''))}</text>`;
    }).join('');

    const sevs = ['medium', 'high', 'critical'];
    const legend = `<div class="legend">` + sevs.map(s =>
      `<span><i style="background:${SEV_COLOUR[s]}"></i>${esc(tc(s))} severity</span>`).join('') +
      `<span><i style="background:transparent;border:2px solid var(--accent)"></i>Has evidence in your assessment</span></div>`;

    return `<svg class="net" viewBox="0 0 ${W} ${H}" role="img" aria-label="Network of the 12 fraud patterns, linked where they share an investigative relationship">` +
      `<g>${lines}</g><g>${circles}</g></svg>` + legend;
  }

  function bindNetwork(root, onSelect) {
    root.addEventListener('mouseover', e => {
      const c = e.target.closest('circle.node');
      if (!c) return;
      const d = c.dataset;
      showTip(`${esc(d.id)} ${esc(d.name)}<span>${esc(tc(d.cat))} · ${esc(d.sev)} severity</span>` +
        `<span>${esc(d.inds)} indicators · ${esc(d.links)} related patterns</span>` +
        (d.cov > 0 ? `<span>Coverage in your assessment: ${esc(d.cov)}%</span>` : '<span>No evidence recorded yet</span>'),
        e.clientX, e.clientY);
    });
    root.addEventListener('mouseout', hideTip);
    root.addEventListener('click', e => {
      const c = e.target.closest('circle.node');
      if (c) { hideTip(); onSelect(c.dataset.id); }
    });
  }

  return { timeline, network, bindTimeline, bindNetwork, hideTip };
})();
