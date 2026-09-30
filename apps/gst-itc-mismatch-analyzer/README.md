# ITC Mismatch Analyzer — `gst-itc-mismatch-analyzer`

Compares purchase-register rows vs GSTR-2B-style rows; flags **missing in 2B**,
**value differences**, **wrong GSTIN** (same invoice no. under another GSTIN),
and lists **unclaimed ITC** opportunities. Totals **at-risk ITC**.

## Rules
- Match key: supplier GSTIN + invoice no. (case-insensitive); Rs 1 tolerance.
- At-risk ITC = full claimed ITC on missing-in-2B rows + positive (claimed − available) gaps.
- Statutory basis: Sec 16(2)(c) CGST Act + Rule 36(4) (2B is the hard ITC ceiling).

## Free limits
20 analyses/day (metered). Up to 25 saved reports in vault. Reading saved
reports is never metered. Export CSV is unmetered (part of the analysis).

## Privacy
100% on-device. The tool does NOT fetch GSTR-2B from the portal — paste it.
Optional vault passphrase encryption.

## SEO
ITC mismatch analyzer, आईटीसी मिसमैच, GSTR-2B reconciliation,
purchase register vs 2B, ITC at risk calculator, GSTR-2B mismatch report.
