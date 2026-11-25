/* Card Recon engine: parsing and reconciliation rules. No DOM, no AI. */
const Engine = (() => {
  const num = s => parseFloat(String(s ?? '').replace(/[\s,$]/g, ''));
  const cents = n => Math.round(n * 100);
  const mins = t => { const m = String(t || '').match(/(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : 0; };

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    const h = (rows.shift() || []).map(s => s.replace(/^\uFEFF/, '').trim());
    const out = rows.filter(r => r.length > 1).map(r => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])));
    if (!out.length || !('status' in out[0]) || !('Curr.amount' in out[0])) throw new Error('Not a gateway transaction export');
    return out;
  }

  /* ---------- D140 PDF ---------- */
  async function pdfLines(buf) {
    const doc = await pdfjsLib.getDocument({ data: buf }).promise; const lines = [], pages = [], geo = [], sizes = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const pg = await doc.getPage(p), vp = pg.getViewport({ scale: 1 }); sizes.push({ w: vp.width, h: vp.height });
      const tc = await pg.getTextContent();
      const items = tc.items.filter(i => i.str && i.str.trim() !== '').map(i => ({ x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || i.height || 8, s: i.str }));
      const groups = [];
      for (const it of items) { const g = groups.find(g => Math.abs(g.y - it.y) < 2.5); if (g) g.items.push(it); else groups.push({ y: it.y, items: [it] }); }
      groups.sort((a, b) => b.y - a.y);
      for (const g of groups) {
        g.items.sort((a, b) => a.x - b.x); let s = '', end = null;
        for (const it of g.items) { if (end !== null) { const gap = it.x - end; s += gap > 4 ? '  ' : gap > 0.8 ? ' ' : ''; } s += it.s; end = it.x + it.w; }
        lines.push(s); pages.push(p);
        // Where the line sits on the page (PDF points, origin bottom-left), for highlighting it later.
        geo.push({ y: g.y, h: Math.max(...g.items.map(i => i.h)), x0: g.items[0].x, x1: Math.max(...g.items.map(i => i.x + i.w)), items: g.items.map(i => ({ x: i.x, w: i.w, s: i.s.trim() })) });
      }
    }
    return { lines, pages, geo, sizes };
  }
  const POST = /^\s*(\d\d-\d\d-\d\d)\s+(\d\d:\d\d)\s+(\S+)\s+(.*?)\s+(9\d{4})\s+(.*?)\s*NZD\s+(-?\s*[\d,]+\.\d\d)\s+(-?\s*[\d,]+\.\d\d)/;
  function parseD140(lines, pages, file, geo = [], sizes = []) {
    const rows = []; let grand = null;
    lines.forEach((l, i) => {
      const gm = l.match(/Grand Total\s+(-?\s*[\d,]+\.\d\d)\s+(-?\s*[\d,]+\.\d\d)/); if (gm) grand = num(gm[2]) - num(gm[1]);
      const m = l.match(POST); if (!m) return;
      const name = m[4].split(/\s{2,}/)[0].trim();
      const desc = m[6].trim(); const ref = (desc.match(/\b\d{15,}\b/) || [''])[0];
      const nxt = lines[i + 1] || '';
      const l4 = (nxt.match(/X{6,}(\d{4})/) || nxt.match(/\b(?:VS|MC|AX|AMEX|VISA)\s*\*{0,3}(\d{4})\b/i) || [])[1] || '';
      const receipt = (nxt.match(/#(\d{5,})/) || [])[1] || '';
      const amt = +(num(m[8]) - num(m[7])).toFixed(2); if (amt === 0) return;
      const cm = l.slice(m.index + m[0].length).match(/^\s*(\d{1,6})(?:-([A-Za-z0-9._]+))?/); // Cash ID + User Name
      const cashier = cm ? cm[1] : '', user = cm && cm[2] ? cm[2].replace(/@.*/, '') : '';
      // Box around the posting (its line + the card-number line under it) and around the amount.
      let box = null; const g = geo[i];
      if (g) {
        const n = geo[i + 1] && pages[i + 1] === pages[i] && g.y - geo[i + 1].y < g.h * 2.6 ? geo[i + 1] : null;
        const want = (amt > 0 ? m[8] : m[7]).replace(/\s/g, ''), it = [...g.items].reverse().find(t => t.s.replace(/\s/g, '') === want);
        box = { y0: (n || g).y - 2, y1: g.y + g.h + 1, x0: Math.min(g.x0, n ? n.x0 : g.x0) - 3, x1: g.x1 + 3, a: it ? { x0: it.x - 2, x1: it.x + it.w + 2, y0: g.y - 2, y1: g.y + g.h + 1 } : null };
      }
      rows.push({ side: 'D', date: m[1], time: m[2], room: m[3], name, code: m[5], ref, l4, receipt, page: pages[i], amt, dept: m[5].startsWith('917') ? 'F&B' : 'FO', file, cashier, user, box, line: l.replace(/\s{2,}/g, '  ').trim(), line2: (geo[i + 1] && pages[i + 1] === pages[i]) ? nxt.trim() : '' });
    });
    if (!rows.length) throw new Error('No D140 postings found');
    const total = rows.reduce((a, r) => a + r.amt, 0);
    const dates = {}; rows.forEach(r => dates[r.date] = (dates[r.date] || 0) + 1);
    const top = Object.entries(dates).sort((a, b) => b[1] - a[1])[0][0].match(/(\d\d)-(\d\d)-(\d\d)/);
    const depts = {}; rows.forEach(r => depts[r.dept] = (depts[r.dept] || 0) + 1);
    return { rows, sizes, grand, total, grandOk: grand === null || cents(grand) === cents(total), bdate: `20${top[3]}-${top[2]}-${top[1]}`, dept: Object.entries(depts).sort((a, b) => b[1] - a[1])[0][0] };
  }

  /* ---------- card types ---------- */
  const TYPES = ['EFTPOS', 'MC', 'VISA', 'Union Pay', 'Amex', 'AliPay & WeChat', 'JCB'];
  function cardType(p) {
    p = String(p || '').toUpperCase();
    if (/MASTER/.test(p)) return 'MC'; if (/VISA/.test(p)) return 'VISA'; if (/AMEX|AMERICAN/.test(p)) return 'Amex';
    if (/UPI|UNION/.test(p)) return 'Union Pay'; if (/JCB/.test(p)) return 'JCB'; if (/ALI|WECHAT/.test(p)) return 'AliPay & WeChat';
    if (/DEBIT|EFTPOS/.test(p)) return 'EFTPOS'; return p || 'Other';
  }
  const SUF = { EFTPOS: '07', MC: '02', VISA: '01', 'Union Pay': '08', Amex: '03', 'AliPay & WeChat': '04', JCB: '05' };
  const codeType = c => Object.keys(SUF).find(k => SUF[k] === String(c).slice(-2)) || ('Code ' + c);
  const codeFor = (dept, type) => SUF[type] ? (dept === 'F&B' ? '917' : '907') + SUF[type] : '';

  /* ---------- terminal rows ---------- */
  function termRows(csvFiles) {
    const seen = new Set(), all = [];
    for (const f of csvFiles) for (const r of f.rows) { const k = rowKey(r); if (seen.has(k)) continue; seen.add(k); all.push(r); }
    return all;
  }
  // One key per transaction. Rows without an RRN (some wallet payments) are told apart by their details,
  // so they are never merged; the same row appearing in two overlapping exports is still counted once.
  const rowKey = r => r.RRN ? r.RRN + '|' + (r.status || '') :
    ['noRRN', r.merchant_id, r.terminal_id, r.created_at_date, r.created_at_time, r['Curr.amount'], r['Orig.amount'], r['card.last_four'], r.status, r.batch_id].join('|');
  const merchantKey = r => (r.merchant_id || '') + '|' + (r['organisation.name'] || '');
  // Front desk = the merchant that takes the most pre-auths; every other merchant is an F&B outlet.
  let FO_KEY = null;
  function learnFO(all) { const c = {}; for (const r of all) if (/^PREAUTH/.test(r.status || '')) { const k = merchantKey(r); c[k] = (c[k] || 0) + 1; } FO_KEY = Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || null; }
  const defaultDept = r => merchantKey(r) === FO_KEY ? 'FO' : 'F&B';
  const label = (r, dept) => dept === 'FO' ? 'Front Office' : (r['organisation.name'] || 'F&B outlet');
  function merchants(csvFiles, saved = {}) {
    const m = {}; const all = termRows(csvFiles); learnFO(all);
    for (const r of all) {
      const k = merchantKey(r);
      m[k] = m[k] || { key: k, name: label(r, saved[k] || defaultDept(r)), id: r.merchant_id, terms: new Set(), n: 0, dept: saved[k] || defaultDept(r) };
      m[k].terms.add(r.terminal_id); m[k].n++;
    }
    return Object.values(m).map(v => ({ ...v, terms: [...v.terms].sort() }));
  }
  function batches(csvFiles) { const b = {}; for (const r of termRows(csvFiles)) if (r.batch_id) b[r.batch_id] = (b[r.batch_id] || 0) + 1; return b; }

  /* ---------- terminal names ---------- */
  // Names live on the device only (never in this code). Matching uses digits only, so
  // "44742500-0001", "447425000001" or merchant 44742500 + terminal 0001 all match.
  const dg = s => String(s == null ? "" : s).replace(/\D/g, "");
  // A simple names list: header "Name,Terminal ID[,Department]", one terminal per row.
  const isNameList = text => /^﻿?\s*"?name"?\s*,\s*"?terminal[ _]?id"?/i.test(text);
  const isTermSheet = text => isNameList(text) || (/TERMINAL[^,\n]*\([^)]*\)\s*-\s*\d/i.test(text) && !/terminal_id/i.test(text.slice(0, 2000)));
  function parseTermSheet(text) {
    if (isNameList(text)) {
      const out = [], seen = new Set();
      for (const line of text.split(/\r?\n/).slice(1)) {
        const [name, id, dep] = line.split(",").map(s => (s || "").replace(/^\s*"|"\s*$/g, "").trim());
        const d = dg(id); if (!name || d.length < 4 || seen.has(d)) continue; seen.add(d);
        const dept = /^f\s*&\s*b$|^fb$/i.test(dep) ? "F&B" : /^fo$/i.test(dep) ? "FO" : /^ignore$/i.test(dep) ? "Ignore" : "";
        out.push({ id, name, dept });
      }
      return out;
    }
    const out = [], seen = new Set(), re = /TERMINAL\s*(\d*)\s*\(([^)]+)\)\s*-\s*(\d[\d\s-]{3,}\d)/gi; let m;
    while ((m = re.exec(text))) {
      const id = m[3].replace(/\s+/g, ""), d = dg(id); if (seen.has(d)) continue; seen.add(d);
      const lab = m[2].trim();
      const dept = /f\s*&\s*b|restaurant|\bbar\b|cafe/i.test(lab) ? "F&B" : /\bFO\b|front|finance|refund|reserv/i.test(lab) ? "FO" : "";
      out.push({ id, name: m[1] ? `Terminal ${m[1]} (${lab})` : `Terminal (${lab})`, dept });
    }
    const c = {}; for (const n of out) c[n.name] = (c[n.name] || 0) + 1;
    for (const n of out) if (c[n.name] > 1) n.name += " ·" + dg(n.id).slice(-4);
    return out;
  }
  // No terminal names are built into the public code. Import your terminal list in Settings on each device.
  // A name saved in Settings for the same terminal wins over these.
  const BUILT_IN = [
  ].map(([name, id, dept]) => ({ id, name, dept, builtIn: true }));
  const withBuiltIn = (names = []) => names.concat(BUILT_IN.filter(b => !names.some(n => dg(n.id) === b.id)));
  function termLookup(names = []) {
    const list = names.filter(n => dg(n.id)).map(n => ({ ...n, d: dg(n.id) })), cache = {};
    return r => {
      const t = dg(r.terminal_id), m = dg(r.merchant_id), k = m + "|" + t; if (k in cache) return cache[k];
      const c = [t, m + t].filter(Boolean);
      // A 12-digit sheet ID (merchant 6 + terminal 6, e.g. 123456000002) is the export's
      // 8-digit ID with the padding zeros (12345602).
      const short = d => d.length === 12 && /^0+$/.test(d.slice(6, 10)) ? d.slice(0, 6) + d.slice(-2) : d;
      let hit = list.find(n => c.includes(n.d)) || (t.length === 8 && list.find(n => short(n.d) === t));
      if (!hit && t.length >= 4) { const s = list.filter(n => n.d.endsWith(t) || (n.d.length >= 6 && t.endsWith(n.d))); if (s.length === 1) hit = s[0]; }
      return (cache[k] = hit || null);
    };
  }
  // Every terminal in the export, with the saved name it matched (for Settings).
  function terminals(csvFiles, names = [], merch = {}) {
    const all = termRows(csvFiles); learnFO(all); const look = termLookup(names), m = {};
    for (const r of all) {
      const k = (r.merchant_id || "") + "|" + r.terminal_id, hit = look(r);
      m[k] = m[k] || { term: r.terminal_id, merchant: r.merchant_id, org: r["organisation.name"] || "", n: 0, hit, auto: merch[merchantKey(r)] || defaultDept(r) };
      m[k].n++;
    }
    return Object.values(m).sort((a, b) => String(a.term).localeCompare(String(b.term)));
  }

  /* ---------- reconcile ---------- */
  // moves: { rowKey: dept } — terminal charges counted in another department (see reconcile below).
  function reconcileOnce({ csvFiles, pdfFiles, merch = {}, names = [], cashiers = {}, basis = 'batch', batch = 'auto', dupOnce = true }, moves = {}) {
    // Who posted it: the cashier's name from Settings, else "cashier 479".
    // F&B lines come in through the Micros interface (Cash ID 100, user OPERA-IFC), not a person.
    const by = r => !r.cashier ? '' : cashiers[r.cashier] || (/^OPERA/i.test(r.user || '') || String(r.code).startsWith('917') && r.cashier === '100' ? 'the Micros interface' : 'cashier ' + r.cashier);
    const all = termRows(csvFiles); learnFO(all); const look = termLookup(names);
    // Only card payment codes are checked against terminals. Bank transfers (xxx11) are left out quietly;
    // any other non-card code is left out and listed.
    const D = { FO: [], 'F&B': [] }, nonCard = { FO: [], 'F&B': [] };
    for (const f of pdfFiles) for (const r of f.rows) {
      const sfx = String(r.code).slice(-2);
      if (Object.values(SUF).includes(sfx)) D[r.dept].push({ ...r, by: by(r) }); else if (sfx !== '11') nonCard[r.dept].push({ ...r, by: by(r) });
    }
    const bdate = {};
    for (const dept of ['FO', 'F&B']) {
      const c = {}; for (const r of D[dept]) { const m = r.date.match(/(\d\d)-(\d\d)-(\d\d)/); const k = `20${m[3]}-${m[2]}-${m[1]}`; c[k] = (c[k] || 0) + 1; }
      bdate[dept] = Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    }
    const tBatch = {};
    for (const dept of ['FO', 'F&B']) {
      if (batch !== 'auto') tBatch[dept] = batch;
      else if (bdate[dept]) { const dt = new Date(bdate[dept] + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() + 1); tBatch[dept] = dt.toISOString().slice(0, 10).replace(/-/g, ''); }
    }
    const comps = all.filter(r => r.status === 'PREAUTH_COMPLETION AUTHORISED');
    const preauthStyle = comps.length > 0 && comps.filter(r => cents(num(r['Orig.amount'])) !== cents(num(r['Curr.amount']))).length / comps.length > 0.5;
    const exportStart = all.map(r => r.created_at_date).filter(Boolean).sort()[0] || '';
    const startTxt = exportStart ? new Date(exportStart + 'T12:00:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }) : '';
    // If no row carries the expected batch (e.g. batch_id is a running number, not a date), count by transaction date instead.
    const batchSet = new Set(all.map(r => String(r.batch_id || '')).filter(Boolean));
    const batchFound = b => !!b && batchSet.has(String(b));

    const T = { FO: [], 'F&B': [] }, ignored = { FO: {}, 'F&B': {} }, declined = { FO: [], 'F&B': [] };
    for (const r of all) {
      const tinfo = look(r); const home = (tinfo && tinfo.dept) || merch[merchantKey(r)] || defaultDept(r); if (home === "Ignore") continue;
      const st = r.status || '', cur = num(r['Curr.amount']), orig = num(r['Orig.amount']);
      const key = rowKey(r), dept = moves[key] || home;
      const a = (st === 'SALE AUTHORISED' && !isNaN(orig) && orig > cur) ? orig : cur; // refunded sale: count what was charged
      const row = { side: 'T', key, home, dept, org: label(r, home), term: r.terminal_id, tn: (tinfo && tinfo.name) || (defaultDept(r) === 'F&B' && r['organisation.name'] ? r['organisation.name'].trim() + ' ' + r.terminal_id : "Terminal " + r.terminal_id), date: r.created_at_date, time: (r.created_at_time || '').slice(0, 5),
        card: r.Product, type: cardType(r.Product), l4: String(r['card.last_four'] || '').padStart(4, '0'), bin: r['card.bin'], rrn: r.RRN, batch: r.batch_id, orig, status: st, amt: a, grat: num(r.Gratuity_amount) || 0, mid: r.merchant_id, entry: r.technology || r.entry_mode || '' };
      const counts = st === 'SALE AUTHORISED' || st === 'PREAUTH_COMPLETION AUTHORISED' || st === 'REFUND AUTHORISED';
      const isComp = st === 'PREAUTH_COMPLETION AUTHORISED';
      // Filter by the terminal's own department; if that D140 isn't loaded, use the other one's date.
      const tb = tBatch[home] || tBatch.FO || tBatch['F&B'], bdt = bdate[home] || bdate.FO || bdate['F&B'];
      const useBatch = basis === 'batch' && r.batch_id && batchFound(tb);
      if (counts && !isComp && useBatch && String(r.batch_id) !== tb) { ignored[dept]['Other batch'] = (ignored[dept]['Other batch'] || 0) + 1; continue; }
      if (counts && !isComp && !useBatch && bdt && row.date && row.date !== bdt) { ignored[dept]['Other date'] = (ignored[dept]['Other date'] || 0) + 1; continue; }
      // A completion from another batch/night (multi-day export). Counted only if it matches an Opera posting on
      // the same card. Not applied to pre-auth-dated exports, where tonight's completions carry older dates.
      if (isComp && !preauthStyle) row.offBatch = useBatch ? String(r.batch_id) !== tb : !!(bdt && row.date && row.date !== bdt);
      if (st === 'SALE AUTHORISED' || isComp) T[dept].push(row);
      else if (st === 'REFUND AUTHORISED') { row.amt = -a; T[dept].push(row); }
      else { const k = st.replace(' AUTHORISED', '').replace('_', ' ').toLowerCase(); ignored[dept][k] = (ignored[dept][k] || 0) + 1; if (/DECLINED/.test(st)) declined[dept].push(row); }
    }

    const out = {}, left = { T: {}, D: {} };
    for (const dept of ['FO', 'F&B']) {
      const t = T[dept], d = D[dept];
      if (!d.length) { if (t.length) out[dept] = { skip: true, tCount: t.length }; left.T[dept] = t.filter(r => r.home === dept); continue; }
      const cs = t.filter(r => r.status === 'PREAUTH_COMPLETION AUTHORISED');
      for (const r of cs) {
        if (isNaN(r.orig) || cents(r.orig) === cents(r.amt)) continue;
        const twin = cs.find(z => z !== r && !z.dupOf && z.l4 === r.l4 && z.bin === r.bin && cents(z.amt) === cents(r.amt) && cents(z.orig) === cents(z.amt));
        if (twin) r.dupOf = twin;
      }
      let counted = t.filter(r => !(r.dupOf && dupOnce)); const dupRows = t.filter(r => r.dupOf && dupOnce);
      let tTot = counted.reduce((a, r) => a + r.amt, 0); const dTot = d.reduce((a, r) => a + r.amt, 0);
      const matches = [], tu = new Set(counted), du = new Set(d), tips = [];
      const pass = sameCard => {
        for (const x of [...du]) {
          let best = null, bd = 1e12;
          for (const y of tu) {
            if (cents(y.amt) !== cents(x.amt)) continue; if (sameCard && !(x.l4 && x.l4 === y.l4)) continue;
            if (!sameCard && y.offBatch) continue; // other-night completions only count on a same-card match
            const sc = Math.abs(mins(x.time) - mins(y.time)) + (codeType(x.code) === y.type ? 0 : 100000);
            if (sc < bd) { bd = sc; best = y; }
          }
          if (best) { matches.push({ d: [x], t: [best], how: sameCard ? 'card' : 'amount' }); du.delete(x); tu.delete(best); }
        }
      };
      // Tip on the terminal that Opera doesn't have: the charge minus Gratuity_amount equals the posting.
      const tipPass = sameCard => {
        for (const y of [...tu]) {
          if (!(y.grat > 0) || y.offBatch) continue;
          const c = [...du].filter(x => cents(x.amt) === cents(y.amt) - cents(y.grat));
          const x = c.find(x => x.l4 && x.l4 === y.l4) || (!sameCard && c.length === 1 ? c[0] : null);
          if (x) { matches.push({ d: [x], t: [y], how: 'tip' }); tips.push({ x, y }); du.delete(x); tu.delete(y); }
        }
      };
      pass(true); tipPass(true); pass(false); tipPass(false);
      // Other-night completions left unmatched are not counted; they are listed for information.
      const otherNight = [...tu].filter(y => y.offBatch);
      if (otherNight.length) { otherNight.forEach(y => tu.delete(y)); counted = counted.filter(y => !y.offBatch || !otherNight.includes(y)); tTot = counted.reduce((a, r) => a + r.amt, 0); }
      const offsets = [];
      for (const x of [...du]) {
        if (!du.has(x) || x.amt <= 0) continue;
        const y = [...du].find(z => z !== x && cents(z.amt) === -cents(x.amt) && ((x.ref && z.ref === x.ref) || (!x.ref && z.room === x.room)));
        if (y) { offsets.push({ side: 'Opera', a: x, b: y }); du.delete(x); du.delete(y); }
      }
      for (const x of [...tu]) {
        if (!tu.has(x) || x.amt <= 0) continue;
        const y = [...tu].find(z => z !== x && cents(z.amt) === -cents(x.amt) && z.l4 === x.l4);
        if (y) { offsets.push({ side: 'Terminal', a: x, b: y }); tu.delete(x); tu.delete(y); }
      }
      for (const y of [...tu]) {
        const ds = [...du]; let hit = null;
        for (let i = 0; i < ds.length && !hit; i++) for (let j = i + 1; j < ds.length; j++) if (cents(ds[i].amt) + cents(ds[j].amt) === cents(y.amt)) { hit = [ds[i], ds[j]]; break; }
        if (hit) { matches.push({ d: hit, t: [y], how: 'split' }); hit.forEach(z => du.delete(z)); tu.delete(y); }
      }
      for (const x of [...du]) {
        const ts = [...tu]; let hit = null;
        for (let i = 0; i < ts.length && !hit; i++) for (let j = i + 1; j < ts.length; j++) if (cents(ts[i].amt) + cents(ts[j].amt) === cents(x.amt)) { hit = [ts[i], ts[j]]; break; }
        if (hit) { matches.push({ d: [x], t: hit, how: 'split' }); hit.forEach(z => tu.delete(z)); du.delete(x); }
      }
      const $ = n => (n < 0 ? '-' : '') + '$' + Math.abs(n).toFixed(2);
      const ex = [];
      for (const y of tu) {
        let kind = 'terminal', hint = 'Charged on the terminal, not posted in Opera.';
        if (cents(y.amt) === 0) hint = '$0.00 sale. Check what should have been charged.';
        else if (y.amt < 0) hint = 'Refunded on the terminal, no refund in Opera.';
        else { const tw = counted.find(z => z !== y && z.l4 === y.l4 && cents(z.amt) === cents(y.amt)); if (tw) { kind = 'double'; hint = `Same card charged twice (also ${tw.time}, ${tw.tn}). Opera has it once.`; } }
        ex.push({ kind, effect: y.amt, row: y, hint });
      }
      let unverifiable = 0;
      for (const x of du) {
        const pb = x.by ? ` by ${x.by}` : '';
        let kind = 'opera', hint = x.amt < 0 ? `Refund posted in Opera${pb}, no refund on any terminal.` : `Posted in Opera${pb}, no card transaction found.`;
        const dec = declined[dept].find(z => Math.abs(cents(z.amt)) === Math.abs(cents(x.amt)));
        if (dec) { kind = 'declined'; hint = `${x.amt < 0 ? 'Refund' : 'Sale'} declined on ${dec.tn} at ${dec.time}, never approved, but posted in Opera${pb}.`; }
        else if (preauthStyle && dept === 'FO' && x.amt > 0) { kind = "missing"; hint = `Not in this export. Likely a check-out with a pre-auth before ${startTxt}.${x.by ? " Posted by " + x.by + "." : ""}`; unverifiable += x.amt; }
        ex.push({ kind, effect: -x.amt, row: x, hint });
      }
      for (const { x, y } of tips) ex.push({ kind: 'tip', effect: y.amt - x.amt, row: y, pair: x, hint: `Tip of ${$(y.grat)} charged on the terminal. Opera has the bill without it (${$(x.amt)}${x.by ? ', posted by ' + x.by : ''}). Post the tip in Opera.` });
      for (const y of dupRows) ex.push({ kind: 'dup', effect: 0, row: y, hint: `Export shows this completion twice (also ${y.dupOf.time}, ${y.dupOf.tn}). Counted once.` });
      ex.sort((a, b) => (a.kind === 'missing') - (b.kind === 'missing') || Math.abs(b.effect) - Math.abs(a.effect));

      const terms = [...new Set(counted.map(r => r.term))].sort();
      const sheet = {}; for (const ty of TYPES) sheet[ty] = { t: {}, tt: 0, op: 0 };
      for (const r of counted) { sheet[r.type] = sheet[r.type] || { t: {}, tt: 0, op: 0 }; sheet[r.type].t[r.term] = (sheet[r.type].t[r.term] || 0) + r.amt; sheet[r.type].tt += r.amt; }
      for (const x of d) { const ty = codeType(x.code); sheet[ty] = sheet[ty] || { t: {}, tt: 0, op: 0 }; sheet[ty].op += x.amt; }
      const termTot = {}; for (const r of counted) termTot[r.term] = (termTot[r.term] || 0) + r.amt;
      const termOrg = {}; for (const r of counted) termOrg[r.term] = r.org;
      const termName = {}; for (const r of counted) termName[r.term] = r.tn;
      terms.sort((a, b) => String(termName[a]).localeCompare(String(termName[b]), undefined, { numeric: true }));
      const wrong = [];
      for (const m of matches) { if (m.d.length !== 1 || m.t.length !== 1) continue; const x = m.d[0], y = m.t[0]; const ot = codeType(x.code); if (ot !== y.type) wrong.push({ x, y, from: ot, to: y.type, toCode: codeFor(dept, y.type) }); }
      const pdfFile = pdfFiles.find(f => f.rows.some(r => r.dept === dept));
      // Matches that balance only on amount: different card numbers, or two items against one.
      // Two separate mistakes can cancel out this way, so they are listed to check, not hidden.
      const checks = matches.filter(m => m.how === 'split' || (m.how === 'amount' && m.d[0].l4 && m.t[0].l4 && m.d[0].l4 !== m.t[0].l4))
        .map(m => ({ ...m, why: m.how === 'split' ? (m.d.length > 1 ? 'Two Opera postings add up to one card charge' : 'Two card charges add up to one Opera posting') : `Same amount, different cards (Opera ••${m.d[0].l4}${m.d[0].by ? ', posted by ' + m.d[0].by : ''}; terminal ••${m.t[0].l4})` }));
      const tbx = basis === 'batch' ? tBatch[dept] : null;
      const batchNote = tbx && batchSet.size && !batchFound(tbx) ? `No row in this export has batch ${tbx}, so sales were counted by transaction date (${bdate[dept]}) instead. Check the batch in Settings if this is wrong.` : '';
      out[dept] = {
        dept, bd: bdate[dept], tBatch: tbx && !batchNote ? tbx : null, tTot, dTot, variance: tTot - dTot,
        checkable: preauthStyle && dept === 'FO' && unverifiable ? (tTot - dTot) + unverifiable : null,
        warn: [preauthStyle && dept === 'FO' ? `This export files check-outs under their pre-auth date and starts ${startTxt}. Check-outs with older pre-auths are missing. Export by settlement batch for a full check.` : '', batchNote].filter(Boolean).join(' '),
        checks, otherNight, nonCard: nonCard[dept],
        grandOk: pdfFile ? pdfFile.grandOk : true,
        tCount: counted.length, dCount: d.length, terms, termTot, termOrg, termName, sheet, wrong, matches, offsets, ex, dupRows, ignored: ignored[dept],
        // Charges taken on the other department's terminals and counted here, with the Opera posting they matched.
        crossIn: matches.flatMap(m => m.t.filter(y => y.home !== dept).map(y => ({ t: y, d: m.d[0] }))).concat(ex.filter(e => e.row.side === 'T' && e.row.home !== dept).map(e => ({ t: e.row, d: null })))
      };
      // Unexplained items the cross-department pass can try to pair (only charges on this department's own terminals).
      left.T[dept] = ex.filter(e => (e.kind === 'terminal' || e.kind === 'double') && e.row.home === dept).map(e => e.row);
      left.D[dept] = ex.filter(e => e.kind === 'opera' || e.kind === 'missing').map(e => e.row);
    }
    return { out, left };
  }

  // A department's terminal is sometimes used for the other department's guest (e.g. a room bill paid
  // on an F&B terminal and posted in Opera FO). Pair "Not on terminal" Opera items with unexplained
  // charges on the other department's terminals, count those charges where they were posted, and run again.
  // Strict: same amount and same card last 4. Without a last 4 in Opera, the card type must match and it
  // must be the only charge of that amount.
  function reconcile(opts) {
    const first = reconcileOnce(opts);
    const moves = {};
    if (opts.cross !== false) {
      for (const [A, B] of [['FO', 'F&B'], ['F&B', 'FO']]) {
        for (const x of first.left.D[A] || []) {
          const same = (first.left.T[B] || []).filter(y => !moves[y.key] && cents(y.amt) === cents(x.amt) && cents(y.amt) !== 0);
          let hit = x.l4 ? same.filter(y => y.l4 === x.l4) : (same.length === 1 && same[0].type === codeType(x.code) ? same : []);
          if (!hit.length) continue;
          hit.sort((a, b) => Math.abs(mins(a.time) - mins(x.time)) - Math.abs(mins(b.time) - mins(x.time)));
          moves[hit[0].key] = A;
        }
      }
    }
    const out = Object.keys(moves).length ? reconcileOnce(opts, moves).out : first.out;
    for (const dept of ['FO', 'F&B']) {
      const r = out[dept]; if (!r || r.skip) continue;
      const other = out[dept === 'FO' ? 'F&B' : 'FO'];
      // Charges on this department's terminals that belong to the other department (shown for information).
      r.crossOut = other && !other.skip ? other.crossIn.filter(c => c.t.home === dept) : [];
    }
    return out;
  }

  return { withBuiltIn, isTermSheet, parseTermSheet, terminals, num, cents, parseCSV, pdfLines, parseD140, reconcile, merchants, batches, termRows, TYPES, codeType, codeFor, cardType };
})();
