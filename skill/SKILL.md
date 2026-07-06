---
name: us-css-weeklyperformance
description: Generate US CSS weekly performance report (Sections 1 & 2 only) for the Conversion CS Team — covers Live Chat, Phone, Email, and Outbound with bilingual labels and tables sorted by ticket volume descending. Uploads to GitHub repo us-css-weeklyreport. Use this skill when generating a US CSS performance-only report, a custom-date-range weekly report, or any request for a US CSS data report without highlights/plans sections. Trigger on phrases like "临时报告", "performance report", "us-css-weeklyperformance", or any US CSS weekly report with custom date ranges.
---

# US CSS Weekly Performance Report

Generates a 2-section HTML performance report for the US Conversion CS Team (12 agents).

**Differences from the standard `US-CCS-weekly-report` skill:**
- Sections 1 & 2 only — no Highlights (三) or Next Week Plans (四)
- Individual channel tables sorted by ticket volume descending
- Bilingual performance analysis: `异常 Alert` / `Needs Improvement` badges, English subtitle on each item

## Team (12 agents)

jacelynlim / terrychen / muhamadfaisal / calventan / azamuddin / jeanliew / whitneylee / alvinsim / zaydentan / vincentyew / wilsonwong / zyonnleong

---

## Step 1: Collect credentials

**A. DATA_COOKIE** (from `us.data.futuoa.com`)
- F12 → Network → any request → copy Cookie header: `uIdToken=...; uIdToken.sig=...`

**B. USCM_COOKIE + USCM_CSRF** (from `uscm.futuoa.com`)
- Cookie: `EGG_SESS=...; csrfToken=TOKEN; staff_id=7328; staff_id.sig=...`
- CSRF: the `csrfToken` value extracted separately

**Validity:** `uIdToken` ~2 weeks · `EGG_SESS` ~1 day  
If outbound fails with `USCM_AUTH_EXPIRED`, ask the user to refresh USCM_COOKIE.

---

## Step 2: Confirm date ranges

Ask the user for:
- **LC / Phone / Email range:** `YYYY-MM-DD ~ YYYY-MM-DD`
- **Outbound window:** `YYYY-MM-DD 19:00 BT → YYYY-MM-DD 16:00 BT`

Standard cycle: Friday ~ Thursday (BT). Default outbound: Friday 19:00 → next Friday 16:00.

---

## Step 3: Generate base report

```bash
DATA_COOKIE="uIdToken=..." \
USCM_COOKIE="EGG_SESS=...; csrfToken=TOKEN; staff_id=7328; staff_id.sig=..." \
USCM_CSRF="TOKEN" \
node "C:\Users\irisding\.claude\skills\US-CCS-weekly-report\run.js" \
  --week-start YYYY-MM-DD \
  --week-end   YYYY-MM-DD \
  --ob-start   YYYY-MM-DD \
  --ob-end     YYYY-MM-DD \
  --out "C:/Users/irisding/weekly_report_TEMP.html"
```

---

## Step 4: Post-process

```bash
node "C:\Users\irisding\.claude\skills\us-css-weeklyperformance\scripts\postprocess.js" \
  "C:/Users/irisding/weekly_report_TEMP.html" \
  "C:/Users/irisding/us-css-weeklyreport/weekly_report_YYYY-MM-DD.html"
```

The postprocess script:
1. Removes sections 3 (Highlights) and 4 (Next Week Plans)
2. Sorts individual LC / Phone / Email / Outbound tables by ticket count descending
3. Makes performance analysis labels bilingual with English subtitles
4. Removes CSAT column from Individual Summary table only (not from channel breakdown tables)

Use `--week-start` date as the output filename date.

---

## Step 5: Upload to GitHub

```bash
cd "C:/Users/irisding/us-css-weeklyreport"
git add weekly_report_YYYY-MM-DD.html
git commit -m "Add US CSS weekly performance report YYYY-MM-DD ~ YYYY-MM-DD"
git push origin main
```

- Local repo: `C:/Users/irisding/us-css-weeklyreport/`
- Remote: `https://github.com/irisding001/us-css-weeklyreport`

---

## Step 6: Share link

GitHub Pages URL:
```
https://irisding001.github.io/us-css-weeklyreport/weekly_report_YYYY-MM-DD.html
```

Pages must be enabled on the repo (Settings → Pages → Branch: main, path: /).

---

## Notes

- If `[ERROR] 外呼: USCM_AUTH_EXPIRED` — outbound section will be empty; refresh USCM_COOKIE to fix
- The `us-css-weeklyreport` repo is separate from `US-CSS-weekly-report` (standard weekly report)
- For a non-standard date range (e.g., holiday week), the output filename still uses `--week-start`
- **Do NOT manually remove CSAT with a broad regex** — it will corrupt LC/Phone/Email channel columns. The postprocess.js step 4 handles this safely, targeting only the Individual Summary table.
