/* Card Recon UI */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n, sign) => (n < -0.004 ? '−' : (sign && n > 0.004 ? '+' : '')) + '$' + Math.abs(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const plain = n => (n < -0.004 ? '-' : '') + Math.abs(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const { cents } = Engine;
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch (e) { return d } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) { } } };
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

  /* ---------- icons ---------- */
  const I = (p, s = 20, w = 1.8) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ic = {
    mark: (s, id = 'm') => `<svg width="${s}" height="${s}" viewBox="96 96 320 320" aria-hidden="true"><defs><clipPath id="cl-${id}"><rect x="196" y="196" width="196" height="196" rx="44"/></clipPath></defs><rect x="120" y="120" width="196" height="196" rx="44" fill="none" stroke="#f4f5f0" stroke-width="28"/><rect x="196" y="196" width="196" height="196" rx="44" fill="none" stroke="#f4f5f0" stroke-opacity=".45" stroke-width="28"/><g clip-path="url(#cl-${id})"><rect x="120" y="120" width="196" height="196" rx="44" fill="#ffc861"/></g></svg>`,
    clock: s => I('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', s),
    sliders: s => I('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>', s),
    moon: s => I('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>', s),
    sun: s => I('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>', s),
    grid: s => I('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15"/>', s),
    doc: s => I('<path d="M7 3.5h7l4.5 4.5v12.5h-11.5z"/><path d="M14 3.5V8h4.5M9.5 13h6M9.5 16.5h4"/>', s),
    check: s => I('<path d="m5 12.5 4.5 4.5L19 7.5"/>', s, 2.2),
    alert: s => I('<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.1"/>', s),
    x: s => I('<path d="M6 6l12 12M18 6 6 18"/>', s),
    pos: s => I('<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><rect x="8.5" y="5" width="7" height="4.5" rx="1"/><path d="M9 13h.01M12 13h.01M15 13h.01M9 16h.01M12 16h.01M15 16h.01"/>', s, 2),
    page: s => I('<path d="M6.5 3.5h11v17h-11z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>', s),
    arrow: s => I('<path d="M5 12h14M13 6l6 6-6 6"/>', s),
    down: s => I('<path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/>', s),
    copy: s => I('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M5.5 15.5h-1v-11h11v1"/>', s),
    trash: s => I('<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>', s),
    party: s => I('<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.3 2.4 2.4 4.8-5"/>', s, 2),
  };
  $('#mark').innerHTML = ic.mark(26, 'hdr');
  $('#credit-mark').innerHTML = ic.mark(16, 'ft');
  $('#btn-history').innerHTML = ic.clock(20);
  $('#btn-settings').innerHTML = ic.sliders(20);
  $('#drawer-close').innerHTML = ic.x(20);
  const setThemeIcon = () => $('#btn-theme').innerHTML = document.documentElement.dataset.theme === 'light' ? ic.moon(19) : ic.sun(19);
  setThemeIcon();

  /* ---------- state ---------- */
  const S = { csv: [], pdf: { FO: null, 'F&B': null }, err: {}, res: null, sel: 'FO', tab: null, busy: {},
    opts: store.get('cr-opts', { basis: 'batch', batch: 'auto', dupOnce: true }), merch: store.get("cr-merch", {}), names: store.get("cr-terms", []), cashiers: store.get("cr-cashiers", {}) };

  function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2400); }

  /* ---------- terminal names (saved on this device only) ---------- */
  const dgt = s => String(s == null ? "" : s).replace(/\D/g, "");
  const tname = (r, t) => (r.termName && r.termName[t]) || "Terminal " + t;
  function importNames(text) {
    const add = Engine.parseTermSheet(text); if (!add.length) { toast("No terminals found in that file"); return 0; }
    // The sheet replaces the saved list: terminals not in it (no longer used) are removed.
    // Names typed in Settings for terminals that are still in the sheet are kept.
    const keep = id => S.names.find(n => n.custom && dgt(n.id) === dgt(id));
    // The sheet covers FO, so F&B names typed in Settings stay.
    const others = S.names.filter(n => n.custom && n.dept !== "FO" && !add.some(a => dgt(a.id) === dgt(n.id)));
    S.names = add.map(a => keep(a.id) || a).concat(others);
    store.set("cr-terms", S.names); toast(`${add.length} terminal names loaded`); return add.length;
  }

  /* ---------- files ---------- */
  async function addFiles(files, hint) {
    for (const f of files) {
      if (/\.csv$/i.test(f.name) || f.type === 'text/csv') {
        S.busy.csv = true; renderSlots();
        const text = await f.text();
        if (Engine.isTermSheet(text)) { S.busy.csv = false; importNames(text); continue; }
        try { const rows = Engine.parseCSV(text); S.csv = S.csv.filter(x => x.name !== f.name).concat({ name: f.name, rows }); delete S.err.csv; }
        catch (e) { S.err.csv = f.name + ': not a terminal export'; }
        S.busy.csv = false;
      } else if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
        const slot = hint || 'FO'; S.busy[slot] = true; renderSlots();
        try {
          const pl = await Engine.pdfLines(await f.arrayBuffer());
          const p = Engine.parseD140(pl.lines, pl.pages, f.name);
          S.pdf[p.dept] = { name: f.name, ...p }; delete S.err[p.dept];
          if (hint && hint !== p.dept) toast(`Moved to ${p.dept === 'FO' ? 'Front Office' : 'F&B'}: that's a ${p.dept} D140`);
        } catch (e) { S.err[slot] = f.name + ': no D140 postings found'; }
        S.busy[slot] = false;
      }
    }
    run();
  }
  function bindSlot(id, input, hint) {
    const el = $(id);
    ['dragenter', 'dragover'].forEach(e => el.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); el.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(e => el.addEventListener(e, ev => { ev.preventDefault(); el.classList.remove('over'); }));
    el.addEventListener('drop', ev => { ev.stopPropagation(); hideDrop(); addFiles([...ev.dataTransfer.files], hint); });
    $(input).addEventListener('change', ev => { addFiles([...ev.target.files], hint); ev.target.value = ''; });
  }
  bindSlot('#slot-csv', '#in-csv', null); bindSlot('#slot-FO', '#in-fo', 'FO'); bindSlot('#slot-FB', '#in-fb', 'F&B');
  let dropEl = null, dragDepth = 0;
  const hideDrop = () => { dragDepth = 0; dropEl?.remove(); dropEl = null; };
  window.addEventListener('dragenter', e => { if (![...e.dataTransfer.types].includes('Files')) return; dragDepth++; if (!dropEl) { dropEl = document.createElement('div'); dropEl.className = 'dropall'; dropEl.textContent = 'Drop to load'; document.body.appendChild(dropEl); } });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) hideDrop(); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => { e.preventDefault(); hideDrop(); addFiles([...e.dataTransfer.files]); });

  function renderSlots() {
    const set = (id, { filled, err, busy, sub, icon, file }) => {
      const el = $(id); el.classList.toggle('filled', !!filled); el.classList.toggle('err', !!err);
      el.querySelector('.ico').innerHTML = busy ? '<span class="busy"></span>' : err ? ic.alert(22) : filled ? ic.check(22) : icon;
      // File name on its own line, in the same style as the line below it.
      let fl = el.querySelector('.s.file');
      if (file && !fl) { fl = document.createElement('span'); fl.className = 's file'; el.querySelector('.t').after(fl); }
      if (fl) { fl.hidden = !file; fl.textContent = file || ''; fl.title = file || ''; }
      el.querySelector('.s:not(.file)').textContent = sub;
      let x = el.querySelector('.x');
      if (filled && !x) { x = document.createElement('button'); x.className = 'x'; x.type = 'button'; x.setAttribute('aria-label', 'Remove'); x.innerHTML = ic.x(16); el.appendChild(x);
        x.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); if (id === '#slot-csv') S.csv = []; else S.pdf[id === '#slot-FO' ? 'FO' : 'F&B'] = null; run(); }); }
      if (!filled && x) x.remove();
    };
    const rows = S.csv.reduce((a, f) => a + f.rows.length, 0);
    set('#slot-csv', { filled: S.csv.length, err: S.err.csv, busy: S.busy.csv, icon: ic.grid(22), file: !S.err.csv && S.csv.length ? S.csv.map(f => f.name).join(', ') : '', sub: S.err.csv || (S.csv.length ? `${rows} row${rows === 1 ? "" : "s"}` : "CSV") });
    for (const [d, id] of [['FO', '#slot-FO'], ['F&B', '#slot-FB']]) {
      const p = S.pdf[d];
      set(id, { filled: p, err: S.err[d] || (p && !p.grandOk), busy: S.busy[d], icon: ic.doc(22), file: !S.err[d] && p ? p.name : '',
        sub: S.err[d] || (p ? `${p.rows.length} postings · ${money(p.total)}${p.grandOk ? '' : ' · Grand Total differs'}` : 'PDF') });
    }
  }

  /* ---------- run ---------- */
  function mapping() { const m = {}; for (const v of Engine.merchants(S.csv, S.merch)) m[v.key] = v.dept; return m; }
  let printSeq = 0;
  function run() {
    renderSlots();
    const pdfs = Object.values(S.pdf).filter(Boolean);
    if (!S.csv.length || !pdfs.length) { S.res = null; renderAll(); return; }
    try { S.res = Engine.reconcile({ csvFiles: S.csv, pdfFiles: pdfs, merch: mapping(), names: S.names, cashiers: S.cashiers, ...S.opts }); }
    catch (e) { S.res = null; toast('Could not reconcile: ' + e.message); }
    // Show details for a department that has results (e.g. only the F&B D140 was loaded).
    if (S.res && (!S.res[S.sel] || S.res[S.sel].skip)) S.sel = ['FO', 'F&B'].find(d => S.res[d] && !S.res[d].skip) || S.sel;
    S.tab = null; printSeq++; renderAll(true); saveHistory();
  }

  /* ---------- receipts ---------- */
  // Variance colour: terminals more than Opera = orange (over), less = red (under), nil = green
  const vc = v => cents(v) === 0 ? "ok" : v > 0 ? "over" : "under";
  const deptName = d => d === 'FO' ? 'Front Office' : 'F&B';
  const fmtDate = (bd, o) => bd ? new Date(bd + 'T12:00:00').toLocaleDateString('en-NZ', o || { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
  function receipt(dept, r, print) {
    if (!r || r.skip) return `<div class="printer ghost"><div class="mouth"></div><div class="feed"><div class="receipt"><div class="c h1">${esc(deptName(dept).toUpperCase())}</div><div class="c h2">${r?.skip ? 'NO D140 LOADED' : 'WAITING'}</div><div class="rule"></div><div class="ln"><span>TERMINALS</span><span>—</span></div><div class="ln"><span>OPERA D140</span><span>—</span></div><div class="rule"></div><div class="ln big"><span>VARIANCE</span><span>—</span></div><div class="stampwrap"></div><div class="bar"></div></div></div></div>`;
    const nil = cents(r.variance) === 0, fix = r.ex.filter(e => e.kind !== 'dup' && e.kind !== 'missing').length;
    return `<div class="printer ${S.sel === dept ? 'sel' : ''}" data-dept="${esc(dept)}"><div class="mouth"></div><div class="feed"><div class="receipt ${print ? 'print' : ''}" role="button" tabindex="0" aria-label="${esc(deptName(dept))} details">
      <div class="c h1">${esc(deptName(dept).toUpperCase())}</div>
      <div class="c h2">${esc(fmtDate(r.bd).toUpperCase())}${r.tBatch ? '<br>BATCH ' + esc(r.tBatch) : ''}</div>
      <div class="rule"></div>
      <div class="ln"><span>TERMINALS</span><span>${plain(r.tTot)}</span></div>
      <div class="ln"><span>OPERA D140</span><span>${plain(r.dTot)}</span></div>
      <div class="rule"></div>
      <div class="ln big"><span>VARIANCE</span><span class="v-${vc(r.variance)}">${plain(r.variance)}</span></div>
      ${r.checkable !== null ? `<div class="ln"><span>CHECKABLE</span><span>${plain(r.checkable)}</span></div>` : ''}
      <div class="rule"></div>
      <div class="ln"><span>TO FIX</span><span>${fix}</span></div>
      <div class="ln"><span>CARD CODES</span><span>${r.wrong.length}</span></div>
      ${(r.crossIn || []).length + (r.crossOut || []).length ? `<div class="ln"><span>OTHER DEPT TERM.</span><span>${r.crossIn.length + r.crossOut.length}</span></div>` : ''}
      ${(r.checks || []).length ? `<div class="ln"><span>CHECK THESE</span><span>${r.checks.length}</span></div>` : ''}
      <div class="ln"><span>MATCHED</span><span>${r.matches.length}</span></div>
      <div class="stampwrap"><div class="stamp ${vc(r.variance)}">${nil ? 'BALANCED' + ((r.checks || []).length ? `<small>${r.checks.length} TO CHECK</small>` : '') : 'OUT<small>' + esc(money(r.variance, true)) + '</small>'}</div></div>
      <div class="bar"></div>
    </div></div></div>`;
  }
  function renderReceipts(print) {
    const box = $('#receipts');
    if (!S.res) {
      box.innerHTML = `<div class="empty-tray">
        <svg width="150" height="96" viewBox="0 0 150 96" fill="none" aria-hidden="true"><rect x="10" y="10" width="130" height="18" rx="9" stroke="currentColor" stroke-width="2"/><path d="M30 24v58l6-4 6 4 6-4 6 4 6-4 6 4V24" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M38 40h26M38 50h26M38 60h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M80 24v52l6-4 6 4 6-4 6 4 6-4 6 4V24" stroke="currentColor" stroke-width="2" stroke-linejoin="round" opacity=".55"/><path d="M88 40h26M88 50h26M88 60h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".55"/></svg>
        <b>Drop tonight's files</b><span>Terminal export and D140s</span></div>`;
      return;
    }
    box.innerHTML = ['FO', 'F&B'].map(d => receipt(d, S.res[d], print)).join('');
    box.querySelectorAll('.printer[data-dept]').forEach(p => {
      const go = () => { S.sel = p.dataset.dept; S.tab = null; renderReceipts(false); renderDetail(); $('#detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      p.querySelector('.receipt').addEventListener('click', go);
      p.querySelector('.receipt').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  }

  /* ---------- detail ---------- */
  const KIND = { terminal: 'Not in Opera', double: 'Double charge', opera: 'Not on terminal', declined: 'Declined on terminal', missing: 'Not in export', dup: 'Shown twice', tip: 'Tip not in Opera' };
  function fixCard(e) {
    const x = e.row, T = x.side === 'T', P = e.pair; // P: the Opera posting a tip charge matched
    const term = T ? `<div class="loc">${ic.pos(18)}<div><div class="k">${esc(x.tn || "Terminal " + x.term)}</div><div class="v">${esc(x.time)} · ${esc(x.type)} ••${esc(x.l4)} · RRN ${esc(x.rrn)}</div></div></div>` : `<div class="loc none">${ic.pos(18)}<div>No terminal transaction</div></div>`;
    const dx = T ? P : x;
    const d140 = dx ? `<div class="loc">${ic.page(18)}<div><div class="k">D140 page ${esc(dx.page)} · Room ${esc(dx.room)}${P ? ' · ' + esc(money(dx.amt)) : ''}</div><div class="v">${esc(dx.name)}${dx.receipt ? ' · #' + esc(dx.receipt) : ''}${dx.ref ? ' · check ' + esc(dx.ref) : ''} · ${esc(dx.code)} ${esc(Engine.codeType(dx.code))}${dx.by ? ' · by ' + esc(dx.by) : ''}</div></div></div>` : `<div class="loc none">${ic.page(18)}<div>Not in the D140</div></div>`;
    return `<article class="fix k-${e.kind}${e.kind === "dup" ? "" : " v-" + vc(e.effect)}"><div class="top"><span class="badge b-${e.kind}${e.kind === "dup" || !cents(e.effect) ? "" : " b-" + vc(e.effect)}">${esc(KIND[e.kind])}</span><div class="amt"><b class="num">${money(x.amt)}</b><small class="${e.kind === "dup" ? "" : "v-" + vc(e.effect)}">${e.kind === "dup" ? "counted once" : "variance " + money(e.effect, true)}</small></div></div>${term}${d140}<div class="hint">${esc(e.hint)}</div></article>`;
  }
  // A pair that balances only on amount: show both sides so a person can confirm it.
  function checkCard(m) {
    const amt = m.t.reduce((a, y) => a + y.amt, 0);
    const T = m.t.map(y => `<div class="loc">${ic.pos(18)}<div><div class="k">${esc(y.tn)} · ${esc(money(y.amt))}</div><div class="v">${esc(y.time)} · ${esc(y.type)} ••${esc(y.l4)} · RRN ${esc(y.rrn || '-')}</div></div></div>`).join('');
    const D = m.d.map(x => `<div class="loc">${ic.page(18)}<div><div class="k">D140 page ${esc(x.page)} · Room ${esc(x.room)} · ${esc(money(x.amt))}</div><div class="v">${esc(x.name)}${x.receipt ? ' · #' + esc(x.receipt) : ''} · ${esc(x.code)} ${esc(Engine.codeType(x.code))}${x.l4 ? ' ••' + esc(x.l4) : ''}${x.by ? ' · by ' + esc(x.by) : ''}</div></div></div>`).join('');
    return `<article class="fix k-check"><div class="top"><span class="badge b-check">Check</span><div class="amt"><b class="num">${money(amt)}</b><small>balances on amount</small></div></div>${T}${D}<div class="hint">${esc(m.why)}. Confirm it is the same guest and payment.</div></article>`;
  }
  function sheetTSV(r) {
    const types = sheetTypes(r);
    const head = ['Card type', 'Code', ...r.terms.map(t => tname(r, t)), "Terminals", "Opera", "Variance"];
    const rows = types.map(ty => { const o = r.sheet[ty]; return [ty, Engine.codeFor(r.dept, ty), ...r.terms.map(t => (o.t[t] || 0).toFixed(2)), o.tt.toFixed(2), o.op.toFixed(2), (o.tt - o.op).toFixed(2)]; });
    rows.push(['Total', '', ...r.terms.map(t => (r.termTot[t] || 0).toFixed(2)), r.tTot.toFixed(2), r.dTot.toFixed(2), r.variance.toFixed(2)]);
    return [head, ...rows].map(a => a.join('\t')).join('\n');
  }
  const sheetTypes = r => Object.keys(r.sheet).filter(ty => Engine.TYPES.includes(ty) || r.sheet[ty].tt || r.sheet[ty].op);
  function renderDetail() {
    const el = $('#detail'); const r = S.res && S.res[S.sel];
    if (!S.res || !r || r.skip) { el.hidden = true; return; }
    el.hidden = false;
    const fixes = r.ex.filter(e => e.kind !== 'dup' && e.kind !== 'missing');
    const checks = r.checks || [], otherNight = r.otherNight || [], nonCard = r.nonCard || [];
    const nFix = fixes.length + checks.length;
    const tabs = [['fix', 'To fix', nFix, nFix ? 'alert' : ''], ['codes', 'Card codes', r.wrong.length, ''], ['sheet', 'Recon sheet', null, ''], ['matched', 'Matched', r.matches.length, '']];
    if (!S.tab) S.tab = nFix || (r.crossIn || []).length || (r.crossOut || []).length || otherNight.length || nonCard.length ? 'fix' : r.wrong.length ? 'codes' : 'sheet';
    const types = sheetTypes(r).filter(ty => r.sheet[ty].tt || r.sheet[ty].op);
    const max = Math.max(1, ...types.map(ty => Math.max(Math.abs(r.sheet[ty].tt), Math.abs(r.sheet[ty].op))));
    const bars = types.map(ty => { const o = r.sheet[ty], v = o.tt - o.op;
      return `<div class="brow"><div class="lbl">${esc(ty)}<small>${esc(Engine.codeFor(r.dept, ty))}</small></div><div class="tracks"><div class="track"><i class="t" style="width:${Math.abs(o.tt) / max * 100}%"></i></div><div class="track"><i class="o" style="width:${Math.abs(o.op) / max * 100}%"></i></div></div>
      <div class="vals num"><b>${plain(o.tt)}</b><br>${plain(o.op)}${cents(v) ? `<br><span class="pill ${vc(v)}">${money(v, true)}</span>` : ''}</div></div>`; }).join('');
    const tmax = Math.max(1, ...r.terms.map(t => Math.abs(r.termTot[t] || 0)));
    const terms = r.terms.map(t => `<div class="term"><div class="id">${ic.pos(16)}${esc(tname(r, t))}</div><div class="org">${esc(r.termOrg[t])} · ${esc(t)}</div><div class="amt num">${money(r.termTot[t] || 0)}</div><div class="share"><i style="width:${Math.abs(r.termTot[t] || 0) / tmax * 100}%"></i></div></div>`).join('');

    let body = '';
    if (S.tab === 'fix') {
      const rest = r.ex.filter(e => e.kind === 'dup' || e.kind === 'missing');
      body = fixes.length ? `<div class="fixes">${fixes.map(fixCard).join('')}</div>` : checks.length ? '' : `<div class="nothing">${ic.party(40)}<b>Nothing to fix</b><span>Every posting matches a terminal transaction.</span></div>`;
      if (checks.length) body += `<h3 style="margin:${fixes.length ? 22 : 0}px 0 4px;font-size:15px">Check these (${checks.length})</h3><p style="margin:0 0 12px;color:var(--muted);font-size:13px">These balance only on amount. They may be fine, or two separate mistakes that cancel out. Look at both sides.</p><div class="fixes">${checks.map(checkCard).join('')}</div>`;
      if (rest.length) body += `<h3 style="margin:22px 0 12px;font-size:15px">Can't be checked with this export (${rest.length})</h3><div class="fixes">${rest.map(fixCard).join('')}</div>`;
      if (otherNight.length) body += `<h3 style="margin:22px 0 4px;font-size:15px">From another night, not counted (${otherNight.length})</h3><p style="margin:0 0 12px;color:var(--muted);font-size:13px">Completions in this export from a different batch that match nothing in tonight's D140.</p><div class="list">${otherNight.map(y => `<div class="lrow"><span class="g">${esc(y.type)} ••${esc(y.l4)}</span><span class="m room">Batch ${esc(y.batch || '')}</span><span class="m pg">${esc(y.date || '')}</span><span class="m rc">${esc(y.time)}</span><span class="amtc num">${money(y.amt)}</span><span class="move"><span class="chip to">${esc(y.tn)}</span></span></div>`).join('')}</div>`;
      if (nonCard.length) body += `<h3 style="margin:22px 0 4px;font-size:15px">Not card payments, not checked (${nonCard.length})</h3><div class="list">${nonCard.map(x => `<div class="lrow"><span class="g">${esc(x.name)}${x.by ? " · by " + esc(x.by) : ""}</span><span class="m room">Rm ${esc(x.room)}</span><span class="m pg">p.${esc(x.page)}</span><span class="m rc">${esc(x.code)}</span><span class="amtc num">${money(x.amt)}</span><span class="move"></span></div>`).join('')}</div>`;
      const xi = r.crossIn || [], xo = r.crossOut || [];
      if (xi.length || xo.length) body += `<h3 style="margin:22px 0 4px;font-size:15px">Used another department's terminal (${xi.length + xo.length})</h3><p style="margin:0 0 12px;color:var(--muted);font-size:13px">Nothing to fix in Opera. Each charge is counted in the department where it was posted.</p><div class="list">${
        xi.map(c => `<div class="lrow"><span class="g">${esc(c.d ? c.d.name + ' · Rm ' + c.d.room : 'No posting matched')}</span><span class="m room">Posted ${esc(S.sel)}</span><span class="m pg">${c.d ? 'p.' + esc(c.d.page) : ''}</span><span class="m rc">${c.d && c.d.receipt ? '#' + esc(c.d.receipt) : ''}</span><span class="amtc num">${money(c.t.amt)}</span><span class="move"><span class="chip to">${esc(c.t.tn)} · ${esc(c.t.org)}</span><span class="m">${esc(c.t.time)} · ${esc(c.t.type)} ••${esc(c.t.l4)}</span></span></div>`).join('') +
        xo.map(c => `<div class="lrow"><span class="g">${esc(c.t.type)} ••${esc(c.t.l4)}${c.d ? ' · ' + esc(c.d.name) : ''}</span><span class="m room">Posted ${esc(c.d ? c.d.dept : '')}</span><span class="m pg">${c.d ? 'p.' + esc(c.d.page) : ''}</span><span class="m rc">${c.d && c.d.receipt ? '#' + esc(c.d.receipt) : ''}</span><span class="amtc num">${money(c.t.amt)}</span><span class="move"><span class="chip to">${esc(c.t.tn)} · ${esc(c.t.org)}</span><span class="m">${esc(c.t.time)}</span></span></div>`).join('')}</div>`;
      if (r.offsets.length) body += `<h3 style="margin:22px 0 12px;font-size:15px">Cancel out, no effect (${r.offsets.length})</h3><div class="list">${r.offsets.map(o => `<div class="lrow"><span class="g">${esc(o.side === 'Opera' ? o.a.name + ' · Rm ' + o.a.room : o.a.type + ' ••' + o.a.l4)}</span><span class="m room">${esc(o.side)}</span><span class="m pg">${o.side === 'Opera' ? 'p.' + esc(o.a.page) : ''}</span><span class="m rc">${esc(o.a.time)} / ${esc(o.b.time)}</span><span class="amtc num">${money(o.a.amt)}</span><span class="move"><span class="chip to">+${plain(o.a.amt)}</span><span class="chip from" style="text-decoration:none">${plain(o.b.amt)}</span></span></div>`).join('')}</div>`;
    } else if (S.tab === 'codes') {
      body = r.wrong.length ? `<div class="lhead"><span>Guest</span><span>Room</span><span>Page</span><span>Receipt</span><span>Amount</span><span>Move code</span></div><div class="list">${r.wrong.map(w => `<div class="lrow"><span class="g">${esc(w.x.name)}${w.x.by ? `<small style="display:block;font-weight:500;color:var(--muted);font-size:12px">by ${esc(w.x.by)}</small>` : ""}</span><span class="m room">${esc(w.x.room)}</span><span class="m pg">p.${esc(w.x.page)}</span><span class="m rc">${w.x.receipt ? '#' + esc(w.x.receipt) : esc(w.x.ref.slice(-8))}</span><span class="amtc num">${money(w.x.amt)}</span><span class="move"><span class="chip from">${esc(w.x.code)} ${esc(w.from)}</span>${ic.arrow(16)}<span class="chip to">${esc(w.toCode)} ${esc(w.to)}</span><span class="m">••${esc(w.y.l4)} · ${esc(w.y.tn)} ${esc(w.y.time)}</span></span></div>`).join('')}</div>`
        : `<div class="nothing">${ic.party(40)}<b>All on the right card code</b></div>`;
    } else if (S.tab === 'sheet') {
      const st = sheetTypes(r);
      body = `<div class="tablewrap"><table><thead><tr><th>Card type</th><th>Code</th>${r.terms.map(t => `<th class="r">${esc(tname(r, t))}</th>`).join('')}<th class="r">Terminals</th><th class="r">Opera</th><th class="r">Variance</th></tr></thead><tbody>
        ${st.map(ty => { const o = r.sheet[ty], v = o.tt - o.op; return `<tr><td><b>${esc(ty)}</b></td><td>${esc(Engine.codeFor(r.dept, ty))}</td>${r.terms.map(t => `<td class="r">${o.t[t] ? plain(o.t[t]) : ''}</td>`).join('')}<td class="r"><b>${plain(o.tt)}</b></td><td class="r">${plain(o.op)}</td><td class="r ${cents(v) ? "v-" + vc(v) : ""}">${plain(v)}</td></tr>`; }).join('')}
        <tr class="tot"><td>Total</td><td></td>${r.terms.map(t => `<td class="r">${plain(r.termTot[t] || 0)}</td>`).join('')}<td class="r">${plain(r.tTot)}</td><td class="r">${plain(r.dTot)}</td><td class="r ${cents(r.variance) ? "v-" + vc(r.variance) : "pos"}">${plain(r.variance)}</td></tr></tbody></table></div>`;
    } else {
      body = `<div class="tablewrap"><table><thead><tr><th>Opera posting</th><th>Page</th><th class="r">Opera</th><th>Terminal</th><th class="r">Terminal</th></tr></thead><tbody>${r.matches.map(m => `<tr><td>${m.d.map(x => `${esc(x.time)} · ${esc(x.name)} · Rm ${esc(x.room)}${x.by ? ' · by ' + esc(x.by) : ''}`).join('<br>')}</td><td>${m.d.map(x => esc(x.page)).join('<br>')}</td><td class="r">${m.d.map(x => plain(x.amt)).join('<br>')}</td><td>${m.t.map(y => `${esc(y.tn)} · ${esc(y.time)} · ${esc(y.type)} ••${esc(y.l4)}`).join('<br>')}</td><td class="r">${m.t.map(y => plain(y.amt)).join('<br>')}</td></tr>`).join('')}</tbody></table></div>`;
    }

    el.innerHTML = `<div class="dbar"><div class="seg" role="tablist">${['FO', 'F&B'].filter(d => S.res[d] && !S.res[d].skip).map(d => `<button class="${S.sel === d ? 'on' : ''}" data-d="${esc(d)}"><span class="dot ${vc(S.res[d].variance)}"></span>${esc(deptName(d))}</button>`).join('')}</div><span class="spacer"></span>
      <button class="btn" id="b-copy">${ic.copy(18)}Copy sheet</button><button class="btn primary" id="b-pdf">${ic.down(18)}PDF report</button></div>
      <div class="grid2"><div class="panel"><h3>By card type<span class="legend"><span><i style="background:var(--amber)"></i>Terminals</span><span><i style="background:var(--sky)"></i>Opera</span></span></h3><div class="bars">${bars}</div></div>
      <div class="panel"><h3>Terminals</h3><div class="terms">${terms}</div></div></div>
      <div><div class="tabs" role="tablist">${tabs.map(([k, l, n, c]) => `<button class="${S.tab === k ? 'on' : ''}" data-t="${k}" role="tab">${l}${n !== null ? `<span class="count ${c}">${n}</span>` : ''}</button>`).join('')}</div><div style="padding-top:18px">${body}</div></div>`;
    el.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { S.sel = b.dataset.d; S.tab = null; renderReceipts(false); renderDetail(); }));
    el.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { S.tab = b.dataset.t; renderDetail(); }));
    $('#b-copy').addEventListener('click', () => copy(sheetTSV(r)));
    $('#b-pdf').addEventListener('click', downloadPdf);
  }
  function copy(txt) {
    const done = () => toast('Copied. Paste into your sheet.');
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, fallback); else fallback();
    function fallback() { const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); } ta.remove(); }
  }
  function downloadPdf() {
    try { const { doc, name } = Report.build(S.res); doc.save(name); toast('PDF saved'); }
    catch (e) { toast('PDF failed: ' + e.message); }
  }

  /* ---------- banners / date ---------- */
  function renderBanners() {
    const b = [];
    for (const d of ['FO', 'F&B']) { const p = S.pdf[d]; if (p && !p.grandOk) b.push(`<div class="banner bad">${ic.alert(18)}<span>${deptName(d)} D140: postings add to ${money(p.total)} but the Grand Total says ${money(p.grand)}. Some lines may not have been read.</span></div>`); }
    const r = S.res && S.res[S.sel]; if (r && r.warn) b.push(`<div class="banner">${ic.alert(18)}<span>${esc(r.warn)}</span></div>`);
    if (r && !r.skip) { const oth = deptName(S.sel === 'FO' ? 'F&B' : 'FO'), me = deptName(S.sel), sum = l => l.reduce((a, c) => a + c.t.amt, 0);
      if (r.crossIn.length) b.push(`<div class="banner info">${ic.pos(18)}<span>${me} includes ${money(sum(r.crossIn))} (${r.crossIn.length}) charged on ${oth} terminals and posted in ${me} Opera. It is counted here, so it is not a difference. See the To fix tab.</span></div>`);
      if (r.crossOut.length) b.push(`<div class="banner info">${ic.pos(18)}<span>${money(sum(r.crossOut))} (${r.crossOut.length}) charged on ${me} terminals belongs to ${oth} and is counted there. ${me} terminal totals here are lower than the terminal report by this amount.</span></div>`);
      const ck = r.checks || [], on = r.otherNight || [], nc = r.nonCard || [];
      if (ck.length) b.push(`<div class="banner">${ic.alert(18)}<span>${ck.length} ${ck.length === 1 ? 'match balances' : 'matches balance'} only on amount (different cards, or two items against one). Two mistakes can cancel out and look balanced. Check ${ck.length === 1 ? 'it' : 'them'} on the To fix tab.</span></div>`);
      if (on.length) b.push(`<div class="banner info">${ic.pos(18)}<span>${on.length} completion${on.length === 1 ? '' : 's'} (${money(on.reduce((a, y) => a + y.amt, 0))}) from another night in this export ${on.length === 1 ? 'was' : 'were'} not counted.</span></div>`);
      if (nc.length) b.push(`<div class="banner info">${ic.page(18)}<span>${nc.length} D140 posting${nc.length === 1 ? '' : 's'} (${money(nc.reduce((a, x) => a + x.amt, 0))}) ${nc.length === 1 ? 'is not a card payment' : 'are not card payments'} (code ${[...new Set(nc.map(x => x.code))].join(', ')}) and ${nc.length === 1 ? 'was' : 'were'} not checked.</span></div>`); }
    $('#banners').innerHTML = b.join('');
    $('#banners').style.display = b.length ? 'grid' : 'none'; $('#banners').style.gap = '10px';
    const any = S.res && (S.res.FO || S.res['F&B']); const rr = any && !any.skip ? any : null;
    const chip = $('#datechip');
    if (rr) { chip.hidden = false; chip.innerHTML = `<strong>${esc(fmtDate(rr.bd))}</strong>${rr.tBatch ? `<span class="sep"></span>Batch ${esc(rr.tBatch)}` : '<span class="sep"></span>By date'}`; } else chip.hidden = true;
  }
  function renderAll(print) { renderSlots(); renderReceipts(print); renderBanners(); renderDetail(); }

  /* ---------- history ---------- */
  function saveHistory() {
    if (!S.res) return; const any = Object.values(S.res).find(r => !r.skip); if (!any) return;
    const h = store.get('cr-history', []).filter(x => x.bd !== any.bd);
    const sum = r => r && !r.skip ? { v: r.variance, fix: r.ex.filter(e => e.kind !== 'dup' && e.kind !== 'missing').length, codes: r.wrong.length, t: r.tTot, o: r.dTot } : null;
    h.unshift({ bd: any.bd, at: Date.now(), fo: sum(S.res.FO), fb: sum(S.res['F&B']) });
    store.set('cr-history', h.sort((a, b) => b.bd.localeCompare(a.bd)).slice(0, 120));
  }
  const vpill = s => !s ? '<span class="pill mute">—</span>' : cents(s.v) === 0 ? '<span class="pill ok">NIL</span>' : `<span class="pill ${vc(s.v)}">${money(s.v, true)}</span>`;
  function openHistory() {
    const h = store.get('cr-history', []);
    openDrawer('History', h.length ? `<div class="hist">${h.map((x, i) => `<div class="hrow"><div class="d">${esc(fmtDate(x.bd))}<small>FO · F&amp;B</small></div>${vpill(x.fo)}${vpill(x.fb)}<button data-i="${i}" aria-label="Delete">${ic.trash(16)}</button></div>`).join('')}</div>` : `<div class="nothing">${ic.clock(36)}<b>No audits yet</b><span>Each reconciliation is saved here on this device.</span></div>`);
    $('#drawer-body').querySelectorAll('button[data-i]').forEach(b => b.addEventListener('click', () => { const hh = store.get('cr-history', []); hh.splice(+b.dataset.i, 1); store.set('cr-history', hh); openHistory(); }));
  }

  /* ---------- settings ---------- */
  function openSettings() {
    const ms = Engine.merchants(S.csv, S.merch), bs = Engine.batches(S.csv);
    openDrawer('Settings', `
      <div class="field"><span>Count terminals by</span><div class="seg" id="o-basis"><button data-v="batch" class="${S.opts.basis === 'batch' ? 'on' : ''}">Settlement batch</button><button data-v="date" class="${S.opts.basis === 'date' ? 'on' : ''}">Transaction date</button></div></div>
      <div class="field"><label for="o-batch">Batch</label><select id="o-batch"><option value="auto">Day after the D140 date</option>${Object.keys(bs).sort().map(b => `<option value="${esc(b)}" ${S.opts.batch === b ? 'selected' : ''}>${esc(b)} · ${bs[b]} rows</option>`).join('')}</select></div>
      <label class="switch"><input type="checkbox" id="o-cross" ${S.opts.cross !== false ? 'checked' : ''}>Match charges taken on the other department's terminal</label>
      <label class="switch"><input type="checkbox" id="o-dup" ${S.opts.dupOnce ? 'checked' : ''}>Count a completion shown twice only once</label>
      ${ms.length ? `<div class="field"><span>Merchants</span>${ms.map((m, i) => `<div class="mrow"><div><div class="n">${esc(m.name)}</div><div class="s">${esc(m.id)} · ${esc(m.terms.join(', '))}</div></div><select data-k="${esc(m.key)}" id="m-${i}"><option ${m.dept === 'FO' ? 'selected' : ''}>FO</option><option value="F&B" ${m.dept === 'F&B' ? 'selected' : ''}>F&amp;B</option><option ${m.dept === 'Ignore' ? 'selected' : ''}>Ignore</option></select></div>`).join('')}</div>` : ''}
      ${termSection()}
      ${cashierSection()}
      <button class="btn" id="o-clear">${ic.trash(18)}Clear all files</button>`);
    const B = $('#drawer-body'); const save = () => { store.set('cr-opts', S.opts); run(); };
    B.querySelectorAll('#o-basis button').forEach(b => b.addEventListener('click', () => { S.opts.basis = b.dataset.v; B.querySelectorAll('#o-basis button').forEach(x => x.classList.toggle('on', x === b)); save(); }));
    $('#o-batch').value = S.opts.batch in bs ? S.opts.batch : 'auto';
    $('#o-batch').addEventListener('change', e => { S.opts.batch = e.target.value; save(); });
    $('#o-cross').addEventListener('change', e => { S.opts.cross = e.target.checked; save(); });
    $('#o-dup').addEventListener('change', e => { S.opts.dupOnce = e.target.checked; save(); });
    B.querySelectorAll('select[data-k]').forEach(s => s.addEventListener('change', () => { S.merch[s.dataset.k] = s.value; store.set('cr-merch', S.merch); run(); }));
    wireTerms(B); wireCashiers(B);
    $('#o-clear').addEventListener('click', () => { S.csv = []; S.pdf = { FO: null, 'F&B': null }; S.err = {}; closeDrawer(); run(); });
  }

  // Cashier names for the Cash ID on each D140 line. Saved on this device only.
  function cashierSection() {
    const seen = {};
    for (const p of Object.values(S.pdf)) if (p) for (const r of p.rows) if (r.cashier) { const c = seen[r.cashier] = seen[r.cashier] || { id: r.cashier, users: new Set(), n: 0, depts: new Set() }; if (r.user) c.users.add(r.user); c.n++; c.depts.add(r.dept); }
    const ids = Object.keys(seen).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const rest = Object.keys(S.cashiers).filter(id => !seen[id]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const row = (id, sub) => `<div class="mrow trow crow" data-id="${esc(id)}"><div><input class="cname" value="${esc(S.cashiers[id] || '')}" placeholder="Name for cashier ${esc(id)}" aria-label="Name for cashier ${esc(id)}"><div class="s">${sub}</div></div><div class="s" style="text-align:right;font-weight:700">#${esc(id)}</div></div>`;
    return `<div class="field"><span>Cashiers</span>
      <div class="s" style="font-size:12.5px;color:var(--muted)">Name each Cash ID from the D140. Names are used in the notes and the PDF, and saved on this device only.</div>
      ${ids.length ? `<div class="s" style="font-size:12.5px;font-weight:700">In tonight's D140 (${ids.length})</div>` + ids.map(id => row(id, `${esc([...seen[id].users].join(', ') || 'no login')} · ${seen[id].n} posting${seen[id].n === 1 ? '' : 's'} · ${[...seen[id].depts].join(', ')}${S.cashiers[id] ? '' : ' · <b>no name yet</b>'}`)).join('') : '<div class="s" style="font-size:12.5px;color:var(--muted)">Load a D140 to see its cashiers.</div>'}
      ${rest.length ? `<details><summary style="cursor:pointer;font-size:12.5px;font-weight:700">Other saved cashiers (${rest.length})</summary><div style="display:grid;gap:8px;margin-top:8px">${rest.map(id => row(id, 'Not in tonight\'s D140')).join('')}</div></details>` : ''}
      ${Object.keys(S.cashiers).length ? `<button class="btn" id="o-cclear">${ic.trash(18)}Clear cashier names</button>` : ''}</div>`;
  }
  function wireCashiers(B) {
    B.querySelectorAll('.crow').forEach(el => el.querySelector('.cname').addEventListener('change', e => {
      const v = e.target.value.trim(); if (v) S.cashiers[el.dataset.id] = v; else delete S.cashiers[el.dataset.id];
      const nb = el.querySelector('.s b'); if (nb) nb.hidden = !!v;
      store.set('cr-cashiers', S.cashiers); run();
    }));
    const c = B.querySelector('#o-cclear'); if (c) c.addEventListener('click', () => { if (!confirm('Remove all saved cashier names on this device?')) return; S.cashiers = {}; store.set('cr-cashiers', S.cashiers); run(); openSettings(); });
  }
  function termSection() {
    const ts = Engine.terminals(S.csv, S.names, mapping()), used = new Set();
    const sel = (v, auto) => `<select class="tdept" aria-label="Department"><option value="" ${!v ? "selected" : ""}>Auto${auto ? " (" + esc(auto) + ")" : ""}</option>${["FO", "F&B", "Ignore"].map(o => `<option value="${esc(o)}" ${v === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    const row = (key, name, ph, sub, dept, auto) => `<div class="mrow trow" data-key="${esc(key)}"><div><input class="tname" value="${esc(name)}" placeholder="${esc(ph)}" aria-label="Terminal name"><div class="s">${sub}</div></div>${sel(dept, auto)}</div>`;
    const seen = ts.map(t => { const i = t.hit ? S.names.findIndex(n => n.id === t.hit.id) : -1; if (i >= 0) used.add(i);
      return row(i >= 0 ? "n:" + i : "new:" + (t.merchant || "") + "|" + t.term, i >= 0 ? S.names[i].name : "", "Terminal " + t.term, `${esc(t.term)}${t.merchant ? " · merchant " + esc(t.merchant) : ""} · ${t.n} rows${i >= 0 ? "" : " · <b>no name yet</b>"}`, i >= 0 ? S.names[i].dept : "", t.auto); }).join("");
    const rest = S.names.map((n, i) => used.has(i) ? "" : row("n:" + i, n.name, "Terminal", esc(n.id), n.dept, "")).join("");
    return `<div class="field"><span>Terminals</span>
      <div class="s" style="font-size:12.5px;color:var(--muted)">Names and departments are saved on this device only. A department set here overrides the merchant.</div>
      <label class="btn" for="o-tfile">${ic.doc(18)}Import terminal sheet (.csv)<input type="file" id="o-tfile" accept=".csv,text/csv" hidden></label>
      ${ts.length ? `<div class="s" style="font-size:12.5px;font-weight:700">In tonight's export (${ts.length})</div>${seen}` : ""}
      ${rest ? `<details><summary style="cursor:pointer;font-size:12.5px;font-weight:700">Other saved terminals (${S.names.length - used.size})</summary><div style="display:grid;gap:8px;margin-top:8px">${rest}</div></details>` : ""}
      ${S.names.length ? `<button class="btn" id="o-tclear">${ic.trash(18)}Clear terminal names</button>` : ""}</div>`;
  }
  function wireTerms(B) {
    const save = () => { store.set("cr-terms", S.names); run(); };
    const entry = el => { let k = el.dataset.key; if (k.startsWith("n:")) return S.names[+k.slice(2)];
      const [m, t] = k.slice(4).split("|"); S.names.push({ id: (m ? m + "-" : "") + t, name: "", dept: "" }); el.dataset.key = "n:" + (S.names.length - 1); return S.names[S.names.length - 1]; };
    B.querySelectorAll(".trow:not(.crow)").forEach(el => {
      el.querySelector(".tname").addEventListener("change", e => { const n = entry(el); n.name = e.target.value.trim(); n.custom = true; save(); });
      el.querySelector(".tdept").addEventListener("change", e => { const n = entry(el); n.dept = e.target.value; n.custom = true; save(); });
    });
    const f = B.querySelector("#o-tfile"); if (f) f.addEventListener("change", async () => { if (f.files[0] && importNames(await f.files[0].text())) { run(); openSettings(); } });
    const c = B.querySelector("#o-tclear"); if (c) c.addEventListener("click", () => { if (!confirm("Remove all saved terminal names on this device?")) return; S.names = []; save(); openSettings(); });
  }

  /* ---------- drawer ---------- */
  function openDrawer(title, html) { $('#drawer-title').textContent = title; $('#drawer-body').innerHTML = html; $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('open'); }
  function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); $('#scrim').classList.remove('open'); }
  $('#scrim').addEventListener('click', closeDrawer); $('#drawer-close').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  $('#btn-history').addEventListener('click', openHistory);
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-theme').addEventListener('click', () => { const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = t; try { localStorage.setItem('cr-theme', t) } catch (e) { } document.querySelector('meta[name=theme-color]').content = t === 'light' ? '#eef1f8' : '#121d33'; setThemeIcon(); });

  window.__CR = { S, addFiles, run };
  renderAll();
})();
