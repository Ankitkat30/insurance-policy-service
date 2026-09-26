# Postman

Import both JSON files and select **Insurance Local**. With Docker Compose the example API key works as supplied; change it if you configured a different key. For local development without an API key, the header is ignored.

1. Run Health.
2. In Import CSV or XLSX, choose `examples/sample.csv` under Body → form-data → file. Set request timeout to at least 150,000 ms. Run it twice to check idempotency.
3. Run search and aggregation. Set `username` to an exact first name or email when using the assessment dataset.
4. Schedule a message. The script chooses one minute in the future and saves `jobId`.
5. Inspect schedule status and delivered messages before and after the scheduled time.

The actual assessment CSV contains personal details and is not committed. Select your local copy when testing that dataset.

Start the API with `npm run local` for durable local data, or `docker compose up --build`. Postman web needs the separate Postman Desktop Agent running and connected to reach localhost. The desktop Postman application can send directly.

For imports select an actual file, not a folder, and make sure the `file` row is checked and its type is File. Do not add a manual Content-Type header. `EISDIR` means Postman is reading a directory; reselect the CSV. A request without a selected file returns HTTP 400 with instructions. An upload may take longer than other requests because the response waits for worker completion.

The local setup uses database `insurance_assessment`, stored at `work/mongodb`. Compass URI: `mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true`. The Postman environment stores only a demonstration API key; do not put Atlas credentials in it.
