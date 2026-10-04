import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Link, MenuItem, Stack, TextField, Typography } from '@mui/material';
import './demo-workspace.css';

type Data = Record<string, unknown>;
type Props = { call: (name: string, args: Data) => Promise<Data>; onConnectionChanged: () => void; busy?: boolean };
type Lesson = { id: string; title: string; description: string; prepared?: string[]; section?: string; status?: string };
type Account = { key: string; label: string; available: boolean; user_id?: number | string; portal?: string };
type Step = { id: string; title: string; description: string; status: string; review?: boolean };
type Run = { id: string | number; lesson_key: string; sandbox: boolean; account_pending?: boolean; view: string; clinic: { name: string }; account?: Account | null; accounts?: Account[]; lessons?: Lesson[]; steps?: Step[]; patient?: { name?: string } | null };
type Demo = { active: boolean; visitor_registered?: boolean; notice?: string; run?: Run; lessons?: Lesson[] };
type Snapshot = { demo: Demo; links?: { id: string; title: string; status: string; url: string }[]; preparation?: { complete: boolean } };
type Intent = { action: string; args: Data; title: string; description: string; button: string };

function snapshot(value: Data): Snapshot {
  if (!value.demo || typeof value.demo !== 'object' || typeof (value.demo as Data).active !== 'boolean')
    throw new Error('The demo response could not be confirmed. Refresh its status before continuing.');
  return value as unknown as Snapshot;
}
const failure = (error: unknown) => error instanceof Error ? error.message : 'The demo action could not be confirmed. Refresh the current status before continuing.';

export function DemoWorkspace({ call, onConnectionChanged, busy = false }: Props) {
  const [state, setState] = useState<Snapshot | null>(null);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [intent, setIntent] = useState<Intent | null>(null);
  const [account, setAccount] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [paused, setPaused] = useState(false);
  const running = useRef(false);
  const stop = useRef(false);
  const mounted = useRef(true);
  const callbacks = useRef({ call, onConnectionChanged });
  callbacks.current = { call, onConnectionChanged };
  const run = state?.demo.active ? state.demo.run : undefined;
  const locked = busy || Boolean(working);
  const lessons = run?.lessons || state?.demo.lessons || [];
  const links = state?.links || [];
  const selectedLesson = lessons.find(lesson => lesson.id === run?.lesson_key);

  function accept(next: Snapshot) {
    if (!mounted.current) return;
    setState(next);
    if (next.demo.run?.account?.key) setAccount(next.demo.run.account.key);
  }

  async function refresh() {
    if (running.current) return;
    running.current = true;
    setWorking('Refreshing demo');
    setError('');
    try {
      accept(snapshot(await callbacks.current.call('meta_clinic_demo', {})));
      callbacks.current.onConnectionChanged();
    } catch (reason) { if (mounted.current) setError(failure(reason)); }
    finally { running.current = false; if (mounted.current) setWorking(''); }
  }

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; stop.current = true; };
  }, []);

  async function prepare(initial: Snapshot, chosen?: string) {
    let current = initial;
    setAttempts(0);
    setPaused(false);
    for (let attempt = 1; attempt <= 24; attempt++) {
      if (stop.current || !mounted.current || !current.demo.active || !current.demo.run?.account_pending) break;
      setWorking('Preparing sandbox');
      current = snapshot(await callbacks.current.call('meta_clinic_demo_action', {
        action: 'prepare', expected_run_id: current.demo.run.id, ...(chosen ? { account: chosen } : {}),
      }));
      accept(current);
      setAttempts(attempt);
      if (!current.demo.run?.account_pending) break;
    }
    if (mounted.current) setPaused(Boolean(current.demo.run?.account_pending));
    return current;
  }

  async function perform(action: string, args: Data = {}) {
    if (running.current || busy) return;
    running.current = true;
    stop.current = false;
    setWorking(action === 'prepare' ? 'Preparing sandbox' : 'Updating demo');
    setError('');
    try {
      let next: Snapshot;
      if (action === 'prepare') {
        if (!state) throw new Error('Refresh the demo before continuing preparation.');
        next = await prepare(state, account || undefined);
      } else {
        next = snapshot(await callbacks.current.call('meta_clinic_demo_action', { action, ...(run ? { expected_run_id: run.id } : {}), ...args }));
        accept(next);
        if (action === 'register') { setName(''); setEmail(''); setCompany(''); }
        if (action === 'enter' && next.demo.run?.account_pending) next = await prepare(next, String(args.account || 'admin'));
      }
      accept(next);
      setIntent(null);
    } catch (reason) {
      if (mounted.current) {
        setError(failure(reason));
        setPaused(true);
      }
      // Read the bound run after an unconfirmed mutation. Never replay its entry/reset.
      try { accept(snapshot(await callbacks.current.call('meta_clinic_demo', {}))); } catch { /* Preserve the original action error and last confirmed snapshot. */ }
    } finally {
      callbacks.current.onConnectionChanged();
      running.current = false;
      if (mounted.current) setWorking('');
    }
  }

  function enter(lessonKey: string, title: string) {
    const args = { lesson_key: lessonKey, ...(run ? { expected_run_id: run.id } : {}), ...(lessonKey === 'sandbox' ? { account: 'admin' } : {}) };
    if (run) setIntent({ action: 'enter', args, title: `Open ${title}?`, description: 'This changes the current demo account and clinic. Leaving a lesson ends its active run and sessions. Finish or discard any open changes before continuing.', button: 'Open demo' });
    else void perform('enter', args);
  }

  const resetIntent = (all: boolean): Intent => ({
    action: all ? 'start_over' : 'leave', args: run ? { expected_run_id: run.id } : {},
    title: all ? 'Start over?' : 'Return to demo entry?',
    description: `${run?.sandbox ? 'This ends this plugin’s sandbox session; the shared clinic and other visitors’ changes remain.' : run ? 'This ends the current lesson run and its account sessions.' : 'This clears this plugin’s current account and demo session.'} ${all ? 'Your demo registration is also cleared.' : 'Your demo registration is kept.'} Finish or discard open changes before continuing.`,
    button: all ? 'Start over' : 'Return to entry',
  });

  return <Stack className="demo-workspace" spacing={3}>
    <Stack direction="row" spacing={2} className="demo-workspace__heading">
      <Box sx={{ flex: 1 }}><Typography component="h2" variant="h5">Explore the demo</Typography><Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>Open the prepared clinic or follow one task through a guided lesson.</Typography></Box>
      <Button disabled={locked} onClick={() => void refresh()}>Refresh status</Button>
    </Stack>
    {error && <Alert severity="error" action={<Button color="inherit" disabled={locked} onClick={() => void refresh()}>Retry status</Button>}>{error}</Alert>}
    {state?.demo.notice && <Alert severity="info">{state.demo.notice}</Alert>}
    {working && <Box aria-live="polite"><Typography variant="body2" sx={{ mb: 1 }}>{working}{working === 'Preparing sandbox' && attempts > 0 ? ` · ${attempts} preparation requests completed` : '…'}</Typography><LinearProgress />{working === 'Preparing sandbox' && <Button onClick={() => { stop.current = true; setPaused(true); }}>Pause after this step</Button>}</Box>}
    {!state && !working && !error && <Typography>No demo status has been loaded.</Typography>}
    {state && !run && !state.demo.visitor_registered && <Box component="form" className="demo-workspace__registration" onSubmit={event => { event.preventDefault(); void perform('register', { name, email, company }); }}>
      <Typography component="h3" variant="h6">Register for the demo</Typography>
      <Typography variant="body2" color="text.secondary">Use a fictional visitor identity in this local workspace.</Typography>
      <div className="demo-workspace__fields"><TextField label="Visitor name" required value={name} slotProps={{ htmlInput: { maxLength: 160 } }} autoComplete="off" disabled={locked} onChange={event => setName(event.target.value)} /><TextField label="Email" type="email" required value={email} slotProps={{ htmlInput: { maxLength: 254 } }} autoComplete="off" disabled={locked} onChange={event => setEmail(event.target.value)} /><TextField label="Company" required value={company} slotProps={{ htmlInput: { maxLength: 200 } }} autoComplete="off" disabled={locked} onChange={event => setCompany(event.target.value)} /></div>
      <Button type="submit" variant="contained" disabled={locked || !name.trim() || !email.trim() || !company.trim()}>Continue to demo</Button>
    </Box>}
    {run && <section className="demo-workspace__active">
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} className="demo-workspace__heading"><Box sx={{ flex: 1 }}><Typography component="h3" variant="h6">{selectedLesson?.title || run.steps?.[0]?.title || run.clinic.name}</Typography><Typography variant="body2" color="text.secondary">{run.clinic.name}{run.account?.label ? ` · ${run.account.label}` : ''}{run.patient?.name ? ` · ${run.patient.name}` : ''}</Typography></Box><Chip size="small" label={run.account_pending ? 'Preparing' : 'Ready'} /></Stack>
        {run.sandbox && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField select fullWidth label="Demo account" value={account} disabled={locked} onChange={event => setAccount(event.target.value)}><MenuItem value="">Choose an account</MenuItem>{(run.accounts || []).map(choice => <MenuItem key={choice.key} value={choice.key} disabled={!choice.available}>{choice.label}{!choice.available ? ' · preparing' : ''}</MenuItem>)}</TextField>
          <Button disabled={locked || !account || account === run.account?.key || !run.accounts?.some(choice => choice.key === account && choice.available)} onClick={() => setIntent({ action: 'switch_account', args: { account, expected_run_id: run.id, expected_user_id: run.account?.user_id ?? null }, title: 'Switch demo account?', description: 'The plugin will use the selected account and its clinic permissions. Finish or discard open changes before switching.', button: 'Switch account' })}>Use account</Button>
        </Stack>}
        {run.account_pending && !working && <Alert severity="info" action={<Button color="inherit" disabled={locked} onClick={() => void perform('prepare')}>Continue preparation</Button>}>{paused ? 'Preparation is paused. Continue from the backend’s saved step.' : 'The backend is preparing this sandbox. Continue to finish opening its account.'}</Alert>}
        {!run.account_pending && (run.steps || []).map(step => <Box key={step.id} className="demo-workspace__step"><Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Typography component="h4" variant="subtitle1">{step.title}</Typography><Chip size="small" label={step.status} variant="outlined" /></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{step.description}</Typography>{step.review && step.status === 'available' && <Button disabled={locked} onClick={() => void perform('complete')}>Mark review complete</Button>}</Box>)}
        {!run.account_pending && run.view === 'patient' && <Alert severity="info">This demo uses the patient account. Clinic record tools become available when you select a clinic account.</Alert>}
        {!!links.length && !run.account_pending && <Box><Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Website links open a separate browser session. Its account can differ from this plugin’s account.</Typography><Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 1 }}>{links.map(link => <Link key={link.id} href={link.url} target="_blank" rel="noopener noreferrer">{link.title}</Link>)}</Stack></Box>}
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          {!run.account_pending && <Button disabled={locked} onClick={() => void perform('resume')}>Reconnect demo account</Button>}
          {!run.sandbox && run.patient && <Button disabled={locked} onClick={() => setIntent({ action: 'switch_view', args: { view: run.view === 'patient' ? 'clinic' : 'patient', expected_run_id: run.id }, title: 'Switch lesson view?', description: 'This changes the current demo account. Finish or discard open changes before continuing.', button: 'Switch view' })}>{run.view === 'patient' ? 'Use clinic view' : 'Use patient view'}</Button>}
          <Typography variant="caption" color="text.secondary">Shared clinic records are preserved when you leave or start over. Rebuilding a shared lesson is unavailable here.</Typography>
          <Button disabled={locked} onClick={() => setIntent(resetIntent(false))}>Back to entry</Button>
          <Button disabled={locked} color="warning" onClick={() => setIntent(resetIntent(true))}>Start over</Button>
        </Stack>
      </Stack>
    </section>}
    {state && (run || state.demo.visitor_registered) && <section>
      <Stack direction="row" spacing={2} className="demo-workspace__heading"><Typography component="h3" variant="h6" sx={{ flex: 1 }}>Choose a demo</Typography><Button variant="contained" disabled={locked} onClick={() => enter('sandbox', 'Sandbox')}>Open Sandbox</Button></Stack>
      <div className="demo-workspace__catalog">{lessons.map(lesson => <Box key={lesson.id} className="demo-workspace__lesson"><Typography variant="overline" color="text.secondary">{lesson.section}</Typography><Typography component="h4" variant="subtitle1">{lesson.title}</Typography><Typography variant="body2" color="text.secondary">{lesson.description}</Typography>{Boolean(lesson.prepared?.length) && <Typography variant="caption" color="text.secondary">Prepared: {lesson.prepared?.join(' · ')}</Typography>}<Button disabled={locked} onClick={() => enter(lesson.id, lesson.title)}>Open lesson</Button></Box>)}</div>
      {!run && <Button color="warning" disabled={locked} onClick={() => setIntent(resetIntent(true))}>Clear registration and start over</Button>}
    </section>}
    <Dialog open={Boolean(intent)} onClose={() => !locked && setIntent(null)} fullWidth maxWidth="sm" aria-labelledby="demo-confirm-title"><DialogTitle id="demo-confirm-title">{intent?.title}</DialogTitle><DialogContent><Typography>{intent?.description}</Typography>{run && <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{run.clinic.name}{run.account?.label ? ` · ${run.account.label}` : ''}</Typography>}{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent><DialogActions><Button disabled={locked} onClick={() => setIntent(null)}>Cancel</Button><Button variant="contained" disabled={locked || !intent} onClick={() => intent && void perform(intent.action, { ...intent.args, confirmed: true })}>{intent?.button}</Button></DialogActions></Dialog>
  </Stack>;
}
