# SmartHire Interviewer Frontend

React + TypeScript + Vite interviewer portal based on the current SmartHire Master API v2 requirements supplied for this project.

## Run

```powershell
npm install
npm run dev
```

Open the Vite URL and use:

- `/interviewer/login`
- `/interviewer/dashboard`
- `/interviewer/applications`
- `/interviewer/profile`

The application uses the supplied SmartHire API base URL by default. You can override it with `VITE_SMARTHIRE_API_BASE`.

## Current interviewer scope

- Interviewer login through `GET /auth/login`
- Session validation through `GET /interviewer/dashboard`
- Dashboard
- Assigned applications
- Application detail/review
- Resume view/download
- Screening evidence
- Exam evidence and reference answers
- Integrity/proctoring events
- Auto flags
- Notes
- Explicit Accept/Reject actions
- Profile display

State-changing notes/decision GET endpoints are only called after the corresponding button is explicitly pressed.
