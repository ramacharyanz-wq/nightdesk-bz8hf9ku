/* Card Recon PDF report (jsPDF + autotable) */
const Report = (() => {
  const clean = t => String(t ?? '').replace(/−/g, '-').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[^\x00-\xFF]/g, '');
  const pm = n => (n < -0.004 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pn = n => Math.abs(n) < 0.005 ? '' : (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pn0 = n => Math.abs(n) < 0.005 ? '0.00' : (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cents = n => Math.round(n * 100);
  const KIND = { terminal: 'On terminal, not in Opera', double: 'Double charge', opera: 'In Opera, not on terminal', declined: 'Declined on terminal', missing: 'Not in export (cannot check)', tip: 'Tip not in Opera', dup: 'Shown twice in export' };

  // Logo: two overlapping rounded squares, the matched area in amber.
  function logo(doc, x, y, s, NAVY, AMB) {
    const k = s / 512;
    doc.setFillColor(36, 52, 92); doc.roundedRect(x, y, s, s, 112 * k, 112 * k, 'F');
    doc.setLineWidth(26 * k);
    doc.setDrawColor(244, 245, 240); doc.roundedRect(x + 120 * k, y + 120 * k, 196 * k, 196 * k, 44 * k, 44 * k, 'S');
    doc.setDrawColor(130, 142, 166); doc.roundedRect(x + 196 * k, y + 196 * k, 196 * k, 196 * k, 44 * k, 44 * k, 'S');
    doc.setFillColor(...AMB); doc.roundedRect(x + 196 * k, y + 196 * k, 120 * k, 120 * k, 18 * k, 18 * k, 'F');
  }
  function build(res, meta = {}) {
    const { jsPDF } = window.jspdf; const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 36;
    const NAVY = [18, 29, 51], INK = [20, 32, 58], MUTE = [90, 104, 134], AMB = [255, 200, 97], SKY = [61, 99, 216], LINE = [217, 224, 238], SOFT = [244, 246, 251], RED = [210, 59, 59], GRN = [17, 144, 90], REDS = [252, 232, 232], GRNS = [226, 244, 235], ORG = [204, 74, 0];
    // Variance colour: terminals more than Opera = orange, less = red, nil = green
    const OVR = [204, 74, 0], OVRS = [255, 231, 217];
    const vcol = v => cents(v) === 0 ? GRN : v > 0 ? OVR : RED, vsoft = v => cents(v) === 0 ? GRNS : v > 0 ? OVRS : REDS;
    const depts = Object.entries(res).filter(([, r]) => !r.skip);
    const bd = depts[0]?.[1].bd;
    const dayTxt = bd ? new Date(bd + 'T12:00:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const batch = depts.map(([, r]) => r.tBatch).find(Boolean);
    const gen = new Date().toLocaleString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const table = o => { doc.autoTable(Object.assign({ margin: { left: M, right: M, top: 76, bottom: 46 }, theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.2, cellPadding: { top: 4.5, bottom: 4.5, left: 6, right: 6 }, textColor: INK, lineColor: LINE, lineWidth: 0.5, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 7.8 }, alternateRowStyles: { fillColor: [250, 251, 253] } }, o)); return doc.lastAutoTable.finalY; };
    const h2 = (t, y) => { doc.setFillColor(...AMB); doc.rect(M, y - 9, 3, 12, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...INK); doc.text(clean(t), M + 10, y); return y + 10; };
    const note = (t, y) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTE); const ls = doc.splitTextToSize(clean(t), W - 2 * M); doc.text(ls, M, y); return y + ls.length * 11; };
    const need = (y, h) => { if (y + h > H - 50) { doc.addPage(); return 96; } return y; };

    /* page 1 */
    let y = 104;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...INK); doc.text('Card Reconciliation', M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...MUTE);
    doc.text(clean(`${dayTxt}${batch ? '   |   Batch ' + batch : ''}`), M, y + 19);
    y += 42;
    const cw = (W - 2 * M - 18) / 2, ch = 168;
    depts.forEach(([dept, r], i) => {
      const x = M + i * (cw + 18), top = y, nil = cents(r.variance) === 0;
      doc.setFillColor(...SOFT); doc.roundedRect(x, top, cw, ch, 8, 8, 'F');
      doc.setFillColor(...vcol(r.variance)); doc.roundedRect(x, top, 6, ch, 3, 3, 'F'); doc.rect(x + 3, top, 3, ch, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...INK); doc.text(dept === 'FO' ? 'Front Office' : 'Food & Beverage', x + 22, top + 30);
      const pill = nil ? 'BALANCED' : 'OUT ' + pm(r.variance); doc.setFontSize(8.5); const pw = doc.getTextWidth(pill) + 20;
      doc.setFillColor(...vsoft(r.variance)); doc.roundedRect(x + cw - 18 - pw, top + 16, pw, 19, 9.5, 9.5, 'F'); doc.setTextColor(...vcol(r.variance)); doc.text(pill, x + cw - 18 - pw / 2, top + 28.5, { align: 'center' });
      const fw = (cw - 40) / 3;
      const fig = (k, v, cx, col) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTE); doc.text(k, cx, top + 60); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...(col || INK)); doc.text(v, cx, top + 80); };
      fig('Terminals', pm(r.tTot), x + 22); fig('Opera D140', pm(r.dTot), x + 22 + fw); fig('Variance', nil ? '0.00' : pm(r.variance), x + 22 + 2 * fw, vcol(r.variance));
      doc.setDrawColor(...LINE); doc.setLineWidth(0.8); doc.line(x + 22, top + 96, x + cw - 18, top + 96);
      const fix = r.ex.filter(e => e.kind !== 'dup' && e.kind !== 'missing').length;
      const nck = (r.checks || []).length; const pts = [`${fix} item${fix === 1 ? '' : 's'} to fix${nck ? `, ${nck} to check (balance on amount only)` : ''}`, `${r.wrong.length} posting${r.wrong.length === 1 ? '' : 's'} on the wrong card code`, `${r.matches.length} matched transactions${(r.crossIn || []).length + (r.crossOut || []).length ? `, ${(r.crossIn || []).length + (r.crossOut || []).length} on the other department's terminal` : ''}`];
      if (r.checkable !== null) pts.push(`Checkable variance ${pm(r.checkable)} (export incomplete)`);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.2); doc.setTextColor(...INK);
      pts.forEach((t, j) => { const py = top + 114 + j * 14; doc.setFillColor(...AMB); doc.circle(x + 26, py - 3, 2, 'F'); doc.text(clean(t), x + 34, py); });
    });
    y += ch + 34;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...INK); doc.text('Sign-off', M, y); y += 8;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTE); doc.text('Comments', M, y + 16);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.6); doc.line(M + 52, y + 17, W - M, y + 17); doc.line(M, y + 38, W - M, y + 38); y += 72;
    const sw = (W - 2 * M - 40) / 3;
    ['Night Auditor', 'Night Manager', 'Rooms Division Manager'].forEach((t, i) => { const sx = M + i * (sw + 20); doc.setDrawColor(...INK); doc.line(sx, y, sx + sw, y); doc.setFontSize(8); doc.setTextColor(...MUTE); doc.text(t, sx, y + 12); doc.text('Signature / date', sx + sw, y + 12, { align: 'right' }); });

    /* department pages */
    for (const [dept, r] of depts) {
      doc.addPage(); let y = 98;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...INK); doc.text(dept === 'FO' ? 'Front Office' : 'Food & Beverage', M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...MUTE);
      doc.text(clean(`Terminals ${pm(r.tTot)}    Opera D140 ${pm(r.dTot)}    Variance ${cents(r.variance) === 0 ? 'NIL' : pm(r.variance)}`), M, y + 16);
      y += 38;
      if (r.warn) { doc.setFontSize(8.5); const ls = doc.splitTextToSize(clean(r.warn), W - 2 * M - 24); const bh = ls.length * 11 + 14; doc.setFillColor(255, 236, 224); doc.roundedRect(M, y - 10, W - 2 * M, bh, 4, 4, 'F'); doc.setTextColor(...ORG); doc.text(ls, M + 12, y + 2); y += bh + 14; }
      y = h2('Recon sheet', y) + 4;
      const types = Object.keys(r.sheet).filter(ty => ['EFTPOS', 'MC', 'VISA', 'Union Pay', 'Amex', 'AliPay & WeChat', 'JCB'].includes(ty) || r.sheet[ty].tt || r.sheet[ty].op);
      const body = types.map(ty => { const o = r.sheet[ty]; return [ty, Engine.codeFor(dept, ty), ...r.terms.map(t => pn(o.t[t] || 0)), pn0(o.tt), pn0(o.op), pn0(o.tt - o.op)]; });
      body.push(['TOTAL', '', ...r.terms.map(t => pn0(r.termTot[t] || 0)), pn0(r.tTot), pn0(r.dTot), pn0(r.variance)]);
      const nc = 2 + r.terms.length + 3; const cs = { 0: { fontStyle: 'bold', cellWidth: 96 }, 1: { cellWidth: 52 } }; for (let i = 2; i < nc; i++) cs[i] = { halign: 'right' };
      y = table({ startY: y, head: [['Card type', 'Code', ...r.terms.map(t => clean((r.termName && r.termName[t]) || "Terminal " + t)), "Terminals", "Opera D140", "Variance"]], body, columnStyles: cs,
        didParseCell: d => { if (d.section !== 'body') return; if (d.row.index === body.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = SOFT; } if (d.column.index === nc - 1 && d.cell.raw !== "0.00") { const rv = d.row.index === body.length - 1 ? r.variance : r.sheet[types[d.row.index]].tt - r.sheet[types[d.row.index]].op; d.cell.styles.textColor = vcol(rv); d.cell.styles.fontStyle = 'bold'; } } });
      if (r.wrong.length) y = note('Card-type differences come from postings on the wrong card code. They cancel out in the total.', y + 14);
      y = need(y + 20, 80);
      const fixes = r.ex.filter(e => e.kind !== 'dup' && e.kind !== 'missing'), rest = r.ex.filter(e => e.kind === 'dup' || e.kind === 'missing');
      const exTable = (list, y) => table({ startY: y, head: [['#', 'What', 'Amount', 'Effect', 'Terminal', 'D140', 'Action']],
        body: list.map((e, i) => { const x = e.row, T = x.side === 'T'; return [i + 1, KIND[e.kind], pm(x.amt), e.kind === 'dup' ? 'none' : pm(e.effect),
          T ? clean(`${x.tn || x.term}\n${x.time}  ${x.type} ..${x.l4}\nRRN ${x.rrn}`) : '-', T ? (e.pair ? clean(`Page ${e.pair.page}  Room ${e.pair.room}\n${e.pair.name}\nPosted ${e.pair.amt.toFixed(2)}`) : '-') : clean(`Page ${x.page}  Room ${x.room}\n${x.name}${x.receipt ? '\n#' + x.receipt : ''}\n${x.code} ${Engine.codeType(x.code)}`), clean(e.hint)]; }),
        columnStyles: { 0: { cellWidth: 20, halign: 'center' }, 1: { cellWidth: 96, fontStyle: 'bold' }, 2: { cellWidth: 60, halign: 'right' }, 3: { cellWidth: 56, halign: 'right' }, 4: { cellWidth: 128 }, 5: { cellWidth: 140 } },
        didParseCell: d => { if (d.section === 'body' && d.column.index === 1) { const e = list[d.row.index]; d.cell.styles.textColor = e.kind === "dup" || !cents(e.effect) ? MUTE : vcol(e.effect); } if (d.section === "body" && d.column.index === 3) { const e = list[d.row.index]; if (e.kind !== "dup" && cents(e.effect)) { d.cell.styles.textColor = vcol(e.effect); d.cell.styles.fontStyle = "bold"; } } } });
      y = h2(`To fix (${fixes.length})`, y) + 4;
      y = fixes.length ? exTable(fixes, y) : note('Nothing to fix. Every posting matches a terminal transaction.', y + 8);
      if (rest.length) { y = need(y + 20, 80); y = h2(`Cannot be checked with this export (${rest.length})`, y) + 4; y = exTable(rest, y); }
      const ck = r.checks || [];
      if (ck.length) {
        y = need(y + 20, 80); y = h2(`Check these (${ck.length})`, y) + 4;
        y = note('These balance only on amount. They may be fine, or two separate mistakes that cancel out. Confirm it is the same guest and payment.', y + 8) - 2;
        y = table({ startY: y, head: [['#', 'Why', 'Terminal', 'D140']],
          body: ck.map((m, i) => [i + 1, clean(m.why), clean(m.t.map(t => `${t.tn}  ${t.time}  ${t.type} ..${t.l4}  ${t.amt.toFixed(2)}`).join('\n')), clean(m.d.map(x => `Page ${x.page}  Room ${x.room}  ${x.name}  ${x.code}${x.l4 ? ' ..' + x.l4 : ''}  ${x.amt.toFixed(2)}`).join('\n'))]),
          columnStyles: { 0: { cellWidth: 20, halign: 'center' }, 1: { cellWidth: 170, fontStyle: 'bold', textColor: ORG } } });
      }
      const on = r.otherNight || [], ncp = r.nonCard || [];
      if (on.length) { y = need(y + 20, 60); y = h2(`From another night, not counted (${on.length})`, y) + 4;
        y = table({ startY: y, head: [['Terminal', 'Batch', 'Date / time', 'Card', 'Amount']], body: on.map(t => [clean(t.tn), t.batch || '', `${t.date || ''} ${t.time}`, clean(`${t.type} ..${t.l4}`), pm(t.amt)]), columnStyles: { 4: { halign: 'right' } } }); }
      if (ncp.length) { y = need(y + 20, 60); y = h2(`Not card payments, not checked (${ncp.length})`, y) + 4;
        y = table({ startY: y, head: [['Code', 'Guest', 'Room', 'Page', 'Amount']], body: ncp.map(x => [x.code, clean(x.name), x.room, x.page, pm(x.amt)]), columnStyles: { 4: { halign: 'right' } } }); }
      const xi = r.crossIn || [], xo = r.crossOut || [];
      if (xi.length || xo.length) {
        y = need(y + 20, 80); y = h2(`Used another department's terminal (${xi.length + xo.length})`, y) + 4;
        y = note('Nothing to fix in Opera. Each charge is counted in the department where it was posted.', y + 8) - 2;
        const dn = d => d === 'FO' ? 'Front Office' : 'F&B';
        y = table({ startY: y, head: [['Charged on', 'Card', 'Amount', 'Counted in', 'D140', 'Guest / room']],
          body: xi.concat(xo).map(c => [clean(`${c.t.tn}\n${c.t.org}  ${c.t.time}`), clean(`${c.t.type} ..${c.t.l4}`), pm(c.t.amt), dn(c.t.dept), c.d ? `Page ${c.d.page}${c.d.receipt ? '  #' + c.d.receipt : ''}` : '-', c.d ? clean(`${c.d.name}  Room ${c.d.room}`) : 'No posting matched']),
          columnStyles: { 2: { halign: 'right', fontStyle: 'bold', textColor: SKY } } });
      }
      y = need(y + 20, 80);
      y = h2(`Wrong card code (${r.wrong.length})`, y) + 4;
      y = r.wrong.length ? table({ startY: y, head: [['#', 'Guest', 'Room', 'Page', 'Receipt', 'Amount', 'Posted on', 'Card used', 'Terminal', 'Move to']],
        body: r.wrong.map((w, i) => [i + 1, clean(w.x.name), w.x.room, w.x.page, w.x.receipt ? '#' + w.x.receipt : clean(w.x.ref), pm(w.x.amt), `${w.x.code} ${w.from}`, `${w.to} ..${w.y.l4}`, `${(w.y.tn || w.y.term)}  ${w.y.time}`, `${w.toCode} ${w.to}`]),
        columnStyles: { 0: { cellWidth: 20, halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 5: { halign: 'right' }, 9: { fontStyle: 'bold', textColor: SKY } } }) : note('None.', y + 8);
      if (r.offsets.length) { y = need(y + 20, 60); y = h2('Cancel out, no effect', y) + 4;
        table({ startY: y, head: [['Where', 'Guest / card', 'Amounts', 'Find it']], body: r.offsets.map(o => [o.side, clean(o.side === 'Opera' ? `${o.a.name}  Room ${o.a.room}` : `${o.a.type} ..${o.a.l4}`), `${pm(o.a.amt)} / ${pm(o.b.amt)}`, o.side === 'Opera' ? `Page ${o.a.page} at ${o.a.time}, ${o.b.time}` : `${(o.a.tn || o.a.term)} ${o.a.time}, ${(o.b.tn || o.b.term)} ${o.b.time}`]), columnStyles: { 2: { halign: 'right' } } }); }
    }
    /* header + footer */
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFillColor(...NAVY); doc.rect(0, 0, W, 48, 'F'); doc.setFillColor(...AMB); doc.rect(0, 48, W, 3, 'F');
      logo(doc, M, 11, 26, NAVY, AMB);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255); doc.text('Card Recon', M + 34, 28.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(200, 210, 230); doc.text(clean(`Night audit   |   ${bd ? new Date(bd + 'T12:00:00').toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}`), W - M, 28.5, { align: 'right' });
      doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(M, H - 32, W - M, H - 32);
      doc.setFontSize(7.5); doc.setTextColor(...MUTE); doc.text(clean(`Generated ${gen}   |   Payment gateway export vs Opera D140   |   Developed by Ram`), M, H - 20); doc.text(`Page ${i} of ${n}`, W - M, H - 20, { align: 'right' });
    }
    return { doc, name: `Card-Recon-${bd || 'report'}.pdf` };
  }
  return { build };
})();
