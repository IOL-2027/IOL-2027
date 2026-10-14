# Email setup (Resend)

The registration system sends its emails (verification codes, proof received, payment confirmed and so on) through **Resend**, an email-sending service. The code is already written. Until Resend is set up, every email is recorded in the database's delivery log but not actually sent. "Switching emails on" means finishing the steps below so they really go out.

There are two stages:

- **Stage A, test mode (about 10 minutes).** No domain needed. Emails can only go to the Resend account's own address. Good for testing the whole flow now.
- **Stage B, real sending (needs DNS access).** Emails go to any Team Leader, from an official IOL 2027 address.

---

## Stage A: test mode

### A1. Create the Resend account

1. Open https://resend.com and click **Get started** (top right).
2. Sign up with **iol2027.th@gmail.com**, the central mailbox, not a personal address, so the account can be handed over later.
3. Open the confirmation email from Resend and click the link.
4. If Resend asks about your use case, choose **Transactional emails**.

### A2. Create a test API key

1. In the left sidebar, click **API Keys**.
2. Click **Create API Key**.
3. Name: `iol2027-test`. Permission: **Sending access**. Domain: **All domains** (there is only Resend's test domain for now).
4. Click **Add**. The key starts with `re_`. **Copy it now**: Resend only shows it once.

### A3. Hand the key over

Do **not** paste the key into chat, email or a commit. Store it in Google Secret Manager from your own terminal:

```bash
gcloud secrets create iol2027-resend-api-key --project=iol2027 --replication-policy=user-managed --locations=asia-southeast1 --data-file=-
```

Paste the key, press **Enter**, then **Ctrl+Z** and **Enter** (Windows) or **Ctrl+D** (Mac/Linux) to finish. Then tell the developer it is stored. The API on Cloud Run reads it from there.

For local testing only, you can instead put it in the project's `.env` file (gitignored):

```
RESEND_API_KEY=re_...
EMAIL_FROM=IOL 2027 Registration <onboarding@resend.dev>
EMAIL_REPLY_TO=iol2027.th@gmail.com
```

### A4. Test it

1. On the development site, start a Team Leader sign-up with a test invite code (see ROLES.md), using **iol2027.th@gmail.com** as the email.
2. The 6-digit code should arrive within a minute. Check the spam folder too.
3. In Resend, **Emails** in the sidebar lists every send and whether it was delivered.

In test mode Resend refuses to send to any address other than the account owner's. That is expected.

---

## Stage B: real sending from an official address

### B1. Choose the sending domain

Resend must prove you control the domain the email comes from, by checking DNS records you add. That rules out `@gmail.com`. Options, best first:

| Option | Example From address | Who adds the DNS records |
| --- | --- | --- |
| **Subdomain of the official site** (recommended) | `registration@mail.iol2027.ioling.org` | Whoever manages `ioling.org` (IOL central team) |
| A Chulalongkorn subdomain | `iol2027@...chula.ac.th` | Chula IT |
| A new domain the team owns | `registration@iol2027.org` | You, but it must be bought (procurement; the source document asks to avoid this) |

Use a **subdomain** such as `mail.` rather than the main domain. It keeps the sending reputation separate and Resend recommends it.

### B2. Add the domain in Resend

1. Sidebar → **Domains** → **Add Domain**.
2. Name: `mail.iol2027.ioling.org` (or your choice from B1).
3. Region: **Tokyo (ap-northeast-1)**, the nearest to Thailand.
4. Click **Add**. Resend shows a table of DNS records, usually:

| Type | Name | Purpose |
| --- | --- | --- |
| MX | `send.mail.iol2027…` | Handles bounces |
| TXT | `send.mail.iol2027…` | SPF: says Resend may send for you |
| TXT | `resend._domainkey.mail.iol2027…` | DKIM: signs each email so it can't be forged |

Also add a **DMARC** record, which Gmail and Outlook increasingly require:

| Type | Name | Value |
| --- | --- | --- |
| TXT | `_dmarc.mail.iol2027.ioling.org` | `v=DMARC1; p=none; rua=mailto:iol2027.th@gmail.com` |

### B3. Ask the DNS owner to add the records

Copy the exact values from Resend's screen; they are unique to your account. A message you can send:

> Subject: DNS records for IOL 2027 registration emails
>
> Hello,
>
> The IOL 2027 registration system needs to send emails (account verification, payment confirmations) from `registration@mail.iol2027.ioling.org`. Could you please add these DNS records to the `ioling.org` zone?
>
> [paste the table from Resend, plus the DMARC record]
>
> They only cover the `mail.iol2027` subdomain and do not affect any other ioling.org email or website. Thank you!

### B4. Verify

1. Once the records are added, go back to **Domains** in Resend and click **Verify DNS Records**.
2. It can take from a few minutes to a few hours. Status changes to **Verified** when done.
3. If it stays **Pending** after 24 hours, check that the names were entered without the domain repeated (a common mistake: `send.mail.iol2027.ioling.org.ioling.org`).

### B5. Create the production key

1. **API Keys** → **Create API Key**.
2. Name: `iol2027-api`. Permission: **Sending access**. Domain: **mail.iol2027.ioling.org** only.
3. Copy it and replace the stored secret with the new one:

```bash
gcloud secrets versions add iol2027-resend-api-key --project=iol2027 --data-file=-
```

4. Delete the old `iol2027-test` key in Resend.

### B6. Settings the developer applies

| Setting | Value |
| --- | --- |
| `EMAIL_FROM` | `IOL 2027 Registration <registration@mail.iol2027.ioling.org>` |
| `EMAIL_REPLY_TO` | `iol2027.th@gmail.com` (replies reach the central mailbox) |
| `FINANCE_EMAIL` | The Finance team's address, which gets an alert for every proof upload |

### B7. Final check

1. Sign up with a test invite code using a personal Gmail address.
2. In Gmail open the email → **⋮** → **Show original**. **SPF**, **DKIM** and **DMARC** should all say **PASS**.

---

## Limits and costs

| Plan | Emails | Notes |
| --- | --- | --- |
| Free | 3,000 a month, **100 a day** | Enough for normal registration traffic |
| Pro (USD 20/month) | 50,000 a month, no daily cap | Needed for announcements to all ~500 participants, or busy deadline days |

Resend keeps its own log for 30 days. The system's `email_deliveries` table keeps every send permanently.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Emails logged with status `queued`, nothing sent | `RESEND_API_KEY` or `EMAIL_FROM` not set on the server |
| Status `failed`: "You can only send testing emails to your own email address" | Still in test mode (Stage A) |
| Status `failed`: "domain is not verified" | Stage B4 not finished, or `EMAIL_FROM` uses a different domain |
| Emails land in spam | DMARC missing, or the From domain doesn't match the verified domain |
