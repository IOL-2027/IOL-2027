// One-time codes sent by email: account verification and password reset or setup.
import crypto from 'node:crypto'
import { HttpError } from './auth.js'
import { buildPasswordCodeEmail, buildVerificationEmail, sendEmail } from './email.js'
import { exposeDevCodes, hashToken, portalUrl, query, requireDb } from './lib.js'

const newCode = () => String(crypto.randomInt(100000, 1000000))

/** Sends the email and reports whether it really went out; on the dev site the code comes back instead. */
async function deliver({ account, subject, html, purpose, code, failMessage }) {
  let configured = false
  try {
    configured = (await sendEmail({ pool: requireDb(), to: account.email, subject, html, purpose, accountId: account.id })).configured
  } catch (error) {
    console.error(`${purpose} email failed`, error.message)
    if (!exposeDevCodes) throw new HttpError(502, failMessage)
  }
  return { emailSent: configured, developmentCode: exposeDevCodes && !configured ? code : undefined }
}

export async function issueVerificationCode(account) {
  const code = newCode()
  await query(
    `INSERT INTO email_verification_tokens (account_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '30 minutes')`,
    [account.id, hashToken(code)],
  )
  const { subject, html } = buildVerificationEmail({ countryTerritory: account.countryTerritory || 'your delegation', fullName: account.fullName, code })
  return deliver({ account, subject, html, purpose: 'account_verification', code, failMessage: 'The verification email could not be sent. Please try again.' })
}

/** A 6-digit code that lets the account holder choose a new password. `setup` is for staff accounts created by an organiser. */
export async function issuePasswordCode(account, { setup = false } = {}) {
  const code = newCode()
  await query(
    // Organisers create staff accounts ahead of time, so a setup code lasts a week; a reset code 30 minutes.
    `INSERT INTO password_reset_tokens (account_id, token_hash, expires_at) VALUES ($1, $2, now() + $3::interval)`,
    [account.id, hashToken(code), setup ? '7 days' : '30 minutes'],
  )
  const { subject, html } = buildPasswordCodeEmail({ fullName: account.fullName, code, setup, portalUrl })
  return deliver({ account, subject, html, purpose: setup ? 'account_setup' : 'password_reset', code, failMessage: 'The email could not be sent. Please try again.' })
}
