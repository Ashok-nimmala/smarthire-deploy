# SmartHire

A hiring platform on one AWS Lambda: automatic resume screening, a proctored
written exam, and one interviewer decision.

**The admin configures the hiring process. The system runs it.**

An admin creates an interviewer, writes a job — title, description, deadline,
screening threshold, exam pass threshold, that interviewer — and adds free-text
questions with reference answers and marks. A candidate uploads a PDF resume
and applies. Everything after that is automatic: the resume is screened against
the job description in the background, a passing candidate sits the written
exam in a separate proctored system, the answers are marked against the
reference answers, and a pass lands in the assigned interviewer's queue. The
interviewer makes the final call.

There is exactly **one** manual step in the pipeline: a borderline resume waits
in the admin's HOLD queue.

**Integrating a frontend? Read [API.md](API.md).** It is the full contract: all
54 endpoints grouped by role, every parameter with its limits, and every
possible response including the exact code and message of each failure.

---

## The pipeline

```
admin: interviewer -> job -> questions -> publish
                                 |
candidate: resume (PDF -> S3) -> apply
                                 |
                    automatic resume screening (background AI)
                                 |
        +------------------------+------------------------+
        |                        |                        |
 SCREENING_PASSED             HOLD                    REJECTED
 sit the exam          admin approves/rejects           closed
        |                        |
        +------------------------+
        |
  separate exam system: login -> start -> write -> submit
        |                          ^
        |                   proctoring events
        |
      automatic marking (background AI, against the reference answers)
        |
   EXAM_PASSED --> INTERVIEW_PENDING --> interviewer decides
        |                                       |
   EXAM_REJECTED                    ACCEPTED / FINAL_REJECTED
```

## Design rules this codebase follows

| Rule | How |
|---|---|
| **GET for everything** | 52 of 54 endpoints are `GET` with every input in the URL. No `PATCH`, `PUT` or `DELETE` exists. The two `POST`s are the resume upload and the long-paper exam submit |
| **No JWT** | opaque 64-hex session tokens, stored server-side as a hash with a TTL. No refresh, no blacklist, no logout, no `/auth/me` |
| **Free-text questions** | every question has a reference answer and a mark allocation. No MCQs, no options, no answer key |
| **The interviewer is chosen at job creation** | no assignment step, no slots, no scheduling, no rescheduling |
| **The interviewer decides** | `ACCEPTED` or `FINAL_REJECTED`, and only they can. The admin can inspect everything and finalize nothing |
| **AI never runs in a request** | both AI tasks are background jobs on SQS; the two pipelines never mix |
| **Resumes live in S3** | the database keeps the object key and the extracted text, never the PDF |
| **Thresholds are per job** | screening and exam thresholds are the admin's. The HOLD band, the score weights and the proctoring penalties are platform configuration in `config.py` |
| **Everything important is audited** | who, when, what, from which state to which |
| **Strict isolation** | admins see one organization, interviewers see their own assigned applications, candidates see themselves. Anything else is `404`, never `403` |

## The files

| File | What it holds |
|---|---|
| `main.py` | the app, the response envelope, the Lambda entry point |
| `models.py` | every row shape, the state machine, the scoring maths |
| `db.py` | the only module that touches DynamoDB and S3 |
| `config.py` | every tunable value, all env-overridable |
| `auth.py` | sign-up, login, sessions, the role guards |
| `admin.py` | 26 admin endpoints |
| `candidate.py` | the public feed and the candidate endpoints |
| `interviewer.py` | the interviewer's 6 endpoints |
| `exam.py` | the separate exam and proctoring system |
| `llm.py` | the two AI tasks, kept apart |
| `sqs_worker.py` | the background half: screening and marking |
| `cache.py` | the AI cache and the rate limiter |
| `test_smoke.py` | offline self-checks |
| `aws-setup.sh` | creates every AWS resource, idempotently |
| `API.md` | the full API contract |
| `postman/` | one collection, plus a sample resume PDF |

## AWS resources

| Kind | Name |
|---|---|
| Lambda | `bnp-backend` (python3.12, arm64, 512 MB, 30 s) + layer `bnp-backend-pkgs` |
| DynamoDB | `orgs`, `users`, `sessions`, `jds`, `questions`, `applications`, `answers`, `anticheat`, `jobs`, `audit`, `cache` (all prefixed `bnp-backend-`) |
| SQS | `screening-queue`, `answer-scoring-queue`, each with a DLQ |
| S3 | `bnp-backend-<account>-<region>`, private, resumes under `candidates/{id}/resumes/` |

One function serves both the HTTP API and the SQS workers; `main.handler`
dispatches on the event shape.

## Setup

```bash
./aws-setup.sh                 # tables, queues, IAM, S3, the layer - idempotent
```

Then deploy the code:

```bash
rm -f /tmp/code.zip
zip -qr /tmp/code.zip *.py requirements.txt -x "test_smoke.py"
aws lambda update-function-code --function-name bnp-backend \
  --zip-file fileb:///tmp/code.zip --region ap-south-1
aws lambda wait function-updated --function-name bnp-backend --region ap-south-1
curl -s "$URL/health"
```

The zip must never contain `docs/` or `credentials.txt` — they hold secrets.

## Tuning without a redeploy

Every value in `config.py` reads an environment variable at call time:

```bash
aws lambda update-function-configuration --function-name bnp-backend \
  --region ap-south-1 --environment 'Variables={SCREENING_HOLD_BAND=20,...}'
```

| Variable | Default | Effect |
|---|---|---|
| `SCREENING_HOLD_BAND` | 15 | how far below a job's threshold still counts as borderline |
| `WEIGHT_RESUME` / `WEIGHT_EXAM` | 40 / 60 | the combined score mix |
| `CONFIDENCE_CUTOFF` | 60 | flag below this AI confidence |
| `DISAGREEMENT_CUTOFF` | 30 | flag when resume and exam scores differ by this much |
| `INTEGRITY_FLAG_CUTOFF` | 70 | flag an exam taken below this integrity |
| `DEFAULT_JOB_VALIDITY_DAYS` | 30 | expiry when the admin does not set one |
| `SESSION_TTL_SECONDS` | 43200 | platform session lifetime |
| `EXAM_SESSION_TTL_SECONDS` | 14400 | exam session lifetime |
| `MAX_RESUME_BYTES` | 5242880 | resume size cap |
| `SIGNUP_RATE_PER_HOUR` | 60 | signups per client IP |
| `LOGIN_RATE_PER_5MIN` | 10 | login attempts per email |
| `APPLY_RATE_PER_HOUR` | 30 | applications per candidate |
| `PROCTOR_EVENTS_PER_SECOND` | 5 | proctoring events per attempt |
| `PUBLIC_READS_PER_MINUTE` / `PUBLIC_SEARCHES_PER_MINUTE` | 60 / 30 | public feed limits |
| `PROCTOR_PENALTIES` | see below | JSON map, e.g. `{"paste":15}`; unknown keys are ignored |

Proctoring defaults: `devtools_open` 25, `multiple_faces` 20,
`fullscreen_exit` 15, `paste` 10, `no_face` 10, `copy` 8, `tab_switch` 5,
`right_click` 2, `network_drop` 0.

## Testing

### Offline

```bash
python3 test_smoke.py
```

33 checks: the state machine (reachability, terminals, and that the exam cannot
be reached without clearing screening), the three-way screening split at its
boundaries, the exam and combined score arithmetic, the auto-flag rules, exam
id round-tripping, expiry, the float ban, config clamping, and the validator
that checks the AI's marking against the stored paper. Plus route guards that
enforce the GET-first rule mechanically, assert every endpoint the
specification lists exists, assert every removed endpoint stays removed, and
fail if API.md or the Postman collection drifts from the real route table.

### Live

```bash
newman run postman/SmartHire.postman_collection.json \
  -e postman/SmartHire.postman_environment.json --working-dir postman
```

One collection, organized by role, with a request for every endpoint and
assertions on every response. It signs up a fresh organization and candidate on
each run, exercises the whole pipeline including a real HOLD approval and real
proctoring penalties, and asserts the negative cases too — wrong password,
wrong role, cross-tenant reads, an exam session on a platform route, a
reference answer never reaching a candidate.

## Operational notes

- **AI concurrency** is capped at 2 per queue, so a re-screen of 10
  applications takes roughly 100 seconds.
- **A failed AI call** is retried by SQS up to 3 times, then the job is marked
  `failed` and appears in `GET /admin/jobs/failed`. The application keeps its
  state and can be re-screened.
- **Token caps for the AI** are deliberately generous: the model spends output
  tokens on internal reasoning before it emits, and the gateway reports a
  truncation as an error rather than a partial.
- **The AI cache** keys on the content, so a redelivered job is a cache hit
  rather than a second call.

---

## Architecture at a glance

```
Client / Frontend
      |
API Gateway (or Lambda Function URL)
      |
Lambda: bnp-backend  (main.handler)
   |-- HTTP events  -> auth / admin / candidate / interviewer / exam routers
   |-- SQS events   -> sqs_worker (screening, answer marking)
      |
DynamoDB (11 tables)   S3 (resumes)   SQS (+DLQs)   LLM gateway
```

One function, two entry paths: `main.handler` looks at the event shape and routes to HTTP or the SQS workers.

## Roles and what each can do

| Role | Can | Cannot |
|---|---|---|
| Admin | Create interviewers, jobs, questions; publish; resolve HOLD; inspect everything; re-screen | Finalize a candidate |
| Interviewer | See own assigned applications; mark `ACCEPTED` / `FINAL_REJECTED` | See other interviewers' queues |
| Candidate | Upload resume, apply, sit the exam, see own status | See reference answers or other candidates |
| Exam session | Start/write/submit the exam, send proctoring events | Call any platform route |

## Application states

| State | Meaning | Next |
|---|---|---|
| `SCREENING_PASSED` | Resume cleared the job's threshold | Exam |
| `HOLD` | Within `SCREENING_HOLD_BAND` (15) below threshold | Admin approves or rejects |
| `REJECTED` | Resume screening failed | Terminal |
| `EXAM_PASSED` | Marked above exam threshold | `INTERVIEW_PENDING` |
| `EXAM_REJECTED` | Marked below exam threshold | Terminal |
| `INTERVIEW_PENDING` | In interviewer's queue | Interviewer decides |
| `ACCEPTED` / `FINAL_REJECTED` | Interviewer's decision | Terminal |

## How scoring works

- **Screening:** the resume score is compared to the job's threshold. Pass at or above it, HOLD within the band below it, reject below that.
- **Combined score:** `0.4 × resume + 0.6 × exam` (via `WEIGHT_RESUME` / `WEIGHT_EXAM`).
- **Auto-flags** shown to the interviewer: AI confidence below 60, resume/exam gap of 30 or more, exam integrity below 70.
- **Integrity score:** starts at 100 and drops by the penalty for each proctoring event, e.g. `devtools_open` costs 25 and `tab_switch` costs 5.

## Local development

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 test_smoke.py
```

Required environment variables: `<list the table-name prefix, region, queue URLs, bucket name, LLM gateway key/URL>`

## Security notes

- Session tokens are 64-hex, stored only as a hash with a TTL, so a DB leak doesn't expose usable tokens.
- Cross-tenant access returns `404`, not `403`, so IDs can't be probed.
- Reference answers never reach candidates (asserted in the Postman suite).
- Rate limits cover signup, login, apply, proctoring events and public reads.
- Resumes are in a private S3 bucket, and the DB keeps only the key and extracted text.
- Never zip `docs/` or `credentials.txt` into the deploy package.

## Monitoring and troubleshooting

| Symptom | Check |
|---|---|
| Application stuck after applying | SQS `screening-queue` depth, then CloudWatch logs for `bnp-backend` |
| Exam submitted but no result | `answer-scoring-queue` and its DLQ |
| Job shows as failed | `GET /admin/jobs/failed`, then re-screen the application |
| Lots of 429s | `*_RATE_*` env vars |
| AI call errors on long answers | Token caps (truncation is reported as an error) |
| Slow re-screen | Concurrency is 2 per queue, about 10 s per application |

## Known limitations / roadmap

- No refresh tokens, logout or `/auth/me` (a deliberate trade-off of the opaque-token design)
- AI concurrency capped at 2 per queue
- No interview scheduling; the interviewer is fixed at job creation
- Ideas: email/notification on status change, bulk re-screen, per-job proctoring penalties, CI pipeline running `test_smoke.py` and newman

## Contributing / conventions

- New endpoints must be `GET` unless they carry a file or a long payload (the route guard test enforces this).
- Any route change must also update `API.md` and the Postman collection, or the smoke test fails.
- Values go in `config.py` and read env at call time, never at import.

---
