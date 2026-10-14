import { useRef, useState, type FormEvent } from 'react'
import { KeyRound, Power, UserPlus } from 'lucide-react'
import { api, roleLabel, type Role, type User } from '../api'
import { Alert, TextField } from '../ui'
import { DevCodeNote, Done, FilterField, Panel, Problem, TableWrap, errorText, useLoad, when } from './common'

type AccountRow = { id: string; email: string; fullName: string; role: Role; lastLoginAt: string | null; disabledAt: string | null; emailVerifiedAt: string | null }

export default function Accounts({ me }: { me: User }) {
  const { data, error, reload } = useLoad<{ accounts: AccountRow[]; roles: Role[]; staffRoles: Role[] }>('/api/admin/accounts')
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [createError, setCreateError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [setup, setSetup] = useState<{ code?: string; who: string }>()
  const [search, setSearch] = useState('')
  // New staff start with the least access; raise it deliberately.
  const [newRole, setNewRole] = useState<Role>('viewer')
  const formRef = useRef<HTMLFormElement>(null)

  const act = async (work: () => Promise<string>) => {
    setMessage(''); setActionError(''); setSetup(undefined)
    try { setMessage(await work()); reload() } catch (e) { setActionError(errorText(e)) }
  }
  const changeRole = (account: AccountRow, role: Role) => act(async () => {
    await api(`/api/admin/accounts/${account.id}`, { method: 'PATCH', body: { role } })
    return `${account.email} is now ${roleLabel[role]}. They have been signed out so the change applies straight away.`
  })
  const toggle = (account: AccountRow) => act(async () => {
    await api(`/api/admin/accounts/${account.id}`, { method: 'PATCH', body: { disabled: !account.disabledAt } })
    return account.disabledAt ? `${account.email} can sign in again.` : `${account.email} is disabled and has been signed out.`
  })
  const newCode = (account: AccountRow) => act(async () => {
    const result = await api<{ emailSent: boolean; developmentCode?: string }>(`/api/admin/accounts/${account.id}/setup-code`, { method: 'POST' })
    setSetup({ code: result.developmentCode, who: account.email })
    return result.emailSent ? `A new setup code was emailed to ${account.email}.` : `A new setup code was created for ${account.email}.`
  })

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const fullName = String(form.get('name') ?? '').trim()
    const role = newRole
    const found: Record<string, string> = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) found.email = 'Enter their email address.'
    if (!fullName) found.name = 'Enter their full name.'
    setFieldErrors(found); setCreateError(''); setMessage(''); setSetup(undefined)
    if (Object.keys(found).length) return
    try {
      const result = await api<{ emailSent: boolean; developmentCode?: string }>('/api/admin/accounts', { method: 'POST', body: { email, fullName, role } })
      setSetup({ code: result.developmentCode, who: email })
      setMessage(result.emailSent
        ? `Account created. ${email} has been emailed a code to set their password (valid for 7 days).`
        : `Account created for ${email}. Email is switched off, so give them the code below. They choose “Forgot your password?” on the sign-in page and enter it there.`)
      formRef.current?.reset()
      setNewRole('viewer')
      reload()
    } catch (e) {
      setCreateError(errorText(e))
    }
  }

  const term = search.trim().toLowerCase()
  const rows = (data?.accounts ?? []).filter((a) => !term || `${a.fullName} ${a.email} ${roleLabel[a.role]}`.toLowerCase().includes(term))
  const status = (a: AccountRow) => (a.disabledAt ? 'Disabled' : !a.lastLoginAt ? 'Not signed in yet' : 'Active')

  return (
    <Panel id="accounts" title="Accounts and roles" intro="Create staff accounts and choose what each person can do. Team Leaders get their accounts through invitation codes, not here.">
      <form ref={formRef} className="reg-staff-form" onSubmit={create} noValidate>
        <h3 className="reg-staff-subhead">Add a staff member</h3>
        <div className="reg-grid reg-grid-3">
          <TextField idPrefix="staff" name="name" label="Full name" error={fieldErrors.name} autoComplete="off" />
          <TextField idPrefix="staff" name="email" label="Email" type="email" error={fieldErrors.email} autoComplete="off" />
          <div className="reg-field">
            <label htmlFor="staff-role">Role</label>
            <select id="staff-role" name="role" className="reg-control" value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
              {(data?.staffRoles ?? []).map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
            </select>
          </div>
        </div>
        <Alert>{createError}</Alert>
        <div className="reg-staff-form-actions"><button type="submit" className="reg-btn reg-btn-primary"><UserPlus size={18} aria-hidden="true" />Create account</button></div>
      </form>

      <Problem message={error || actionError} />
      <Done message={message} />
      {setup && <DevCodeNote code={setup.code} who={setup.who} />}

      <div className="reg-filter-bar">
        <FilterField id="account-search" label="Search">
          <input id="account-search" className="reg-control reg-control-compact" type="search" placeholder="Name, email or role" value={search} onChange={(e) => setSearch(e.target.value)} />
        </FilterField>
      </div>
      {data && <TableWrap label="Accounts">
        <thead><tr><th scope="col">Account</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Last sign-in</th><th scope="col"><span className="reg-visually-hidden">Actions</span></th></tr></thead>
        <tbody>{rows.map((a) => {
          const self = a.id === me.id
          const fixedRole = self || !data.staffRoles.includes(a.role)
          return (
            <tr key={a.id}>
              <th scope="row">{a.fullName}<small>{a.email}</small></th>
              <td>{fixedRole ? roleLabel[a.role] : (
                <><label className="reg-visually-hidden" htmlFor={`role-${a.id}`}>Role for {a.email}</label>
                  <select id={`role-${a.id}`} className="reg-control reg-control-compact" value={a.role} onChange={(e) => changeRole(a, e.target.value as Role)}>
                    {data.staffRoles.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
                  </select></>
              )}</td>
              <td>{status(a)}</td>
              <td>{when(a.lastLoginAt)}</td>
              <td>{!self && <div className="reg-row-actions">
                {!a.disabledAt && !a.lastLoginAt && data.staffRoles.includes(a.role) && <button type="button" className="reg-btn-link" onClick={() => newCode(a)}><KeyRound size={15} aria-hidden="true" />New setup code<span className="reg-visually-hidden"> for {a.email}</span></button>}
                <button type="button" className="reg-btn-link" onClick={() => toggle(a)}><Power size={15} aria-hidden="true" />{a.disabledAt ? 'Enable' : 'Disable'}<span className="reg-visually-hidden"> {a.email}</span></button>
              </div>}</td>
            </tr>
          )
        })}</tbody>
      </TableWrap>}
    </Panel>
  )
}
