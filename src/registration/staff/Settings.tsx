import { useState, type FormEvent } from 'react'
import { api, type FeeSettings, type Fees, type GuardianConsentPolicy } from '../api'
import { Alert, Facts } from '../ui'
import { Done, Note, Panel, Problem, day, errorText, useLoad } from './common'

type SettingsData = { fees: FeeSettings; guardianConsent: GuardianConsentPolicy; example: Fees; recalculated?: number }

const usd = (n: number) => `USD ${n.toLocaleString('en-US')}`

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
      const result = await api<SettingsData>('/api/admin/settings/fees', {
        method: 'PUT',
        body: {
          earlyBirdEnds: value('earlyBirdEnds'), teamFee: { early_bird: value('earlyTeamFee'), normal: value('normalTeamFee') },
          roomsPerTeam: value('roomsPerTeam'), roomRate: value('roomRate'), observerFee: value('observerFee') === '' ? null : value('observerFee'),
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
            <NumberField name="earlyTeamFee" label="Team fee, early bird (USD)" value={fees.teamFee.early_bird} disabled={!canEdit} />
            <NumberField name="normalTeamFee" label="Team fee, normal (USD)" value={fees.teamFee.normal} disabled={!canEdit} />
            <NumberField name="roomRate" label="Room rate (USD)" value={fees.roomRate} hint="Per room for the whole stay." disabled={!canEdit} />
            <NumberField name="roomsPerTeam" label="Rooms per team" value={fees.roomsPerTeam} disabled={!canEdit} />
            <NumberField name="observerFee" label="Observer fee (USD)" value={fees.observerFee ?? ''} hint="Leave empty while the rate is not decided; invoices then say “rate to be confirmed”." disabled={!canEdit} />
          </div>
          <h3 className="reg-staff-subhead">Example: 2 teams and 1 observer, today</h3>
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
