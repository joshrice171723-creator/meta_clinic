// Demo identity and records remain owned by Rails and this ClinicClient's cookie jar.
const requestedAccounts = new WeakMap();
const id = value => value == null ? '' : String(value);
const actions = new Set(['register', 'enter', 'prepare', 'switch_account', 'switch_view', 'resume', 'complete', 'restart', 'leave', 'start_over']);

function invalidate(client) {
  client.context = null;
  client.user = null;
  client.csrf = null;
  client.authMode = 'demo';
  client.generation++;
}

async function synchronize(client, demo) {
  // show, lesson, view and reset can replace the Rails session. Always fetch its CSRF state.
  await client.configure();
  if (!demo.active || demo.run.account_pending) {
    if (client.authMode === 'demo' && (client.context || client.user)) invalidate(client);
    return;
  }
  const session = await client.request('/api/session', { scoped: false });
  if (!session.user?.id || (demo.run.account?.user_id && id(session.user.id) !== id(demo.run.account.user_id))) {
    invalidate(client);
    throw new Error('The demo account changed. Refresh the demo before continuing.');
  }
  if (demo.run.view === 'clinic') {
    await client.refreshContext();
  } else {
    if (client.context || id(client.user?.id) !== id(session.user.id)) client.generation++;
    client.context = null;
    client.user = session.user;
  }
  client.authMode = 'demo';
}

function envelope(client, demo, extra = {}) {
  const links = demo.active ? (demo.run.steps || []).flatMap(step => {
    if (typeof step.href !== 'string' || !step.href.startsWith('/') || step.href.startsWith('//') || /[\\\r\n]/.test(step.href)) return [];
    const url = new URL(step.href, client.webUrl);
    return url.origin === client.webUrl ? [{ id: step.id, title: step.title, status: step.status, url: url.href }] : [];
  }) : [];
  return { demo, connection: client.snapshot(), context: client.context, links, ...extra };
}

export async function demoSnapshot(client) {
  if (client.authMode !== 'demo') invalidate(client);
  await client.configure();
  const demo = await client.request('/api/demo/run', { scoped: false });
  await synchronize(client, demo);
  return envelope(client, demo);
}

function assertRun(demo, args) {
  if (!demo.active || !args.expected_run_id || id(args.expected_run_id) !== id(demo.run.id))
    throw new Error('The demo run changed. Refresh and review the current run before continuing.');
}

function confirm(args) {
  if (args.confirmed !== true) throw new Error('Review the current demo session effects and confirm before continuing.');
}

async function post(client, path, body, changesSession = false) {
  if (changesSession) invalidate(client);
  await client.configure();
  const data = await client.request(path, { method: 'POST', scoped: false, body });
  if (changesSession) await client.configure();
  return data;
}

export async function demoAction(client, action, args = {}) {
  if (!actions.has(action)) throw new Error('Choose an available demo action.');
  // Lessons, as well as the sandbox, can be shared. A confirmation in this
  // connector cannot authorize rebuilding another visitor's clinic records.
  if (action === 'restart') throw new Error('Shared lesson and sandbox resets are unavailable. Leave this session or start over instead.');
  if (client.authMode !== 'demo') invalidate(client);
  await client.configure();
  let demo = await client.request('/api/demo/run', { scoped: false });
  let preparation;
  switch (action) {
    case 'register':
      if (demo.active) { assertRun(demo, args); confirm(args); }
      demo = await post(client, '/api/demo/visitor', { name: args.name, email: args.email, company: args.company }, true);
      requestedAccounts.delete(client);
      break;
    case 'enter': {
      if (typeof args.lesson_key !== 'string' || !args.lesson_key) throw new Error('Choose a demo lesson.');
      if (demo.active) { assertRun(demo, args); confirm(args); }
      const sandbox = args.lesson_key === 'sandbox';
      if (!sandbox && !(demo.active ? demo.run.lessons : demo.lessons)?.some(lesson => lesson.id === args.lesson_key))
        throw new Error('Choose a lesson returned by the current demo catalog.');
      if (sandbox && !demo.visitor_registered && !demo.active) throw new Error('Register for the demo before opening the sandbox.');
      const account = args.account || 'admin';
      demo = await post(client, '/api/demo/lesson', { lesson_key: args.lesson_key, restart: false, ...(sandbox ? { account } : {}) }, true);
      if (sandbox) requestedAccounts.set(client, account);
      else requestedAccounts.delete(client);
      break;
    }
    case 'prepare': {
      assertRun(demo, args);
      if (!demo.run.sandbox) throw new Error('Open the sandbox before preparing it.');
      // One idempotent backend stage per call. The UI bounds its continuation separately.
      try {
        preparation = await post(client, '/api/demo/sandbox/prepare', {});
      } catch (error) {
        if (error.status === 404) throw new Error('This visitor cannot prepare the shared demo. Refresh its status, or ask the person managing the demo to finish preparation. Shared clinic records have not been reset.');
        throw error;
      }
      demo = await client.request('/api/demo/run', { scoped: false });
      assertRun(demo, args);
      if (preparation.complete === true && demo.run.account_pending) {
        const account = args.account || requestedAccounts.get(client);
        if (!account || !demo.run.accounts?.some(choice => choice.key === account && choice.available))
          throw new Error('Preparation completed. Choose an available account to continue.');
        demo = await post(client, '/api/demo/run/view', { account, expected_run_id: demo.run.id, expected_user_id: demo.run.account?.user_id ?? null }, true);
        requestedAccounts.delete(client);
      }
      preparation = { complete: preparation.complete === true, attempts: 1, bounded: true };
      break;
    }
    case 'switch_account':
      assertRun(demo, args);
      if (!demo.run.sandbox || !demo.run.accounts?.some(choice => choice.key === args.account && choice.available))
        throw new Error('Choose an available account returned by this sandbox.');
      if (id(args.expected_user_id) !== id(demo.run.account?.user_id)) throw new Error('The account changed. Refresh before switching accounts.');
      demo = await post(client, '/api/demo/run/view', { account: args.account, expected_run_id: demo.run.id, expected_user_id: demo.run.account?.user_id ?? null }, true);
      requestedAccounts.delete(client);
      break;
    case 'switch_view':
      assertRun(demo, args);
      if (demo.run.sandbox || !['clinic', 'patient'].includes(args.view)) throw new Error('Choose an available lesson view.');
      demo = await post(client, '/api/demo/run/view', { view: args.view }, true);
      break;
    case 'resume':
      assertRun(demo, args);
      demo = await post(client, '/api/demo/run/resume', {}, true);
      break;
    case 'complete':
      assertRun(demo, args);
      demo = await post(client, '/api/demo/lesson/complete', {});
      break;
    case 'leave':
    case 'start_over':
      if (demo.active || args.expected_run_id != null) assertRun(demo, args);
      confirm(args);
      demo = await post(client, '/api/demo/run/reset', { all: action === 'start_over' }, true);
      requestedAccounts.delete(client);
      break;
  }
  await synchronize(client, demo);
  return envelope(client, demo, preparation ? { preparation } : {});
}
