# Email setup

The registration system sends its emails (verification codes, password reset codes, invitations, proof received, payment confirmed and so on) from the central mailbox **iol2027.th@gmail.com**, through Gmail, using a Gmail **app password**.

**Decision (16 October 2026):** IOL 2027 has no domain of its own (no `@iol2027.org` or similar), so all email goes out from the Gmail address. That rules out services such as Resend for real sending, because they can only send from a domain whose DNS you control.

**Status:** working on the dev server since 21 October 2026. The app password is stored in the secret `iol2027-gmail-app-password`, and a test invitation reached a real Gmail inbox. Steps 1 and 2 below are done; repeat them only to replace the password.

---

## 1. Create the app password (owner of iol2027.th@gmail.com, about 5 minutes)

An app password is a separate 16-letter password that lets one program send mail as the account. It cannot be used to sign in to Gmail on the web, and it can be revoked at any time without changing the real password.

1. Sign in to Google as **iol2027.th@gmail.com**.
2. **2-Step Verification must be on.** Open https://myaccount.google.com/signinoptions/two-step-verification. If it is off, turn it on (this is the step that needs the phone that holds the account's second factor).
3. Open https://myaccount.google.com/apppasswords.
4. App name: `IOL 2027 registration`. Click **Create**.
5. Google shows a 16-letter password in four groups, like `abcd efgh ijkl mnop`. **Copy it now**; Google shows it only once.

## 2. Store it

From a terminal signed in to the `iol2027` Google Cloud project:

```bash
gcloud secrets create iol2027-gmail-app-password --project=iol2027 --replication-policy=user-managed --locations=asia-southeast1 --data-file=-
```

Paste the password, press **Enter**, then **Ctrl+Z** and **Enter** (Windows) or **Ctrl+D** (Mac/Linux). Then tell the developer it is stored. (Spaces are fine; the server removes them.)

## 3. Settings the developer applies

| Setting | Value |
| --- | --- |
| `GMAIL_USER` | `iol2027.th@gmail.com` |
| `GMAIL_APP_PASSWORD` | from the secret `iol2027-gmail-app-password` |
| `EMAIL_FROM` | optional; defaults to `IOL 2027 Registration <iol2027.th@gmail.com>` |
| `FINANCE_EMAIL` | optional; an address that gets an alert for every proof upload |

When `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set, Gmail is used even if a Resend key is also present.

## 4. Test it

1. On the development site, open **Forgot your password?** for an account whose email is a real inbox you can read, or ask the registration team to send an invitation code to that address (Back office → Invitation codes).
2. The email should arrive within a minute, from **IOL 2027 Registration &lt;iol2027.th@gmail.com&gt;**. Check spam the first time.
3. A copy of everything sent appears in the **Sent** folder of iol2027.th@gmail.com, and in **Back office → Email log**.

Addresses ending in `.test` (the test accounts) are never really sent; the email log shows them as **Skipped**, and the dev site shows the code on screen instead.

---

## When sending fails

Emails that go out on their own (proof received, the Finance alert, registration submitted, payment confirmed, badges and the daily summary) are kept until they are sent. If Gmail refuses one, the email log shows **Trying again**, and the server tries again after 15 minutes, then 1, 3, 8 and 24 hours. After that it shows **Failed** with Google's reason and a **Try again** button, and the registration admins' home page and daily summary count it.

Verification and password codes, staff account set-up codes and invitation codes are not kept: whoever sent them sees the error on screen and can send again.

## Badge emails and the daily summary

- **Badges**: once a registration is submitted, paid and everyone's arrival and departure are in, the Team Leader gets each person's badge as a PDF, exactly as it will be printed, and is asked to check the names by the print cut-off. If anything on a badge changes later (a name, role or team, a new QR, a person added or removed), they get every badge again at 8:00 Bangkok time the next morning, with the changes listed. One email a day at most.
- **Daily summary**: registration admins and super admins get a short email at 8:00 Bangkok time with the badges to print and to print again, the print cut-off, and any emails that could not be sent. It is sent only when those numbers have changed since the last one.

## Limits

| | |
| --- | --- |
| Daily limit | About **500 recipients a day** for a normal Gmail account. Plenty for registration (about 60 countries, a few emails each). |
| Announcements to everyone (~500 people) | Would use a whole day's allowance. Send them over two days, or as one email with the recipients in BCC from Gmail directly. |
| If the limit is hit | Gmail refuses further sends for about 24 hours; the email log shows them as **Failed** with Google's reason. |

## Things that stop email working

| Symptom in the email log | Cause and fix |
| --- | --- |
| **Failed**: "Invalid login" or "Username and Password not accepted" | The app password was revoked, or the account password was changed (which revokes all app passwords). Create a new app password (step 1) and add it as a new secret version: `gcloud secrets versions add iol2027-gmail-app-password --project=iol2027 --data-file=-`, then ask the developer to redeploy. |
| **Failed**: "Daily user sending limit exceeded" | The 500-a-day limit; wait 24 hours. |
| **Trying again** | Sending failed; the server tries again on its own. The reason is shown under it. |
| **Queued** | Email is switched off on that server (no Gmail or Resend settings). |
| **Skipped** | A `.test` address; expected for test accounts. |

## Resend (no longer used)

A Resend account exists (owner iol2027.th@gmail.com). Without a domain it can only deliver to iol2027.th@gmail.com, so it was a stand-in until the Gmail app password existed. Its key was taken off the server on 21 October 2026; the secret `iol2027-resend-api-key` is kept but unused. Still to do: delete the `iol2027-test` key in the Resend dashboard, because it was shared in a chat. The code can still send through Resend (`RESEND_API_KEY` and `EMAIL_FROM`) if a domain is ever added.
