# Purchase Order Generator
Cluster: procurement-vendor (Team I, batch 4).
GST-compliant purchase orders: line items with GST% per line, intra-state CGST+SGST / inter-state IGST breakup, delivery terms, printable layout, FY-based PO numbering (VQ/26-27/0001). Up to 25 POs saved in the on-device vault. Pure logic in `app.js` is node-testable; tests in `tests/team-i-procurement-tests.js`.
