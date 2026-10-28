// Scheduled work. Cloud Scheduler calls POST /api/jobs/tick every 15 minutes with a token Google signs for the
// scheduler's service account (JOBS_INVOKER), addressed to this API (JOBS_AUDIENCE, its Cloud Run URL). Each tick:
//   - tries again the emails whose sending failed (email.js);
//   - sends the badges to any settled registration whose Team Leader has not had them yet (a safety net: they
//     normally go the moment the registration settles);
//   - from 8:00 Bangkok time, once a day: emails each Team Leader whose badges changed since their last badge email,
//     then sends the registration admins a summary of badges to print, if it differs from the last one.
// Without JOBS_AUDIENCE and JOBS_INVOKER (local development) the endpoint answers 404; call runTick() instead.
import { OAuth2Client } from 'google-auth-library'
import { HttpError } from './auth.js'
import { badgeCounts } from './badge-admin.js'
import { bangkokDate, sendBadgesIfSettled } from './badges.js'
import { buildSummaryEmail, retryDueEmails, sendEmail } from './email.js'
import { loadSettings } from './fees.js'
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

const settled = `registration_status NOT IN ('draft', 'cancelled') AND payment_status = 'approved'`

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

export function registerJobRoutes(app) {
  app.post('/api/jobs/tick', fromScheduler, asyncHandler(async (_req, res) => {
    const report = await runTick()
    console.log('tick', JSON.stringify(report))
    res.json(report)
  }))
}
