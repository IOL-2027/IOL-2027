import { useState, type FormEvent } from 'react'
import { api, type FeeSettings, type Fees, type GuardianConsentPolicy, type InvoiceSettings } from '../api'
import { Alert, Facts } from '../ui'
import { Done, Note, Panel, Problem, TableWrap, day, errorText, useLoad } from './common'

type SettingsData = { fees: FeeSettings; guardianConsent: GuardianConsentPolicy; invoice: InvoiceSettings; example: Fees; recalculated?: number }

const usd = (n: number) => `USD ${n.toLocaleString('en-US')}`
const tiers = [['early_bird', 'Early bird'], ['normal', 'Regular']] as const
// [category, column heading, its teams]: a country that is not accredited registers one team.
const categories = [
  ['previous_host', 'Accredited, previous host', ['first team', 'second team']],
  ['accredited', 'Accredited', ['first team', 'second team']],
  ['non_accredited', 'Not accredited', ['team']],
] as const

function NumberField({ name, label, value, hint, disabled, step = '1' }: { name: string; label: string; value: number | string; hint?: string; disabled?: boolean; step?: string }) {
  return (
    <div className="reg-field">
      <label htmlFor={`set-${name}`}>{label}</label>
      {hint && <p className="reg-hint" id={`set-${name}-hint`}>{hint}</p>}
      <input id={`set-${name}`} name={name} className="reg-control" type="number" min="0" step={step} defaultValue={value} disabled={disabled} aria-describedby={hint ? `set-${name}-hint` : undefined} />
    </div>
  )
}

export function FeeSettingsPanel({ canEdit }: { canEdit: boolean }) {
  const { data, error, reload } = useLoad<SettingsData>('/api/admin/settings')
  const [saveError, setSaveError] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = (name: string) => String(form.get(name) ?? '').trim()
    setSaveError(''); setDone(''); setBusy(true)
    try {
      const teamFees = Object.fromEntries(tiers.map(([tier]) => [tier, Object.fromEntries(categories.map(([category, , teams]) => [category, teams.map((_, i) => value(`fee-${tier}-${category}-${i}`))]))]))
      const result = await api<SettingsData>('/api/admin/settings/fees', {
        method: 'PUT',
        body: {
          earlyBirdEnds: value('earlyBirdEnds'), registrationEnds: value('registrationEnds'), teamFees,
          observerFee: value('observerFee') === '' ? null : value('observerFee'), singleRoomFee: value('singleRoomFee'), maxObserversPerTeam: value('maxObserversPerTeam'),
        },
      })
      setDone(`Fees saved.${result.recalculated ? ` ${result.recalculated} unpaid ${result.recalculated === 1 ? 'invoice was' : 'invoices were'} updated to the new amounts.` : ''}`)
      reload()
    } catch (e) {
      setSaveError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const fees = data?.fees
  return (
    <Panel id="fees" title="Fees" intro={canEdit ? 'Finance owns these numbers. A change applies to new invoices and to invoices not yet paid; payments already under review or approved keep their amount.' : 'Set by Finance. Shown here for reference.'}>
      <Problem message={error} />
      {fees && data && (
        <form onSubmit={save} noValidate key={JSON.stringify(fees)}>
          <div className="reg-grid reg-grid-3">
            <div className="reg-field">
              <label htmlFor="set-earlyBirdEnds">Early bird ends</label>
              <p className="reg-hint" id="set-earlyBirdEnds-hint">Last day of the early-bird rate, Bangkok time.</p>
              <input id="set-earlyBirdEnds" name="earlyBirdEnds" className="reg-control" type="date" defaultValue={fees.earlyBirdEnds} disabled={!canEdit} aria-describedby="set-earlyBirdEnds-hint" />
            </div>
            <div className="reg-field">
              <label htmlFor="set-registrationEnds">Registration ends</label>
              <p className="reg-hint" id="set-registrationEnds-hint">Invoices at the normal rate are due on this day; early-bird ones when the early bird ends.</p>
              <input id="set-registrationEnds" name="registrationEnds" className="reg-control" type="date" defaultValue={fees.registrationEnds} disabled={!canEdit} aria-describedby="set-registrationEnds-hint" />
            </div>
            <NumberField name="observerFee" label="Observer fee (USD)" value={fees.observerFee ?? ''} hint="Each observer. Leave empty while the rate is not decided; invoices then say “rate to be confirmed”." disabled={!canEdit} />
            <NumberField name="singleRoomFee" label="Single room supplement (USD)" value={fees.singleRoomFee} hint="For each Team Leader or observer who asks for a single room." disabled={!canEdit} />
            <NumberField name="maxObserversPerTeam" label="Observers per team, at most" value={fees.maxObserversPerTeam} hint="Observers are optional." disabled={!canEdit} />
          </div>
          <h3 className="reg-staff-subhead">Team fees (USD)</h3>
          <p className="reg-hint">The fee rate of each country is set on its invitation code. A second team pays the second-team fee on top of the first; a country that is not accredited registers one team.</p>
          <TableWrap label="Team fees">
            <thead><tr><th scope="col">Period</th><th scope="col">Team</th>{categories.map(([category, label]) => <th scope="col" key={category}>{label}</th>)}</tr></thead>
            <tbody>{tiers.flatMap(([tier, label]) => [0, 1].map((team) => (
              <tr key={`${tier}-${team}`}>
                {team === 0 && <th scope="rowgroup" rowSpan={2}>{label}</th>}
                <td>{team === 0 ? 'First team' : 'Second team'}</td>
                {categories.map(([category, categoryLabel, teams]) => <td key={category}>{team < teams.length
                  ? <><label className="reg-visually-hidden" htmlFor={`set-fee-${tier}-${category}-${team}`}>{label}, {categoryLabel}, {teams[team]}</label>
                    <input id={`set-fee-${tier}-${category}-${team}`} name={`fee-${tier}-${category}-${team}`} className="reg-control reg-control-compact" type="number" min="0" step="1" defaultValue={fees.teamFees[tier][category][team]} disabled={!canEdit} /></>
                  : <span className="reg-muted">One team only</span>}</td>)}
              </tr>
            )))}</tbody>
          </TableWrap>
          <h3 className="reg-staff-subhead">Example: an accredited country with 2 teams, 1 observer and 1 single room, today</h3>
          <Facts compact items={[...data.example.lines.map((l) => ({ label: l.label, value: l.amount === null ? 'Rate to be confirmed' : usd(l.amount), help: l.detail })), { label: 'Total', value: usd(data.example.total), help: `${data.example.tierLabel} rate` }]} />
          {canEdit && <>
            <Alert>{saveError}</Alert>
            <div className="reg-staff-form-actions"><button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save fees'}</button></div>
          </>}
          <Done message={done} />
        </form>
      )}
    </Panel>
  )
}

function TextField({ name, label, value, hint, disabled, wide, optional }: { name: string; label: string; value: string; hint?: string; disabled?: boolean; wide?: boolean; optional?: boolean }) {
  return (
    <div className={`reg-field${wide ? ' reg-field-wide' : ''}`}>
      <label htmlFor={`set-${name}`}>{label}{optional && <span className="reg-optional"> (optional)</span>}</label>
      {hint && <p className="reg-hint" id={`set-${name}-hint`}>{hint}</p>}
      <input id={`set-${name}`} name={name} className="reg-control" defaultValue={value} disabled={disabled} aria-describedby={hint ? `set-${name}-hint` : undefined} />
    </div>
  )
}

/** Who invoices come from and the account they ask for, as on Finance's invoice template. */
export function InvoiceSettingsPanel({ canEdit }: { canEdit: boolean }) {
  const { data, error, reload } = useLoad<SettingsData>('/api/admin/settings')
  const [saveError, setSaveError] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = (name: string) => String(form.get(name) ?? '').trim()
    setSaveError(''); setDone(''); setBusy(true)
    try {
      const result = await api<SettingsData>('/api/admin/settings/invoice', {
        method: 'PUT',
        body: {
          issuerName: value('issuerName'), issuerTin: value('issuerTin'), issuerAddress: value('issuerAddress'),
          bank: {
            beneficiaryName: value('beneficiaryName'), beneficiaryAddress: value('beneficiaryAddress'), bankName: value('bankName'),
            bankAddress: value('bankAddress'), accountNumber: value('accountNumber'), swiftCode: value('swiftCode'),
          },
        },
      })
      setDone(result.invoice.bank ? 'Saved. Invoices and the Payment step now show this account.' : 'Saved. Invoices say the bank account is still to come.')
      reload()
    } catch (e) {
      setSaveError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const invoice = data?.invoice
  const bank = invoice?.bank
  return (
    <Panel id="invoice" title="Invoice and bank account" intro={canEdit
      ? 'What every invoice says about the organisers. The bank account also appears on each Team Leader’s Payment step. Leave the bank fields empty until the account is confirmed.'
      : 'Set by Finance. Shown here for reference.'}>
      <Problem message={error} />
      {invoice && (
        <form onSubmit={save} noValidate key={JSON.stringify(invoice)}>
          <h3 className="reg-staff-subhead">Recipient on the invoice</h3>
          <div className="reg-grid">
            <TextField name="issuerName" label="Name" value={invoice.issuerName} disabled={!canEdit} />
            <TextField name="issuerTin" label="Tax identification number (TIN)" value={invoice.issuerTin} disabled={!canEdit} optional />
            <TextField name="issuerAddress" label="Address" value={invoice.issuerAddress} disabled={!canEdit} wide />
          </div>
          <h3 className="reg-staff-subhead">Bank transfer details</h3>
          <div className="reg-grid">
            <TextField name="beneficiaryName" label="Beneficiary name" value={bank?.beneficiaryName ?? ''} disabled={!canEdit} />
            <TextField name="bankName" label="Bank name" value={bank?.bankName ?? ''} disabled={!canEdit} />
            <TextField name="beneficiaryAddress" label="Beneficiary address" value={bank?.beneficiaryAddress ?? ''} disabled={!canEdit} optional wide />
            <TextField name="bankAddress" label="Bank address" value={bank?.bankAddress ?? ''} disabled={!canEdit} optional wide />
            <TextField name="accountNumber" label="Account number" value={bank?.accountNumber ?? ''} disabled={!canEdit} />
            <TextField name="swiftCode" label="SWIFT code" value={bank?.swiftCode ?? ''} hint="8 or 11 letters and digits." disabled={!canEdit} />
          </div>
          <p><a className="reg-btn-link" href="/api/admin/settings/invoice-sample" target="_blank" rel="noreferrer">See a sample invoice with the saved details</a></p>
          {canEdit && <>
            <Alert>{saveError}</Alert>
            <div className="reg-staff-form-actions"><button type="submit" className="reg-btn reg-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save invoice details'}</button></div>
          </>}
          <Done message={done} />
        </form>
      )}
    </Panel>
  )
}

export function ConsentSettingsPanel({ canEdit }: { canEdit: boolean }) {
  const { data, error, reload } = useLoad<SettingsData>('/api/admin/settings')
  const [saveError, setSaveError] = useState('')
  const [done, setDone] = useState('')

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaveError(''); setDone('')
    try {
      const result = await api<SettingsData>('/api/admin/settings/guardian-consent', {
        method: 'PUT', body: { required: form.get('required') === 'on', ageThreshold: String(form.get('ageThreshold') ?? ''), referenceDate: String(form.get('referenceDate') ?? '') },
      })
      setDone(result.guardianConsent.required ? 'Saved. Team Leaders now see an upload on each contestant under the age limit, and cannot submit without it.' : 'Saved. Guardian consent is not required.')
      reload()
    } catch (e) {
      setSaveError(errorText(e))
    }
  }

  const policy = data?.guardianConsent
  return (
    <Panel id="consent" title="Guardian consent" intro="Whether contestants under a certain age need a consent form signed by a parent or guardian. Off until the organisers decide the policy.">
      <Problem message={error} />
      {policy && (
        <form onSubmit={save} noValidate key={JSON.stringify(policy)}>
          <label className="reg-check reg-toggle-row">
            <input type="checkbox" name="required" defaultChecked={policy.required} disabled={!canEdit} />
            <span>Require a signed consent form for younger contestants</span>
          </label>
          <div className="reg-grid">
            <NumberField name="ageThreshold" label="Required under this age" value={policy.ageThreshold} disabled={!canEdit} />
            <div className="reg-field">
              <label htmlFor="set-referenceDate">Age is counted on</label>
              <p className="reg-hint" id="set-referenceDate-hint">Usually the first day of the event.</p>
              <input id="set-referenceDate" name="referenceDate" className="reg-control" type="date" defaultValue={policy.referenceDate} disabled={!canEdit} aria-describedby="set-referenceDate-hint" />
            </div>
          </div>
          <Note>Currently {policy.required ? `required for contestants under ${policy.ageThreshold} on ${day(policy.referenceDate)}` : 'not required'}. The consent form template itself still needs to be written and sent to Team Leaders.</Note>
          {canEdit && <>
            <Alert>{saveError}</Alert>
            <div className="reg-staff-form-actions"><button type="submit" className="reg-btn reg-btn-primary">Save policy</button></div>
          </>}
          <Done message={done} />
        </form>
      )}
    </Panel>
  )
}
