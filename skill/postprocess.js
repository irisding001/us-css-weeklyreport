#!/usr/bin/env node
/**
 * Post-processor for us-css-weeklyperformance skill
 * 1. Remove sections 3 (Highlights) and 4 (Next Week Plans)
 * 2. Sort individual channel tables by ticket/volume descending
 * 3. Bilingual performance analysis labels and descriptions
 */

const fs = require('fs');

const [,, inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('Usage: node postprocess.js <input.html> <output.html>');
  process.exit(1);
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

html = html.replace(
  /(综合满意度低于 84%：[^<]+)/g,
  (m) => `${m}<br><span style="color:#666;font-size:12px">Overall CSAT below 84%: ${m.replace('综合满意度低于 84%：', '').replace(/、/g, ', ')}</span>`
);

html = html.replace(
  /(本周 PC 为 0：[^<]+)/g,
  (m) => `${m}<br><span style="color:#666;font-size:12px">Weekly PC = 0: ${m.replace('本周 PC 为 0：', '').replace(/、/g, ', ')}</span>`
);

// ── 4. Remove CSAT column from Individual Summary table ONLY ─────────────────
// The Individual Summary is the first table after "Individual Summary" heading.
// Column order: agent | totalTickets | CSAT% | util% | weeklyPC | monthlyPC
// We target only this table section to avoid corrupting channel breakdown tables.
const summaryStart = html.indexOf('Individual Summary');
if (summaryStart !== -1) {
  const tableStart = html.indexOf('<table>', summaryStart);
  const tableEnd = html.indexOf('</table>', tableStart) + '</table>'.length;
  let summaryTable = html.slice(tableStart, tableEnd);

  // Remove CSAT <th>
  summaryTable = summaryTable.replace(
    '<th>满意度<br><span class="en">CSAT</span></th>',
    ''
  );
  // Remove CSAT <td> — it is the 3rd td (after agent name and ticket count)
  summaryTable = summaryTable.replace(
    /(<tr><td>[^<]+<\/td><td>\d+<\/td>)<td>[^<]*<\/td>/g,
    '$1'
  );
  html = html.slice(0, tableStart) + summaryTable + html.slice(tableEnd);
}

// ── Write output ─────────────────────────────────────────────────────────────
fs.writeFileSync(outputPath, html);
console.log(`Done: ${outputPath}`);
