import { randomUUID } from 'node:crypto';
import Ajv from 'ajv';
import { ClinicClient } from './client.mjs';
import { OPERATIONS } from './catalog.mjs';
import { loadPanel, PANEL_SCHEMAS } from './panels.mjs';

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const validators = new Map(OPERATIONS.map(op => [op.id, ajv.compile(op.inputSchema)]));
const panelValidators = new Map(Object.entries(PANEL_SCHEMAS).map(([view, schema]) => [view, ajv.compile(schema)]));
const operations = new Map(OPERATIONS.map(op => [op.id, op]));
const client = new ClinicClient();
const pending = new Map();
const receipts = [];
let queue = Promise.resolve();
const result = data => ({ content: [{ type: 'text', text: data.saved ? 'Meta Clinic confirmed the saved change.' : data.change_id ? 'Change prepared for review; no record has been saved.' : data.operation ? `Loaded ${data.operation} from Meta Clinic.` : 'Meta Clinic workspace information loaded.' }], structuredContent: data });
const fail = error => ({ isError: true, content: [{ type: 'text', text: error.message || 'The action could not be completed.' }], structuredContent: { error: error.message, code: error.code, status: error.status, connection: client.snapshot(), context: client.context } });
const summary = op => `${op.title} in ${client.context?.practice?.name || 'the selected clinic'}`;

function assertContext(expected) {
  if (!expected) return;
  const actual = { actor_id: client.context?.user_id, practice_id: client.context?.practice?.id, site_id: client.context?.current_site?.id ?? null, authorization_generation: client.context?.authorization_generation ?? null };
  if (Object.keys(actual).some(key => String(actual[key] ?? '') !== String(expected[key] ?? '')))
    throw new Error('The signed-in account, clinic, location or permissions changed. Refresh the workspace before continuing.');
}

function getOperation(id, args, mutation) {
  const op = operations.get(id);
  if (!op || (op.method !== 'GET') !== mutation) throw new Error('Choose an available operation of the correct type from the catalog.');
  const validate = validators.get(id);
  if (!validate(args)) throw new Error('Complete the operation fields: ' + ajv.errorsText(validate.errors, { separator: '; ' }));
  return op;
}

function requestFor(op, args) {
  let path = op.path.replace(/:([a-zA-Z_][\w]*)/g, (_, name) => {
    const value = String(args[name] ?? '');
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`Choose a valid ${name.replaceAll('_', ' ')}.`);
    return encodeURIComponent(value);
  });
  const query = new URLSearchParams();
  for (const key of op.queryKeys || []) if (args[key] !== undefined && args[key] !== '') query.set(key, String(args[key]));
  if (query.size) path += '?' + query;
  const bodyFields = Object.fromEntries((op.bodyKeys || []).filter(k => args[k] !== undefined).map(k => [k, args[k]]));
  const body = op.method === 'GET' ? undefined : op.bodyRoot ? { [op.bodyRoot]: bodyFields } : bodyFields;
  return { path, options: { method: op.method, body } };
}

async function snapshot(port) {
  let error;
  try { await client.configure(); if (client.user) await client.refreshContext(); } catch (e) { error = e.message; }
  return {
    connection: { ...client.snapshot(), ...(error ? { connected: false, error } : {}), loginUrl: `http://127.0.0.1:${port}/sign-in`, tutorialUrl: `http://127.0.0.1:${port}/tutorial.html` },
    profiles: client.profiles(), context: client.context,
    operations: OPERATIONS, recent_changes: receipts.slice(-15).reverse(),
  };
}

async function execute(name, args, port) {
  for (const [id, ticket] of pending) if (ticket.expires < Date.now()) pending.delete(id);
  switch (name) {
    case 'meta_clinic_open': {
      const data = await snapshot(port);
      const { operations, profiles, ...visible } = data;
      return { ...result({ ...visible, operation_count: operations.length, domains: [...new Set(operations.map(op => op.domain))] }), _meta: { operations, profiles } };
    }
    case 'meta_clinic_catalog': return result({ operations: OPERATIONS.filter(op => (!args.domain || op.domain === args.domain) && (!args.search || `${op.id} ${op.title} ${op.description} ${op.domain}`.toLowerCase().includes(args.search.toLowerCase()))) });
    case 'meta_clinic_connection':
      pending.clear();
      receipts.length = 0;
      await client.connect(args);
      return result(await snapshot(port));
    case 'meta_clinic_panel': {
      if (!client.user) throw new Error('Sign in to Meta Clinic before opening clinical views.');
      const validate = panelValidators.get(args.view);
      if (!validate || !validate(args.arguments || {})) throw new Error('Choose a clinical view and valid patient/location and paging fields.');
      await client.refreshContext();
      assertContext(args.expected_context);
      const data = await loadPanel(args.view, args.arguments || {}, async (id, input) => {
        const op = getOperation(id, input, false);
        const request = requestFor(op, input);
        return client.request(request.path, request.options);
      });
      // Deliberate projection: measurements and patient details hydrate the panel,
      // while the model receives only the panel's administrative summary.
      return {
        content: [{ type: 'text', text: 'Meta Clinic loaded the requested clinical view.' }],
        structuredContent: { summary: data.summary },
        _meta: { panel: data.panel, arguments: args.arguments || {}, connection: client.snapshot(), context: client.context },
      };
    }
    case 'meta_clinic_read': {
      const op = getOperation(args.operation, args.arguments || {}, false);
      if (!client.user) throw new Error('Open Meta Clinic and select a clinic account first.');
      await client.refreshContext();
      assertContext(args.expected_context);
      const request = requestFor(op, args.arguments || {});
      const data = await client.request(request.path, request.options);
      return result({ operation: op.id, data, connection: client.snapshot(), context: client.context, refreshed_at: new Date().toISOString() });
    }
    case 'meta_clinic_prepare_change': {
      const op = getOperation(args.operation, args.arguments || {}, true);
      if (!client.user) throw new Error('Open Meta Clinic and select a clinic account first.');
      await client.refreshContext();
      assertContext(args.expected_context);
      requestFor(op, args.arguments || {});
      if (pending.size >= 30) throw new Error('Too many pending changes. Complete or discard an existing change.');
      const id = randomUUID(); const expires = Date.now() + 5 * 60 * 1000;
      const ticket = { id, op, args: structuredClone(args.arguments || {}), generation: client.generation, expires };
      pending.set(id, ticket);
      return result({ change_id: id, operation: op.id, arguments: ticket.args, expires_at: new Date(expires).toISOString(), summary: summary(op), actor: client.snapshot().actor, practice: client.context.practice, site: client.context.current_site, message: 'Review these exact values before applying. Preparation does not save or reserve records; the API validates the change when applied.' });
    }
    case 'meta_clinic_discard_change': pending.delete(args.change_id); return result({ discarded: true });
    case 'meta_clinic_apply_change': {
      const ticket = pending.get(args.change_id);
      if (!ticket) throw new Error('This change expired or was already submitted. Inspect the record before preparing another change.');
      pending.delete(args.change_id);
      await client.refreshContext();
      if (client.generation !== ticket.generation || ticket.expires < Date.now()) throw new Error('Account, clinic, location, permissions, or session changed. Review a new change before applying.');
      const request = requestFor(ticket.op, ticket.args);
      try {
        const data = await client.request(request.path, request.options);
        if (ticket.op.path === '/api/clinic/context') { await client.refreshContext(); pending.clear(); }
        receipts.push({ operation: ticket.op.id, title: ticket.op.title, status: 'saved', at: new Date().toISOString() });
        if (receipts.length > 30) receipts.shift();
        return result({ operation: ticket.op.id, data, saved: true, connection: client.snapshot(), context: client.context });
      } catch (error) {
        receipts.push({ operation: ticket.op.id, title: ticket.op.title, status: error.status ? 'rejected' : 'unconfirmed', at: new Date().toISOString() });
        throw error;
      }
    }
    default: throw new Error('Unknown Meta Clinic tool.');
  }
}

// Serialize cookie updates, account changes and writes across chat and panel callers.
export function callTool(name, args = {}, port = 3320) {
  const run = queue.then(() => execute(name, args, port)).catch(fail);
  queue = run.then(() => undefined);
  return run;
}

// Only the same-origin browser login route may supply credentials. Never an MCP tool.
export function signIn(credentials) {
  const run = queue.then(async () => {
    pending.clear(); receipts.length = 0;
    await client.signIn(credentials);
    return { connection: client.snapshot() };
  });
  queue = run.catch(() => undefined);
  return run;
}
