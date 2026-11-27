/* Card Recon PDF report (jsPDF + autotable)
   Style: one typeface (Helvetica), small sizes, straight lines only (no rounded boxes, pills or bullets),
   dark grey text, one accent colour for differences (red) and green only for the BALANCED status. */
const Report = (() => {
  const clean = t => String(t ?? '').replace(/−/g, '-').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[^\x00-\xFF]/g, '');
  const pm = n => (n < -0.004 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pn = n => Math.abs(n) < 0.005 ? '' : (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pn0 = n => Math.abs(n) < 0.005 ? '0.00' : (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cents = n => Math.round(n * 100);
  const KIND = { terminal: 'On terminal, not in Opera', double: 'Double charge', opera: 'In Opera, not on terminal', declined: 'Declined on terminal', missing: 'Not in export (cannot check)', tip: 'Tip not in Opera', dup: 'Shown twice in export', prior: 'Posted a day late', amount: 'Wrong amount (same card, same time)', correction: 'Correction in Opera' };
  const kindOf = e => e.late ? (e.kind === 'amount' ? 'Corrected later (later D140)' : e.row.side === 'T' ? 'Posted late (later D140)' : 'Reversed later (later D140)') : KIND[e.kind];
  const sd = b => b ? new Date(b + 'T12:00:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }) : '';

  // Logo: two overlapping rounded squares, the matched area in amber.
  function logo(doc, x, y, s) {
    const k = s / 512;
    doc.setFillColor(36, 52, 92); doc.roundedRect(x, y, s, s, 112 * k, 112 * k, 'F');
    doc.setLineWidth(26 * k);
    doc.setDrawColor(244, 245, 240); doc.roundedRect(x + 120 * k, y + 120 * k, 196 * k, 196 * k, 44 * k, 44 * k, 'S');
    doc.setDrawColor(130, 142, 166); doc.roundedRect(x + 196 * k, y + 196 * k, 196 * k, 196 * k, 44 * k, 44 * k, 'S');
    doc.setFillColor(255, 200, 97); doc.roundedRect(x + 196 * k, y + 196 * k, 120 * k, 120 * k, 18 * k, 18 * k, 'F');
  }
  function build(res, meta = {}) {
    const { jsPDF } = window.jspdf; const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 36;
    const INK = [28, 32, 38], MUTE = [110, 116, 126], LINE = [222, 225, 230], RULE = [150, 156, 166], HEAD = [243, 244, 246], RED = [176, 32, 32], REDS = [251, 240, 240], GRN = [22, 110, 60];
    // Red marks money still unexplained (r.variance); explained or nil amounts stay plain text.
    const vcol = v => cents(v) === 0 ? INK : RED;
    const TOP = 62, BOTTOM = 44;   // content area between the page header and footer
    const depts = Object.entries(res).filter(([, r]) => !r.skip);
    const bd = depts[0]?.[1].bd;
    const dayTxt = bd ? new Date(bd + 'T12:00:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const batch = depts.map(([, r]) => r.tBatch).find(Boolean);
    const gen = new Date().toLocaleString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const font = (size, style = 'normal', col = INK) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...col); };

    // Tables: light header, horizontal rules only, rows never split across pages, headings aligned like their column.
    const table = o => {
      const cs = o.columnStyles || {}, user = o.didParseCell;
      doc.autoTable(Object.assign({}, o, {
        margin: { left: M, right: M, top: TOP, bottom: BOTTOM }, theme: 'plain', rowPageBreak: 'avoid',
        styles: { font: 'helvetica', fontSize: 7.6, cellPadding: { top: 3.6, bottom: 3.6, left: 4, right: 4 }, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.4 }, overflow: 'linebreak', valign: 'top' },
        headStyles: { fillColor: HEAD, textColor: INK, fontStyle: 'bold', fontSize: 7.2, lineColor: RULE, lineWidth: { bottom: 0.7 }, valign: 'bottom' },
        didParseCell: d => { if (d.section === 'head' && cs[d.column.index]?.halign) d.cell.styles.halign = cs[d.column.index].halign; if (user) user(d); }
      }));
      return doc.lastAutoTable.finalY;
    };
    const NUM = { cellWidth: 22, halign: 'right' };   // the "#" column
    const h2 = (t, y) => { font(10, 'bold'); doc.text(clean(t), M, y); return y + 7; };
    const note = (t, y) => { font(7.8, 'normal', MUTE); const ls = doc.splitTextToSize(clean(t), W - 2 * M); doc.text(ls, M, y); return y + ls.length * 10; };
    const need = (y, h) => { if (y + h > H - BOTTOM - 4) { doc.addPage(); return TOP + 12; } return y; };
    const box = (t, y, col, fill) => { font(7.8, 'normal', col); const ls = doc.splitTextToSize(clean(t), W - 2 * M - 20); const bh = ls.length * 10 + 10; doc.setFillColor(...fill); doc.rect(M, y, W - 2 * M, bh, 'F'); doc.setFillColor(...col); doc.rect(M, y, 1.5, bh, 'F'); doc.text(ls, M + 10, y + 13); return y + bh + 12; };
    const statusOf = r => r.trust && !r.trust.ok ? ['CHECK FILES - NOT RELIABLE', RED] : cents(r.variance) === 0 ? ['BALANCED' + (cents(r.xNet || 0) ? ' WITH VARIANCE ' + pm(r.xNet) : ''), GRN] : ['OUT ' + pm(r.variance), RED];

    /* page 1: summary */
    let y = TOP + 18;
    font(16, 'bold'); doc.text('Card Reconciliation', M, y);
    font(9, 'normal', MUTE); doc.text(clean(`${dayTxt}${batch ? '   |   Batch ' + batch : ''}`), M, y + 15);
    y += 40;
    const cw = (W - 2 * M - 28) / 2;
    const ptsOf = r => {
      const fix = r.ex.filter(e => e.kind !== 'dup' && e.kind !== 'missing' && !e.settled).length, nck = (r.checks || []).length, nx = (r.crossIn || []).length + (r.crossOut || []).length;
      const pts = [];
      if (cents(r.xNet || 0)) pts.push(`Other department's charges ${pm(r.xNet)}; still open ${pm(r.variance)}`);
      pts.push(`${fix} item${fix === 1 ? '' : 's'} to fix${nck ? `, ${nck} to check (balance on amount only)` : ''}`);
      pts.push(`${r.wrong.length} posting${r.wrong.length === 1 ? '' : 's'} on the wrong card code`);
      pts.push(`${r.matches.length} matched transactions${nx ? `, ${nx} on the other department's terminal` : ''}`);
      if ((r.followUp || []).length && cents(r.cleared)) pts.push(`${pm(r.cleared)} posted or reversed later; still open ${pm(r.variance - r.cleared)}`);
      if ((r.completedLater || []).length) pts.push(`${r.completedLater.length} pre-auths completed after this date, not counted`);
      if (r.checkable !== null) pts.push(`Checkable variance ${pm(r.checkable)} (export incomplete)`);
      return pts;
    };
    const maxPts = Math.max(1, ...depts.map(([, r]) => ptsOf(r).length));
    depts.forEach(([dept, r], i) => {
      const x = M + i * (cw + 28), top = y, [st, sc] = statusOf(r);
      doc.setDrawColor(...INK); doc.setLineWidth(1); doc.line(x, top, x + cw, top);
      font(10.5, 'bold'); doc.text(dept === 'FO' ? 'Front Office' : 'Food & Beverage', x, top + 16);
      font(7.8, 'bold', sc); doc.text(clean(st), x + cw, top + 16, { align: 'right' });
      const xv = r.variance + (r.xNet || 0), fw = cw / 3;
      [['Terminals', pm(r.tTot + (r.xNet || 0)), INK], ['Opera D140', pm(r.dTot), INK], ['Variance', cents(xv) ? pm(xv) : '0.00', vcol(r.variance)]].forEach(([k, v, c], j) => {
        font(7.4, 'normal', MUTE); doc.text(k, x + j * fw, top + 36);
        font(12, 'bold', c); doc.text(v, x + j * fw, top + 51);
      });
      doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(x, top + 62, x + cw, top + 62);
      font(8.2); ptsOf(r).forEach((t, j) => doc.text(clean(t), x, top + 77 + j * 12));
    });
    y += 77 + maxPts * 12 + 22;
    font(10, 'bold'); doc.text('Sign-off', M, y);
    font(7.8, 'normal', MUTE); doc.text('Comments', M, y + 20);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(M + 48, y + 21, W - M, y + 21); doc.line(M, y + 42, W - M, y + 42);
    y += 86;
    const sw = (W - 2 * M - 40) / 3;
    ['Night Auditor', 'Night Manager', 'Rooms Division Manager'].forEach((t, i) => { const sx = M + i * (sw + 20); doc.setDrawColor(...RULE); doc.setLineWidth(0.6); doc.line(sx, y, sx + sw, y); font(7.4, 'normal', MUTE); doc.text(t, sx, y + 11); doc.text('Signature / date', sx + sw, y + 11, { align: 'right' }); });

    /* department pages */
    for (const [dept, r] of depts) {
      doc.addPage(); let y = TOP + 16;
      const [st, sc] = statusOf(r), xv = r.variance + (r.xNet || 0);
      font(13, 'bold'); doc.text(dept === 'FO' ? 'Front Office' : 'Food & Beverage', M, y);
      font(7.8, 'bold', sc); doc.text(clean(st), W - M, y, { align: 'right' });
      font(8.2, 'normal', MUTE);
      doc.text(clean(`Terminals ${pm(r.tTot + (r.xNet || 0))}     Opera D140 ${pm(r.dTot)}     Variance ${cents(xv) === 0 ? 'nil' : pm(xv)}${cents(r.xNet || 0) ? `     Other department ${pm(r.xNet)}     Still open ${cents(r.variance) === 0 ? 'nil' : pm(r.variance)}` : ''}`), M, y + 14);
      y += 34;
      if (r.trust && !r.trust.ok) y = box("This result can't be trusted yet. " + r.trust.reasons.join(' '), y, RED, REDS);
      if (r.warn) y = box(r.warn, y, INK, HEAD);
      y = h2('Recon sheet', y + 4);
      const types = Object.keys(r.sheet).filter(ty => ['EFTPOS', 'MC', 'VISA', 'Union Pay', 'Amex', 'AliPay & WeChat', 'JCB'].includes(ty) || r.sheet[ty].tt || r.sheet[ty].op);
      const body = types.map(ty => { const o = r.sheet[ty]; return [ty, Engine.codeFor(dept, ty), ...r.terms.map(t => pn(o.t[t] || 0)), pn0(o.tt), pn0(o.op), pn0(o.tt - o.op)]; });
      body.push(['Total', '', ...r.terms.map(t => pn0(r.termTot[t] || 0)), pn0(r.tTot + (r.xNet || 0)), pn0(r.dTot), pn0(xv)]);
      const nc = 2 + r.terms.length + 3; const cs = { 0: { cellWidth: 92 }, 1: { cellWidth: 46 } }; for (let i = 2; i < nc; i++) cs[i] = { halign: 'right' };
      y = table({ startY: y, head: [['Card type', 'Code', ...r.terms.map(t => clean((r.termName && r.termName[t]) || "Terminal " + t)), "Terminals", "Opera D140", "Variance"]], body, columnStyles: cs,
        didParseCell: d => { if (d.section !== 'body' || d.row.index !== body.length - 1) return; d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = HEAD; d.cell.styles.lineWidth = { top: 0.7, bottom: 0.7 }; d.cell.styles.lineColor = RULE; if (d.column.index === nc - 1) d.cell.styles.textColor = vcol(r.variance); } });
      if (r.wrong.length) y = note('Card-type differences come from postings on the wrong card code. They cancel out in the total.', y + 11) - 10;
      const fixes = r.ex.filter(e => e.kind !== 'dup' && e.kind !== 'missing' && !e.settled), rest = r.ex.filter(e => (e.kind === 'dup' || e.kind === 'missing') && !e.settled), late = r.ex.filter(e => e.settled);
      const where = (p, pre = '') => clean(`${pre}Page ${p.page}  Rm ${p.room}\n${p.name}`);
      const exTable = (list, y) => table({ startY: y, head: [['#', 'What', 'Amount', 'Effect', 'Terminal', 'D140', 'Action']],
        body: list.map((e, i) => { const x = e.row, T = x.side === 'T'; const P = e.pair || (T ? e.late : null); return [i + 1, kindOf(e), pm(x.amt), e.kind === 'dup' ? 'none' : pm(e.effect),
          T ? clean(`${x.tn || x.term}\n${x.time}  ${x.type} ..${x.l4}\nRRN ${x.rrn}`) : '-',
          T ? (P ? where(P, P.bd ? sd(P.bd) + ' D140  ' : '') + clean(`\nPosted ${P.amt.toFixed(2)}${P.by ? ' by ' + P.by : ''}`) : '-') : where(x) + clean(`${x.receipt ? '\n#' + x.receipt : ''}\n${x.code} ${Engine.codeType(x.code)}${x.by ? '\nby ' + x.by : ''}`), clean(e.hint)]; }),
        columnStyles: { 0: NUM, 1: { cellWidth: 104, fontStyle: 'bold' }, 2: { cellWidth: 58, halign: 'right' }, 3: { cellWidth: 56, halign: 'right' }, 4: { cellWidth: 118 }, 5: { cellWidth: 132 } },
        didParseCell: d => { if (d.section !== 'body') return; const e = list[d.row.index]; if (d.column.index === 1 && (e.kind === 'dup' || !cents(e.effect))) d.cell.styles.textColor = MUTE; if (d.column.index === 3 && e.kind !== 'dup' && cents(e.effect)) { d.cell.styles.textColor = RED; d.cell.styles.fontStyle = 'bold'; } } });
      const section = (title, minH = 70) => { y = need(y + 22, minH); y = h2(title, y); };
      const intro = t => { y = note(t, y + 4) - 2; };
      section(`To fix (${fixes.length})`);
      y = fixes.length ? exTable(fixes, y) : note('Nothing to fix. Every posting matches a terminal transaction.', y + 4) - 6;
      if (rest.length) { section(`Cannot be checked with this export (${rest.length})`); y = exTable(rest, y); }
      if (late.length) { section(`Explained, nothing to post (${late.length})`); intro('Still a difference on this night\'s D140, but explained: posted or reversed on another night, or corrected. Nothing to post now.'); y = exTable(late, y); }
      const dl = r.completedLater || [];
      if (dl.length) { section(`Completed after this date, not counted (${dl.length}, ${pm(dl.reduce((a, t) => a + t.amt, 0))})`);
        intro('Pre-auths taken on this date whose amount changed when they were completed later, usually at check-out. The export shows them under the pre-auth\'s date.' + ((r.followUp || []).length ? '' : ' Confirm each on the next D140 or by RRN in the portal.'));
        y = table({ startY: y, head: [['Terminal', 'Time', 'Card', 'RRN', 'Pre-auth', 'Completed', 'Later D140']], body: dl.map(t => [clean(t.tn), t.time, clean(`${t.type} ..${t.l4}`), t.rrn || '', pm(t.orig), pm(t.amt), t.confirm ? clean(`Posted ${sd(t.confirm.bd)} ${t.confirm.time}  Rm ${t.confirm.room}  ${t.confirm.name}`) : 'To confirm']), columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } } }); }
      const ck = r.checks || [];
      if (ck.length) {
        section(`Check these (${ck.length})`); intro('These balance only on amount. They may be fine, or two separate mistakes that cancel out. Confirm it is the same guest and payment.');
        y = table({ startY: y, head: [['#', 'Why', 'Terminal', 'D140']],
          body: ck.map((m, i) => [i + 1, clean(m.why), clean(m.t.map(t => `${t.tn}  ${t.time}  ${t.type} ..${t.l4}  ${t.amt.toFixed(2)}`).join('\n')), clean(m.d.map(x => `Page ${x.page}  Rm ${x.room}  ${x.name}  ${x.code}${x.l4 ? ' ..' + x.l4 : ''}  ${x.amt.toFixed(2)}${x.by ? '  by ' + x.by : ''}`).join('\n'))]),
          columnStyles: { 0: NUM, 1: { cellWidth: 190 } } });
      }
      const on = r.otherNight || [], ncp = r.nonCard || [];
      if (on.length) { section(`From another night, not counted (${on.length})`, 60);
        y = table({ startY: y, head: [['Terminal', 'Batch', 'Date / time', 'Card', 'Amount']], body: on.map(t => [clean(t.tn), t.batch || '', `${t.date || ''} ${t.time}`, clean(`${t.type} ..${t.l4}`), pm(t.amt)]), columnStyles: { 4: { halign: 'right' } } }); }
      if (ncp.length) { section(`Not card payments, not checked (${ncp.length})`, 60);
        y = table({ startY: y, head: [['Code', 'Guest', 'Rm', 'Page', 'Amount']], body: ncp.map(x => [x.code, clean(x.name), x.room, x.page, pm(x.amt)]), columnStyles: { 0: { cellWidth: 60 }, 2: { cellWidth: 60 }, 3: { cellWidth: 50 }, 4: { cellWidth: 80, halign: 'right' } } }); }
      const xi = r.crossIn || [], xo = r.crossOut || [];
      if (xi.length || xo.length) {
        section(`Used another department's terminal (${xi.length + xo.length})`); intro('Nothing to fix in Opera. Each charge is counted in the department where it was posted.');
        const dn = d => d === 'FO' ? 'Front Office' : 'F&B';
        y = table({ startY: y, head: [['Charged on', 'Card', 'Amount', 'Counted in', 'D140', 'Guest / Rm']],
          body: xi.concat(xo).map(c => [clean(`${c.t.tn}  ${c.t.org}  ${c.t.time}`), clean(`${c.t.type} ..${c.t.l4}`), pm(c.t.amt), dn(c.t.dept), c.d ? `Page ${c.d.page}${c.d.receipt ? '  #' + c.d.receipt : ''}` : '-', c.d ? clean(`${c.d.name}  Rm ${c.d.room}`) : 'No posting matched']),
          columnStyles: { 2: { halign: 'right' } } });
      }
      section(`Wrong card code (${r.wrong.length})`);
      y = r.wrong.length ? table({ startY: y, head: [['#', 'Guest', 'Rm', 'Page', 'Receipt', 'Amount', 'Posted on', 'Card used', 'Terminal', 'Move to']],
        body: r.wrong.map((w, i) => [i + 1, clean(w.x.name + (w.x.by ? '\nby ' + w.x.by : '')), w.x.room, w.x.page, w.x.receipt ? '#' + w.x.receipt : clean(w.x.ref), pm(w.x.amt), `${w.x.code} ${w.from}`, `${w.to} ..${w.y.l4}`, `${(w.y.tn || w.y.term)}  ${w.y.time}`, `${w.toCode} ${w.to}`]),
        columnStyles: { 0: NUM, 2: { cellWidth: 40 }, 3: { cellWidth: 34 }, 5: { halign: 'right' }, 9: { fontStyle: 'bold' } } }) : note('None.', y + 6);
      if (r.offsets.length) { section(`Cancel out, no effect (${r.offsets.length})`, 50);
        y = table({ startY: y, head: [['Where', 'Guest / card', 'Amounts', 'Find it']], body: r.offsets.map(o => [o.side, clean(o.side === 'Opera' ? `${o.a.name}  Rm ${o.a.room}` : `${o.a.type} ..${o.a.l4}`), `${pm(o.a.amt)} / ${pm(o.b.amt)}`, o.side === 'Opera' ? `Page ${o.a.page} at ${o.a.time}, ${o.b.time}` : `${(o.a.tn || o.a.term)} ${o.a.time}, ${(o.b.tn || o.b.term)} ${o.b.time}`]), columnStyles: { 2: { halign: 'right' } } }); }
    }
    /* page header + footer */
    const n = doc.getNumberOfPages();
    const dateTxt = bd ? new Date(bd + 'T12:00:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      logo(doc, M, 17, 15);
      font(9, 'bold'); doc.text('Card Recon', M + 21, 28);
      font(7.8, 'normal', MUTE); doc.text(clean(`Night audit   |   ${dateTxt}`), W - M, 28, { align: 'right' });
      doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(M, 38, W - M, 38); doc.line(M, H - 36, W - M, H - 36);
      font(7, 'bold'); doc.text('CONFIDENTIAL - contains guest and card details. Share only with authorised staff in your organisation.', M, H - 25);
      font(7, 'normal', MUTE); doc.text(clean(`Generated ${gen}   |   Payment gateway export vs Opera D140   |   Developed by Ram`), M, H - 15); doc.text(`Page ${i} of ${n}`, W - M, H - 15, { align: 'right' });
    }
    return { doc, name: `Card-Recon-${bd || 'report'}.pdf` };
  }
  return { build };
})();
