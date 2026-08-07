#!/usr/bin/env node
/**
 * Post-processor for us-css-weeklyperformance skill
 * 1. Remove sections 3 (Highlights) and 4 (Next Week Plans)
 * 2. Sort individual channel tables by ticket/volume descending
 * 3. Bilingual performance analysis labels and descriptions
 */

const fs = require('fs');

const args = process.argv.slice(2);
const inputPath  = args[0];
const outputPath = args[1];
const csatArg    = args.indexOf('--csat') !== -1 ? args[args.indexOf('--csat') + 1] : null;

if (!inputPath || !outputPath) {
  console.error('Usage: node postprocess.js <input.html> <output.html> [--csat csat.json]');
  process.exit(1);
}

// Load CSAT data if provided: { agentName: { total, neg, csat } }
let csatData = null;
if (csatArg) {
  try { csatData = JSON.parse(require('fs').readFileSync(csatArg, 'utf8')); }
  catch (e) { console.error(`[WARN] Could not read --csat file: ${e.message}`); }
}

let html = fs.readFileSync(inputPath, 'utf8');

// ── 1. Remove sections 3 and 4 ──────────────────────────────────────────────
html = html.replace(
  /<div class="section" id="三">[\s\S]*?<\/div>\s*<div class="section" id="四">[\s\S]*?<\/div>/,
  ''
);

// ── 2. Sort individual channel tables by first numeric column descending ─────
function sortTableByFirstNumber(tableHtml) {
  const tbodyMatch = tableHtml.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return tableHtml;

  const rows = [...tbodyMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => m[0]);
  rows.sort((a, b) => {
    const getNum = r => {
      const m = r.match(/<td[^>]*>([\d,]+)/);
      return m ? parseInt(m[1].replace(',', '')) : 0;
    };
    return getNum(b) - getNum(a);
  });

  return tableHtml.replace(/<tbody>[\s\S]*?<\/tbody>/, '<tbody>' + rows.join('') + '</tbody>');
}

html = html.replace(/<table[\s\S]*?<\/table>/g, table => {
  // Only sort agent tables (individual breakdown, not team summary)
  if (table.includes('jacelynlim') || table.includes('terrychen')) {
    return sortTableByFirstNumber(table);
  }
  return table;
});

// ── 3. Bilingual performance analysis ────────────────────────────────────────

// Badge labels
html = html.replace(/>异常</g, '>异常 Alert<');
html = html.replace(/>待提升</g, '>Needs Improvement<');

// English label map for metric items: 中文标签 → English
const labelMap = [
  ['在线 30s接通率', 'Live Chat 30s Answer Rate'],
  ['在线满意度',     'Live Chat CSAT'],
  ['在线 FCR',       'Live Chat FCR'],
  ['电话 20s接通率', 'Phone 20s Answer Rate'],
  ['电话满意度',     'Phone CSAT'],
  ['电话 FCR',       'Phone FCR'],
  ['团队 Overall SLA', 'Team Overall SLA'],
];

// Pattern: "LABEL <strong>VALUE</strong>，低于目标 ≥TARGET%"
for (const [zhLabel, enLabel] of labelMap) {
  const escaped = zhLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, ' ');
  const re = new RegExp(
    `(${escaped} <strong>[\\d.]+%<\\/strong>[^<]*)`,
    'g'
  );
  html = html.replace(re, (match) => {
    const enSuffix = match.replace(
      /(<strong>[\d.]+%<\/strong>)，低于目标 ≥(\d+)%/,
      (_, val, target) => `${val}, below target ≥${target}%`
    );
    return `${match}<br><span style="color:#666;font-size:12px">${enLabel} — ${enSuffix.match(/<strong>[\d.]+%<\/strong>[^<]*/)?.[0] || ''}</span>`;
  });
}

// Per-agent items (email SLA, combined CSAT, zero PC)
html = html.replace(
  /(邮件 SLA 未达 90%：[^<]+)/g,
  (m) => `${m}<br><span style="color:#666;font-size:12px">Email SLA below 90%: ${m.replace('邮件 SLA 未达 90%：', '').replace(/、/g, ', ')}</span>`
);

// 综合满意度 (combined CSAT) item removed — CSAT column deleted from Individual Summary
// Remove the entire alert block if present
html = html.replace(
  /<div style="display:flex[^>]+>[^<]*<span[^>]+>(?:异常 Alert|Needs Improvement)<\/span>[^<]*<span[^>]+>综合满意度低于 84%：[\s\S]*?<\/div>/g,
  ''
);

html = html.replace(
  /(本周 PC 为 0：[^<]+)/g,
  (m) => `${m}<br><span style="color:#666;font-size:12px">Weekly PC = 0: ${m.replace('本周 PC 为 0：', '').replace(/、/g, ', ')}</span>`
);

// ── 4. CSAT column in Individual Summary table ────────────────────────────────
// Column order: agent | totalTickets | CSAT% | util% | weeklyPC | monthlyPC
// If --csat JSON provided: inject cross-channel CSAT values.
// Otherwise: remove the column (legacy behavior).
const summaryStart = html.indexOf('Individual Summary');
if (summaryStart !== -1) {
  const tableStart = html.indexOf('<table>', summaryStart);
  const tableEnd = html.indexOf('</table>', tableStart) + '</table>'.length;
  let summaryTable = html.slice(tableStart, tableEnd);

  if (csatData) {
    // Inject cross-channel CSAT: replace each agent row's 3rd <td> value
    summaryTable = summaryTable.replace(
      /<tr><td>([^<]+)<\/td>(<td>[^<]*<\/td>)<td>[^<]*<\/td>/g,
      (match, name, ticketTd) => {
        const d = csatData[name];
        const val = d && d.csat != null ? `${d.csat}%` : '-';
        return `<tr><td>${name}</td>${ticketTd}<td>${val}</td>`;
      }
    );
  } else {
    // No CSAT data: remove the column entirely
    summaryTable = summaryTable.replace(
      '<th>满意度<br><span class="en">CSAT</span></th>',
      ''
    );
    summaryTable = summaryTable.replace(
      /(<tr><td>[^<]+<\/td><td>\d+<\/td>)<td>[^<]*<\/td>/g,
      '$1'
    );
  }

  summaryTable = summaryTable.replace(/<th data-col="monthly-lc">[\s\S]*?<\/th>/, '');
  summaryTable = summaryTable.replace(/<th data-col="monthly-ph">[\s\S]*?<\/th>/, '');
  summaryTable = summaryTable.replace(/<th data-col="monthly-em">[\s\S]*?<\/th>/, '');
  summaryTable = summaryTable.replace(/<td data-col="monthly-lc">[^<]*<\/td>/g, '');
  summaryTable = summaryTable.replace(/<td data-col="monthly-ph">[^<]*<\/td>/g, '');
  summaryTable = summaryTable.replace(/<td data-col="monthly-em">[^<]*<\/td>/g, '');

  html = html.slice(0, tableStart) + summaryTable + html.slice(tableEnd);
}

// ── 5. Add conversion rate columns to outbound table ─────────────────────────
// 有效跟进转化率 = 周PC / 有效跟进;  分配转化率 = 周PC / 分配Leads
// Both inserted to the LEFT of 周PC column.
const obHeadingIdx = html.indexOf('外呼 Outbound');
if (obHeadingIdx !== -1) {
  const tableStart = html.indexOf('<table>', obHeadingIdx);
  const tableEnd   = html.indexOf('</table>', tableStart) + '</table>'.length;
  let obTable = html.slice(tableStart, tableEnd);

  // Insert header columns before 周PC
  obTable = obTable.replace(
    '<th>周PC<br><span class="en">Weekly PC</span></th>',
    '<th>有效跟进转化率<br><span class="en">Eff. Conv%</span></th>' +
    '<th>分配转化率<br><span class="en">Assign Conv%</span></th>' +
    '<th>周PC<br><span class="en">Weekly PC</span></th>'
  );

  // Strip HTML tags then extract leading number
  const getNum = s => {
    const stripped = s.replace(/<[^>]+>/g, '').trim();
    const n = stripped.match(/^[\d.]+/);
    return n ? parseFloat(n[0]) : 0;
  };

  const tbodyMatch = obTable.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (tbodyMatch) {
    const newTbody = tbodyMatch[1].replace(/<tr>([\s\S]*?)<\/tr>/g, (rowHtml, inner) => {
      const tds = [];
      const tdRe = /<td>([\s\S]*?)<\/td>/g;
      let m;
      while ((m = tdRe.exec(inner)) !== null) tds.push(m[1]);
      if (tds.length < 7) return rowHtml;

      const leads = getNum(tds[1]);
      const effF  = getNum(tds[4]);
      const pc    = getNum(tds[6]);

      const effConv    = effF  > 0 ? (pc / effF  * 100).toFixed(1) + '%' : '-';
      const assignConv = leads > 0 ? (pc / leads * 100).toFixed(1) + '%' : '-';

      const cells = inner.match(/<td>[\s\S]*?<\/td>/g);
      const newInner = cells.slice(0, 6).join('') +
                       `<td>${effConv}</td>` +
                       `<td>${assignConv}</td>` +
                       cells[6];
      return `<tr>${newInner}</tr>`;
    });
    obTable = obTable.replace(/<tbody>[\s\S]*?<\/tbody>/, `<tbody>${newTbody}</tbody>`);
  }

  html = html.slice(0, tableStart) + obTable + html.slice(tableEnd);
}

// ── 6. Highlight top1/bottom1 in outbound individual table ───────────────────
// Columns 5-8: 有效跟进率, 有效跟进转化率, 分配转化率, 周PC
const obHlIdx = html.indexOf('外呼 Outbound');
if (obHlIdx !== -1) {
  const obHlStart = html.indexOf('<table>', obHlIdx);
  const obHlEnd   = html.indexOf('</table>', obHlStart) + '</table>'.length;
  let obHlTbl = html.slice(obHlStart, obHlEnd);

  const obHlTbody = obHlTbl.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (obHlTbody) {
    const rowsRaw = [...obHlTbody[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => m[0]);
    const stripTags = s => s.replace(/<[^>]+>/g, '').trim();
    const getNum = s => { const n = stripTags(s).match(/^[\d.]+/); return n ? parseFloat(n[0]) : 0; };

    const parsed = rowsRaw.map(r => {
      const cells = [...r.matchAll(/<td[^>]*>[\s\S]*?<\/td>/g)].map(m => m[0]);
      return { raw: r, cells, vals: cells.map(c => getNum(c)) };
    }).filter(r => r.cells.length >= 9);

    if (parsed.length > 1) {
      const HI_COLS = [5, 6, 7, 8];
      const maxV = {}, minV = {};
      for (const ci of HI_COLS) {
        const nums = parsed.map(r => r.vals[ci]);
        maxV[ci] = Math.max(...nums);
        minV[ci] = Math.min(...nums);
      }

      const newRows = parsed.map(r => {
        let cells = [...r.cells];
        for (const ci of HI_COLS) {
          const v = r.vals[ci];
          const raw = stripTags(cells[ci]);
          if (maxV[ci] !== minV[ci]) {
            if (v === maxV[ci]) {
              cells[ci] = cells[ci].replace(/(<td[^>]*>)[\s\S]*?(<\/td>)/, `$1<strong style="color:#22c55e;font-weight:700">${raw}</strong>$2`);
            } else if (v === minV[ci]) {
              cells[ci] = cells[ci].replace(/(<td[^>]*>)[\s\S]*?(<\/td>)/, `$1<strong style="color:#ef4444;font-weight:600">${raw}</strong>$2`);
            }
          }
        }
        return `<tr>${cells.join('')}</tr>`;
      });

      obHlTbl = obHlTbl.replace(/<tbody>[\s\S]*?<\/tbody>/, `<tbody>${newRows.join('')}</tbody>`);
    }
    html = html.slice(0, obHlStart) + obHlTbl + html.slice(obHlEnd);
  }
}

// ── Write output ─────────────────────────────────────────────────────────────
fs.writeFileSync(outputPath, html);
console.log(`Done: ${outputPath}`);
