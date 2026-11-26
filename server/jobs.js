// Scheduled work. Cloud Scheduler calls POST /api/jobs/tick every 15 minutes with a token Google signs for the
// scheduler's service account (JOBS_INVOKER), addressed to this API (JOBS_AUDIENCE, its Cloud Run URL). Each tick:
//   - tries again the emails whose sending failed (email.js);
//   - sends the badges to any settled registration whose Team Leader has not had them yet (a safety net: they
//     normally go the moment the registration settles);
//   - from 8:00 Bangkok time, once a day: emails each Team Leader whose badges changed since their last badge email,
//     then sends the registration admins a summary of badges to print, if it differs from the last one;
//   - and, in the week before each deadline, reminds each registration that still has something to do (once each):
//     the early bird rate, the last day of registration, People, travel and the contest languages.
// Without JOBS_AUDIENCE and JOBS_INVOKER (local development) the endpoint answers 404; call runTick() instead.
import { OAuth2Client } from 'google-auth-library'
import { HttpError } from './auth.js'
import { badgeCounts } from './badge-admin.js'
import { bangkokDate, missingTravel, sendBadgesIfSettled } from './badges.js'
import { buildReminderEmail, buildSummaryEmail, retryDueEmails, sendEmail } from './email.js'
import { delegationFees, loadSettings } from './fees.js'
import { asyncHandler, portalUrl, query, requireDb } from './lib.js'

const audience = process.env.JOBS_AUDIENCE
const invoker = process.env.JOBS_INVOKER
const google = new OAuth2Client()
// Held while a tick runs, so two never overlap (a slow tick and the next one, for example).
const TICK_LOCK = 202715

/** Today's 8:00 in Bangkok (UTC+7 all year). */
const morningOf = (now) => new Date(`${bangkokDate(now)}T08:00:00+07:00`)
const logged = (what) => (error) => { console.error(what, error.message); return {} }

async function getState(key) {
  return (await query('SELECT value FROM job_state WHERE key = $1', [key])).rows[0]?.value ?? null
}

async function setState(key, value) {
  await query(
    `INSERT INTO job_state (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  )
}

// Paid, or nothing to pay: a jury member or volunteer with no observer and no single room has no payment at all (submitting
// asks for one whenever something is owed), and their badge must not wait for one (review of 27 Nov 2026).
const settled = `registration_status NOT IN ('draft', 'cancelled') AND (payment_status = 'approved' OR (kind <> 'country' AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.delegation_id = delegations.id)))`

/** Registrations that look settled but whose Team Leader never got the badges. Their travel is checked on the way. */
async function missedBadges() {
  const due = (await query(`SELECT id FROM delegations WHERE badges_mailed IS NULL AND ${settled}`)).rows
  let sent = 0
  for (const { id } of due) if ((await sendBadgesIfSettled(id).catch(logged(`badges for ${id}`))).sent) sent++
  return sent
}

/** The morning update: each Team Leader last emailed before `morning` gets the badges again if any changed. */
async function badgeUpdates(morning) {
  const due = (await query(`SELECT id FROM delegations WHERE badges_mailed_at < $1 AND ${settled} ORDER BY country_territory`, [morning])).rows
  let sent = 0
  for (const { id } of due) if ((await sendBadgesIfSettled(id, { update: true }).catch(logged(`badge update for ${id}`))).sent) sent++
  return { checked: due.length, sent }
}

/**
 * The registration admins' summary (super admins too): badges to print or reprint, and emails that gave up. Sent when
 * there is something to do and the numbers differ from the last summary, so an unchanged backlog is not repeated daily.
 */
async function summary(now) {
  const [counts, emails, settings, admins] = await Promise.all([
    badgeCounts(),
    query(
      `SELECT count(*) FILTER (WHERE status = 'failed' AND message IS NOT NULL)::int AS failed,
         count(*) FILTER (WHERE purpose IN ('badges_issued', 'badges_updated') AND created_at > now() - interval '1 day')::int AS badge_emails
       FROM email_deliveries`,
    ),
    loadSettings(requireDb()),
    query(`SELECT id, email, full_name FROM accounts WHERE role IN ('registration_admin', 'super_admin') AND disabled_at IS NULL ORDER BY email`),
  ])
  const numbers = { ...counts, failedEmails: emails.rows[0].failed }
  const key = JSON.stringify(numbers)
  const last = await getState('summary')
  const send = numbers.toPrint + numbers.reprint + numbers.needQr + numbers.failedEmails > 0 && key !== last?.key
  if (send) {
    const { printCutoff } = settings.badges
    const daysToCutoff = Math.round((Date.parse(printCutoff) - Date.parse(bangkokDate(now))) / 86_400_000)
    for (const admin of admins.rows) {
      const { subject, html } = buildSummaryEmail({ fullName: admin.full_name, ...numbers, badgeEmails: emails.rows[0].badge_emails, printCutoff, daysToCutoff, portalUrl })
      await sendEmail({ pool: requireDb(), to: admin.email, subject, html, purpose: 'daily_summary', accountId: admin.id, retry: true }).catch(logged('summary email'))
    }
  }
  await setState('summary', { day: bangkokDate(now), key: send ? key : last?.key ?? null })
  return send ? admins.rowCount : 0
}

// What still blocks a registration (index.js missingForSubmission), passed in by registerJobRoutes.
let missingFor = async () => ({ missing: [] })
const REMINDER_DAYS = 7
const longDate = (iso) => new Date(`${iso}T12:00:00+07:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' })

/**
 * Reminders before each deadline (IOL Board, 16 Nov 2026), from seven days before it until the day itself, once to
 * each registration that still has something to do for it. Whether one went is in the email log (its purpose).
 */
async function reminders(now) {
  const { fees, event } = await loadSettings(requireDb())
  const today = bangkokDate(now)
  const inWindow = (deadline) => today <= deadline && Date.parse(deadline) - Date.parse(today) <= REMINDER_DAYS * 86_400_000
  const delegations = (await query(`SELECT * FROM delegations WHERE registration_status <> 'cancelled' ORDER BY country_territory`)).rows
  const already = async (purpose, id) => (await query('SELECT 1 FROM email_deliveries WHERE purpose = $1 AND delegation_id = $2 LIMIT 1', [purpose, id])).rowCount > 0
  const paid = async (id) => (await query(`SELECT 1 FROM payments WHERE delegation_id = $1 AND status IN ('awaiting_review', 'approved') LIMIT 1`, [id])).rowCount > 0
  const rules = [
    { key: 'reminder_early_bird', deadline: fees.earlyBirdEnds, title: 'The early bird rate ends soon', lead: 'To keep the early bird rate, upload your proof of payment by', step: 'payment',
      items: async (d) => ((d.kind === 'country' || delegationFees(fees, d).total > 0) && !(await paid(d.id)) ? ['Transfer the fees and upload the bank’s proof of transfer'] : []) },
    { key: 'reminder_registration_end', deadline: fees.registrationEnds, title: 'Registration closes soon', lead: 'Please finish and submit your registration by', step: 'submit',
      items: async (d) => (d.registration_status === 'draft' ? (await missingFor(d.id)).missing : []) },
    { key: 'reminder_people', deadline: event.peopleDeadline, title: 'Everyone’s details are due soon', lead: 'Please complete everyone’s details in People by', step: 'people',
      items: async (d) => (await missingFor(d.id)).missing.filter((item) => item.includes(':') && !/^Invoice/.test(item)) },
    { key: 'reminder_travel', deadline: event.travelDeadline, title: 'Flight details are due soon', lead: 'Please add everyone’s arrival and departure in Travel by', step: 'travel',
      items: async (d) => missingTravel(d.id) },
    { key: 'reminder_languages', deadline: event.languageLock, title: 'Contest languages lock soon', lead: 'Contest languages can be chosen and changed until', step: 'teams',
      items: async (d) => (d.kind !== 'country' ? [] : [
        ...(await query('SELECT name FROM teams WHERE delegation_id = $1 AND contest_language IS NULL ORDER BY code', [d.id])).rows.map((t) => `${t.name}: team contest language`),
        ...(await query(`SELECT display_name FROM members WHERE delegation_id = $1 AND role = 'contestant' AND exam_language IS NULL ORDER BY display_name`, [d.id])).rows.map((m) => `${m.display_name}: individual contest language`),
      ]) },
  ]
  let sent = 0
  for (const rule of rules.filter((r) => inWindow(r.deadline))) {
    for (const d of delegations) {
      if (await already(rule.key, d.id)) continue
      const items = await rule.items(d).catch(logged(`${rule.key} for ${d.id}`))
      if (!Array.isArray(items) || !items.length) continue
      const { subject, html } = buildReminderEmail({
        fullName: d.national_representative_name, countryTerritory: d.country_territory, title: rule.title, lead: rule.lead, deadline: longDate(rule.deadline),
        items, buttonLabel: 'Continue your registration', url: `${portalUrl}/?step=${rule.step}`, kind: d.kind,
      })
      await sendEmail({ pool: requireDb(), to: d.team_leader_email, subject, html, purpose: rule.key, delegationId: d.id, retry: true }).catch(logged(rule.key))
      sent++
    }
  }
  return sent
}

/** One run of the scheduled work. Returns what it did. */
export async function runTick(now = new Date()) {
  const pool = requireDb()
  const lock = await pool.connect()
  try {
    if (!(await lock.query('SELECT pg_try_advisory_lock($1) AS ok', [TICK_LOCK])).rows[0].ok) return { skipped: 'Another run is still going.' }
    try {
      const report = { emails: await retryDueEmails(pool), missedBadges: await missedBadges() }
      const day = bangkokDate(now)
      if (now >= morningOf(now)) {
        if ((await getState('badge_updates'))?.day !== day) {
          report.badgeUpdates = await badgeUpdates(morningOf(now))
          await setState('badge_updates', { day })
        }
        if ((await getState('summary'))?.day !== day) report.summaryEmails = await summary(now)
        if ((await getState('reminders'))?.day !== day) {
          report.reminders = await reminders(now).catch(logged('reminders'))
          await setState('reminders', { day })
        }
      }
      return report
    } finally {
      await lock.query('SELECT pg_advisory_unlock($1)', [TICK_LOCK])
    }
  } finally {
    lock.release()
  }
}

/** Lets through only requests Google signed for the scheduler's service account, addressed to this API. */
async function fromScheduler(req, _res, next) {
  if (!audience || !invoker) return next(new HttpError(404, 'Not found.'))
  const token = /^Bearer (\S+)$/.exec(req.get('authorization') ?? '')?.[1]
  if (!token) return next(new HttpError(401, 'Missing token.'))
  try {
    const claims = (await google.verifyIdToken({ idToken: token, audience })).getPayload()
    if (claims?.email !== invoker || !claims.email_verified) return next(new HttpError(403, 'Not allowed.'))
  } catch {
    return next(new HttpError(401, 'Invalid token.'))
  }
  next()
}

export function registerJobRoutes(app, { missingForSubmission } = {}) {
  if (missingForSubmission) missingFor = missingForSubmission
  app.post('/api/jobs/tick', fromScheduler, asyncHandler(async (_req, res) => {
    const report = await runTick()
    console.log('tick', JSON.stringify(report))
    res.json(report)
  }))
}
