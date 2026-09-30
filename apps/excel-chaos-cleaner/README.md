# Excel Chaos Cleaner

Paste messy CSV → clean CSV download. Trims whitespace, drops empty/duplicate rows, normalizes headers to snake_case, repairs Indian dates (DD/MM/YYYY → ISO) and ₹-formatted numbers. On-device, stateless.

- **Cluster:** platform-lifecycle (Cluster N)
- **Slug:** `excel-chaos-cleaner`
- **Files:** `index.html`, `app.js`
- **Storage:** none (stateless). **Metering:** 20 cleans/day.

Pure API: `parseCSV`, `normalizeHeader`, `fixDate`, `fixNumber`, `cleanCSV`, `toCSV`, `esc`.
