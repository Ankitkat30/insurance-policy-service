# Insurance Policy Service

JavaScript/Node.js assessment implementing worker-thread CSV/XLSX ingestion, MongoDB policy queries, process CPU monitoring with automatic restart, and durable scheduled messages.

For a numbered walkthrough with exact environment values and Postman steps, read the [step-by-step runbook](docs/run-project-step-by-step.pdf) ([Markdown](docs/run-project-step-by-step.md)).

## Quick start

**Persistent local setup (Node.js 22/24 LTS; no installed MongoDB required):**

```sh
npm ci
npm run local
```

This starts a real MongoDB replica set on port 27017 and the supervised API on port 3000. Data is stored in `work/mongodb` and preserved when stopped. The first run downloads MongoDB from its official distribution host. Keep this terminal running; stop with Ctrl+C. VS Code includes an F5 configuration named Persistent local API + MongoDB.

Open MongoDB Compass and connect with:

```text
mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true
```

After importing a file, refresh Compass and open `insurance_assessment`. Its collections include `agents`, `users`, `accounts`, `lobs`, `carriers`, and `policies`. MongoDB stores binary WiredTiger files, not JSON files you can open directly. Use Compass or the API to read documents. `work/mongodb` is ignored by Git; do not delete it if you need its data. The configured port must remain the same for an existing data directory.

Do not run Docker MongoDB and `npm run local` together: both use port 27017. `npm run local` deliberately uses its own local database even if MONGODB_URI exists in `.env`. For Atlas, use `npm run dev` instead. The optional `npm run demo` is explicitly disposable; its data is deleted on stop.

**Docker (recommended for persistent local data):** install Docker Desktop, then run:

```sh
docker compose up --build
```

The API is at `http://127.0.0.1:3000`. Compose provisions a single-node MongoDB replica set with persistent storage. It binds published ports to localhost. Its development API key is `local-review-key-change-me`; set `API_KEY` in your shell or `.env` to override it.

**Local Node:** use Node.js 22 or 24 LTS and MongoDB 8 configured as a replica set (or MongoDB Atlas).

```sh
npm ci
cp .env.example .env
# Set MONGODB_URI in .env to your replica-set/Atlas connection string.
npm run dev
```

`npm start` reads environment variables from the process; `npm run dev` also loads `.env`. Both run the supervisor. A standalone MongoDB instance is intentionally rejected because imports and deliveries rely on transactions. If connecting locally to the Compose database, use `mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true` so its internal hostname does not need to resolve on the host.

## API

All `/api` routes accept `x-api-key` when `API_KEY` is configured. Health is unauthenticated. All JSON responses include a request ID header. Pagination defaults to page 1 / limit 20, with a maximum limit of 100.

| Method | Endpoint                                       | Purpose                                                                          |
| ------ | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| GET    | `/health`                                      | Database readiness, process CPU %, uptime                                        |
| POST   | `/api/imports`                                 | Multipart `file`: `.csv` or `.xlsx`                                              |
| GET    | `/api/policies/search?username=Alex%20Example` | Exact case-insensitive first-name or email match, including policy relationships |
| GET    | `/api/policies/aggregate?page=1&limit=20`      | Each user's policy count, date range, distinct category/carrier IDs              |
| POST   | `/api/messages/schedule`                       | Persist a message delivery schedule                                              |
| GET    | `/api/messages/schedules/:id`                  | Inspect pending/delivered status                                                 |
| GET    | `/api/messages?jobId=<id>`                     | Paginated delivered messages; optional job filter                                |

Import `postman/insurance-policy-service.postman_collection.json` and `postman/local.postman_environment.json` for ready-to-use requests.

```sh
curl -H 'x-api-key: local-review-key-change-me' \
  -F 'file=@examples/sample.csv' http://127.0.0.1:3000/api/imports

curl -H 'x-api-key: local-review-key-change-me' \
  'http://127.0.0.1:3000/api/policies/search?username=Alex%20Example'

curl -H 'x-api-key: local-review-key-change-me' \
  'http://127.0.0.1:3000/api/policies/aggregate?page=1&limit=20'
```

Scheduling body (choose a future day/time):

```json
{
  "message": "Follow up on the assessment",
  "day": "2026-09-27",
  "time": "15:30:00",
  "timezone": "Asia/Kolkata"
}
```

`day` is an explicit calendar date (`YYYY-MM-DD`), not a recurring weekday. `time` is 24-hour `HH:mm` or `HH:mm:ss`. Timezone is an IANA zone and defaults to UTC. Invalid, past, ambiguous daylight-saving times and nonexistent local times return 400. The Postman scheduling request automatically generates a future time.

## Data model and mapping

| Collection | Identity / fields                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| `agents`   | Normalized agent name; display `name`                                                                                      |
| `users`    | Identity hash of normalized email + first name + DOB; first name, DOB, address, phone, state, zip, email, gender, userType |
| `accounts` | User ID + normalized account name; display `name`                                                                          |
| `lobs`     | Normalized category; `categoryName`                                                                                        |
| `carriers` | Normalized carrier; `companyName`                                                                                          |
| `policies` | Carrier ID + policy number; start/end dates; user, agent, account, category and carrier ObjectId references                |

Two additional operational collections, `scheduledJobs` and `messages`, support Task 2. They do not replace or combine the six required domain collections.

The supplied file has `firstname`, not a separate username. The API uses first name or email as the search identifier and returns **all** matches. Shared emails occur in the sample, so email alone is not a safe unique user identity. The composite identity preserves distinct people; production systems should use a stable external user ID if available. Changing a user's identity fields creates another user rather than silently merging people. A policy number is assumed unique within a carrier. Re-importing the same carrier/policy number updates that policy, including changed dates and relationships; renewals are not stored as separate versions.

Blank optional demographic values (including gender) are preserved as empty strings. Phone and ZIP are strings, preserving leading zeros in CSV/text cells. If an XLSX producer stores ZIP as a numeric cell, lost leading zeros cannot be reconstructed reliably. Dates use UTC midnight. Header names are trimmed and otherwise must match the supplied sample. Unneeded source columns are ignored.

## Import architecture

The HTTP process streams uploads to disk and delegates parsing, validation, and database writes to `worker_threads`. Each worker has its own MongoDB client and a 256 MB old-generation heap limit. CSV parsing is streamed; XLSX parsing is buffered inside the worker. Only the first worksheet is read.

Limits: 10 MB upload, 50,000 data rows, two concurrent workers by default, 120-second execution timeout. Excess work receives 503 with a retry hint rather than forming an unbounded queue. Each valid row commits all six collection updates in one transaction. Invalid row values are skipped and counted; at most 100 row errors are returned. Successful imports return counts even if some rows were rejected, so check `rejected` before accepting an import.

Imports are **row atomic, not file atomic**. Malformed file structure, timeout, worker failure, or restart may leave earlier rows committed. Re-uploading the file is safe because unique indexes and upserts make repeat imports idempotent. Concurrent imports of identical new keys can produce a transaction/unique-key failure; retry the file. Uploads are removed on normal request completion. A hard process kill can leave an orphan in the ignored upload directory; apply a retention policy in a deployed environment.

## CPU restart behavior

Every second, the service samples `process.cpuUsage()` against monotonic elapsed time. The percentage is process CPU relative to **one CPU core**, including worker threads; it can exceed 100% on multicore workloads. This measures the Node process rather than unrelated host activity. At or above 70%, it stops accepting requests, terminates active import workers, drains message delivery, disconnects MongoDB, and exits. The separate supervisor restarts it with exponential backoff (2–30 seconds for repeated short-lived exits) to prevent a tight restart loop. `SIGINT`/`SIGTERM` stops the supervisor and child cleanly. Unfinished imports must be retried; pending scheduled messages survive.

`CPU_THRESHOLD` and sampling interval are configurable for testing. A threshold this low may restart during large imports by design; production deployments usually alert/scale on sustained utilization instead.

## Durable scheduling

POST stores scheduling intent immediately in `scheduledJobs`; it does not insert into `messages` early. The polling scheduler selects due jobs and, in a single MongoDB transaction, marks the job delivered and inserts the message with a unique job ID. Competing instances safely retry transaction conflicts. An interrupted transaction rolls back; overdue jobs are delivered when the server returns. A unique index prevents duplicate message records for a job.

The normal delivery delay is the polling interval (default one second) plus database/workload latency. This is not a hard real-time guarantee. Each polling batch handles at most 100 due jobs; database failures retry on the next poll. Repeating the scheduling POST intentionally creates a new job.

## Verification

```sh
npm run check
npm test
npm audit --omit=dev

# Optional full assessment dataset test (not required in CI):
ASSESSMENT_SAMPLE='/absolute/path/to/data-sheet - Node js Assesment - IM.csv' npm test
```

Tests start a real ephemeral MongoDB replica set automatically. First run downloads a MongoDB binary from MongoDB's distribution host, so internet access is required. Tests cover CSV and XLSX uploads, all six collections, repeat imports, shared emails, joins, pagination, validation, load bounds, authentication, concurrent message delivery, and real CPU-triggered child-process restarts with pending-job recovery. CI runs on Node 22 and 24. The full assessment CSV is intentionally excluded from Git to avoid publishing personal data; `examples/sample.csv` is synthetic.

## Structure

```text
src/
  app.js                 Express middleware and router composition
  server.js              Database readiness, startup and graceful shutdown
  supervisor.js          Child process restart with bounded backoff
  config/                Validated environment and MongoDB connection
  routes/                Endpoint paths and dependency wiring
  controllers/           Translate HTTP requests and responses
  services/              Use cases, file parsing, CPU monitor and scheduler
  repositories/          MongoDB queries, writes and transactional row operations
  models/                Collection identities and index definitions
  validators/            Upload row, API query and schedule validation
  middleware/            Authentication, multipart upload, errors and 404s
  workers/               Bounded worker pool and import worker entry point
  utils/                 Shared HTTP error type
scripts/                 Durable local startup, disposable demo and syntax checks
postman/                 Importable collection, environment and usage instructions
examples/                Synthetic CSV fixture safe to share
test/                    Unit, integration, process and persistence checks
docs/                    Setup runbook (PDF + Markdown)
.github/workflows/       Node 22/24 and Docker CI
.vscode/                 Launch configurations
work/                    Generated database files/uploads; ignored by Git
```

See the [setup runbook](docs/run-project-step-by-step.md) for environment configuration, startup commands, database access and Postman examples.

## Deployment boundaries

This assessment is a single service with bounded local workers, indexed queries, and multi-instance-safe message delivery. For larger imports, move upload objects and job state to durable external storage/queues and expose asynchronous job status. For public deployment configure authentication, TLS, rate limits, backups, and a managed replica set. The included API key protects the review environment but is not a multi-user authorization system. Do not commit `.env`, uploaded personal data, or credentials.

Reference behavior: [Node CPU usage](https://nodejs.org/api/process.html#processcpuusagepreviousvalue), [Node worker threads](https://nodejs.org/api/worker_threads.html), and [MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/).

## Reviewer handoff and Atlas

Clone this repository, run either `docker compose up --build` or `npm ci` followed by `npm run local`, import the two Postman JSON files, select Insurance Local, and attach `examples/sample.csv` to the import request. No personal database account is required. Docker stores data in the named `mongo-data` volume at `/data/db` inside its MongoDB container. `docker compose down` preserves that volume; `docker compose down -v` deletes it.

Atlas is optional. Create a separate database user and network allowlist for your deployment, put its connection URI in your untracked `.env`, and run `npm run dev`. Keep database credentials out of Git, Postman exports and submission files. Reviewers should use their own database credentials. A public GitHub repository does not host the running API or share your local database.

## Import troubleshooting

`/api/imports` is **POST**, not a browser GET. In Postman choose Body > form-data, key `file`, type **File**, and select a real `.csv` or `.xlsx` file, not its folder. Do not manually set Content-Type: Postman must add the multipart boundary. Use the Desktop Agent for localhost requests from Postman web. `EISDIR` is a Postman file-selection error before an HTTP response. A missing file returns a helpful 400 JSON response; a missing/wrong API key returns 401; no worker capacity returns 503. The import call waits for completion and returns 200 with processed/succeeded/rejected counts.
