# Vendor Compliance Checker — `vendor-compliance-checker`

Batch GSTIN validation: format + mod-36 Luhn checksum, state-code lookup,
PAN structure/entity-type checks, duplicate detection; heuristic risk flags
(low/medium/high/invalid); vault-saved vendor list (max 25).

## Honest limitation
Format-level validation ONLY. Live GSTN registration status
(active/cancelled/suspended) cannot be checked without the GSTN API — the
page says this plainly and directs users to gst.gov.in → Search Taxpayer.
The risk score is explicitly a heuristic.

## Free limits
20 validation batches/day (metered). Vault saves capped at 25.

## SEO
vendor compliance checker, GSTIN verification, जीएसटीआईएन वेरिफिकेशन,
GSTIN format check, vendor GSTIN validation, GSTIN checksum validator.
