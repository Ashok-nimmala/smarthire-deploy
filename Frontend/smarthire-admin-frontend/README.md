# SmartHire Admin Frontend

Professional React/Vite Admin Portal for the SmartHire backend.

## Backend
The frontend uses only the API contract supplied for SmartHire:

https://r6j6keh5jn7ne2oykddo7k5vpi0rhdjx.lambda-url.ap-south-1.on.aws

No mock API is used.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Open:

http://localhost:5173

## Routes

- `/login`
- `/signup`
- `/admin/dashboard`
- `/admin/jobs`
- `/admin/jobs/create`
- `/admin/jobs/:jdId`
- `/admin/jobs/:jdId/applications`
- `/admin/applications/:appId`
- `/admin/interviewers`
- `/admin/audit`

## API behavior

- Uses GET exactly as specified by the backend, including state-changing admin actions.
- Sends `Authorization: Bearer <session_token>`.
- Stores only sessionToken, orgId and role.
- Does not decode the opaque session token as a JWT.
- Does not prefetch state-changing GET requests.
- Handles 401 / NOT_AUTHENTICATED by clearing the session and returning to `/login`.
- Uses URLSearchParams via the centralized API client.
- Uses backend scores and screening results; it does not calculate hiring scores in the frontend.

## Auditability

The admin UI uses only the existing read-only audit contract:

- `GET /admin/audit/{entity_id}?limit=500`
- `GET /admin/dashboard` as the automatic discovery source for organization/job/application activity and recent entity IDs where the backend returns them
- `GET /admin/applications/{app_id}` for application details

The dedicated **Audit Logs** page automatically loads the authenticated organization audit history plus audit histories for real entity IDs exposed by the existing dashboard response. It does not require the admin to type an entity ID. Returned events are merged into a newest-first feed and can be filtered client-side by entity type and actor type.

When an existing admin create/list action returns a real Job, Question, or User/Interviewer ID, the frontend remembers only that entity ID as audit discovery metadata. It then calls the real `GET /admin/audit/{entity_id}` endpoint for the audit events. It never stores or constructs audit events on the client. If the backend returns no audit event, nothing is displayed.

Application Details automatically loads `GET /admin/audit/{app_id}?limit=500` and shows the complete returned application timeline. Audit events remain read-only: the frontend does not create, edit, delete, rewrite timestamps, change actors, invent state transitions, or fabricate missing history. If the allowed backend responses do not expose an entity ID, the frontend does not invent one or create an audit event for it.

## Automatic audit discovery update

The Audit Logs page now automatically discovers real organization, job, interviewer/user, and dashboard-exposed application entity IDs from existing admin read APIs and then calls only `GET /admin/audit/{entity_id}?limit=500` for audit history. It does not fabricate events or create frontend audit records. Job and interviewer lists are refreshed when Audit Logs is opened/refreshed so newly posted jobs and newly created interviewers can be included when the backend has corresponding audit records. The actor badge/filter was removed; each returned event still shows its `actor_id` as read-only audit data.
