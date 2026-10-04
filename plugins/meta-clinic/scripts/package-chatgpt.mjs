// Prepare an upload directory only after a real HTTPS MCP endpoint advertises
// the expected OAuth resource. This never deploys, registers or publishes it.
import { cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const endpointArg = process.argv[2];
if (!endpointArg) throw new Error('Pass the deployed HTTPS MCP endpoint. No endpoint is assumed or created.');
const endpoint = new URL(endpointArg);
if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/mcp')
  throw new Error('Use the deployed HTTPS connector /mcp URL without credentials, query or fragment.');
if (/^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/i.test(endpoint.hostname))
  throw new Error('The ChatGPT package requires a reachable HTTPS endpoint, not the local preview.');

async function get(url) {
  const response = await fetch(url, { redirect:'error', signal:AbortSignal.timeout(15000), headers:{Accept:'application/json'} });
  if (!response.ok) throw new Error(`Endpoint metadata returned HTTP ${response.status}.`);
  return response.json();
}
const resource = await get(new URL('/.well-known/oauth-protected-resource',endpoint));
if (resource.resource !== endpoint.href || !Array.isArray(resource.authorization_servers) || !resource.authorization_servers.includes(endpoint.origin))
  throw new Error('Resource metadata does not match this connector endpoint and issuer.');
const authorization = await get(new URL('/.well-known/oauth-authorization-server',endpoint));
if (authorization.issuer !== endpoint.origin || !authorization.code_challenge_methods_supported?.includes('S256'))
  throw new Error('The connector issuer must advertise S256 PKCE.');
// A metadata check is not authenticated host acceptance. Preserve that fact in
// the package receipt; never turn a live endpoint response into an approval.
const protectedResponse = await fetch(endpoint, { method:'POST', redirect:'error', signal:AbortSignal.timeout(15000),
  headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}}) });
if (protectedResponse.status !== 401) throw new Error('Unauthenticated MCP access must be rejected with HTTP 401.');

const manifest = JSON.parse(await readFile(resolve(root,'plugin.json'),'utf8'));
const presentation = manifest.extensions?.['com.openai']?.interface;
if (!presentation || presentation.shortDescription.length > 30 || manifest.extensions?.['com.openai']?.apps != null)
  throw new Error('Portable listing is invalid or contains a private app dependency.');
async function assertContainedTree(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error('Package source must not contain symbolic links.');
  if (stat.isDirectory()) for (const entry of await readdir(path)) await assertContainedTree(resolve(path,entry));
}
for (const folder of ['assets','skills']) await assertContainedTree(resolve(root,folder));
// Unique output prevents stale files or private overlays surviving a rebuild.
const build = resolve(root,'dist','chatgpt',new Date().toISOString().replace(/[:.]/g,'-'));
const output = resolve(build,manifest.name);
await mkdir(output,{recursive:true});
await writeFile(resolve(output,'plugin.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(resolve(output,'mcp.json'),JSON.stringify({
  $schema:'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
  mcpServers:{'meta-clinic':{type:'streamable-http',url:endpoint.href}},
},null,2)+'\n');
for (const folder of ['assets','skills']) await cp(resolve(root,folder),resolve(output,folder),{recursive:true});
await writeFile(resolve(build,'receipt.json'),JSON.stringify({
  version:manifest.version,endpoint:endpoint.href,generated_at:new Date().toISOString(),
  verified:['matching_resource','matching_issuer','S256_advertised','unauthenticated_MCP_denied'],
  not_verified:['ChatGPT_connection','authenticated_workflows','native_panel','events','submission_approval'],
  submitted:false,
},null,2)+'\n');
console.log(`Prepared ${output}. Archive that single directory; review SUBMISSION.md before any upload. No upload was performed.`);
