# BOP Admissions Application

Live app: `https://bop-application.vercel.app`

Google Sheet: `1HPYhjU-SlTgaCw8aLtqeWki1aft6efddkc0IxCypJGA`

Webinar attendance Sheet: `1Hzf81otsIgjw3iIZV99ZV2rRYyd13-Oc0Ox8WUlgJLc`

## Google Sheet Workflow

Use the `gws` CLI for operator-side Google Sheet checks and manual population.

The live Vercel function uses one encrypted env generated from `gws auth export --unmasked`:

`GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON`

Do not add the old three-key Google OAuth env pattern (`GWS_CLIENT_ID`, `GWS_CLIENT_SECRET`, `GWS_REFRESH_TOKEN`) to this project.

Read the admissions Sheet:

```bash
gws sheets +read --spreadsheet 1HPYhjU-SlTgaCw8aLtqeWki1aft6efddkc0IxCypJGA --range "A:AA" --format table
```

Append a clearly marked manual test row:

```bash
gws sheets +append --spreadsheet 1HPYhjU-SlTgaCw8aLtqeWki1aft6efddkc0IxCypJGA --json-values '[["2026-05-30 22:00","Codex Test Applicant","bop-test@example.com","+2348100000530","25-29","Nigeria","Lagos","Photographer","Weddings and events","Other","https://instagram.com/codex_bop_test","Scaling","1m - 5m","1m - 5m","Get clients consistently","Better systems for enquiries, contracts, delivery and follow-up","Build better client systems; Build a multi-million photography business","Ready to commit","Payment plan","TEST: verifying BOP application workflow","TEST: verifying Sheet population","TEST: verifying Bedge statement",52,"Strong Potential","Medium Lead","TEST ROW - safe to delete","TEST ROW - safe to delete"]]'
```

After appending, read the Sheet again and confirm the test email/phone is visible. Then search GHL for the same test email/phone to confirm the CRM side.

## Clean Env Rules

- Keep Google Sheet operations in `gws`.
- Keep Vercel Google auth as the single `GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON` export.
- Do not store empty Google OAuth placeholders in this project.
- Keep test records clearly marked with `Codex Test`, `TEST`, or a `bop-test-...` email.

## Netlify Deployment

This repo was originally built for Vercel, where files inside `api/` automatically become serverless routes like `/api/submit`.

Netlify does not expose the `api/` folder that way by default, so the repo includes `netlify.toml` plus wrappers in `netlify/functions/`. These keep the public routes the same:

- `/api/submit`
- `/api/community-join`
- `/api/track-engagement`
- `/api/webinar-attendance`

Required Netlify environment variables:

- `GOOGLE_WORKSPACE_CLI_CREDENTIALS_JSON`
- `BOP_ADMISSIONS_SHEET_ID`
- `KOPPOH_GHL_LOCATION_ID`
- `KOPPOH_GHL_PIT_TOKEN`
- `KOPPOH_BOP_COMMUNITY_URL`
- `BOP_WEBINAR_ATTENDANCE_SHEET_ID`

Do not use `GWS_CLIENT_ID`, `GWS_CLIENT_SECRET`, or `GWS_REFRESH_TOKEN` for the Netlify deployment. The live backend reads the single exported Google Workspace JSON credential.

## Webinar Attendance Form

Page: `/webinar-attendance.html`

Use one link per webinar session. The form reads webinar details from URL parameters and sends attendees straight to the `meeting` link after they submit:

```text
/webinar-attendance.html?title=BOP%20Admissions%20Webinar&date=Monday%2C%201%20June%202026&time=6%3A00%20PM%20WAT&meeting=https%3A%2F%2Fexample.com%2Fmeeting-link
```

Fields shown to attendees:
- Full Name
- Email
- Phone

CRM validation:
- The form does not gate webinar access.
- Every submission is logged to the webinar attendance Sheet with Date, Name, Email, and Phone.
- In the backend, the API searches GHL by name, email, and phone.
- If at least 2 of the 3 details match the same GHL contact, it applies `bop-webinar-attended`, updates Webinar Status to `Attended`, refreshes engagement score, and moves/creates the BOP Admissions opportunity at `Webinar Attended`.
- If fewer than 2 details match, the attendee still joins the webinar, the Sheet row remains available for sales follow-up, and GHL gets/updates a contact tagged `bop-webinar-attendee-unknown` with Webinar Status `Unknown Attendee`.
