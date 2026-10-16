"""Read-only local plan dashboard. Run: python tools/tracker/server.py."""
import argparse
import datetime as dt
import hashlib
import json
import re
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse, parse_qs

ROOT = Path(__file__).resolve().parents[2]
TRACKER = Path('APPlyVault/03 Execution/Meta Clinic Implementation Tracker.md')
PLAN_DIR = Path('docs/development/clinic-workflow-plans')
LABELS = {'build': 'Needs building', 'qa': 'Needs QA', 'blocked': 'Blocked', 'review': 'Needs review'}

def clean(text):
    text = re.sub(r'\[([^]]+)\]\([^)]+\)', r'\1', text)
    return re.sub(r'[*`]', '', text).strip()

def classify(text):
    """Only explicit work-state phrases; uncertainty stays visible."""
    text = clean(text).lower()
    text = re.sub(r'\b(?:not|never) (?:blocked by|blocked on|waiting for)\b', '', text)
    if re.search(r'\b(blocked by|blocked on|awaiting approval|owner decision required)\b', text):
        return 'blocked'
    if re.search(r'\b(unverified|untested|qa pending|(?:browser|runtime|proof).{0,35}(pending|unverified|remain open)|next proof|acceptance.{0,20}(pending|remain open)|source.only)\b', text):
        return 'qa'
    if re.search(r'\b(not implemented|not built|implementation pending|missing implementation|proposed first.slice|needs implementation)\b', text):
        return 'build'
    return 'review'

def git(*args):
    result = subprocess.run(['git', '-C', str(ROOT), *args], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=15)
    if result.returncode:
        raise RuntimeError('Git history could not be read.')
    return result.stdout.strip()

def discover(root=ROOT):
    tracker = (root / TRACKER).read_text(encoding='utf-8-sig')
    paths = {p.relative_to(root) for p in (root / PLAN_DIR).glob('*.md') if p.name != 'README.md'}
    missing = []
    for target in re.findall(r'\[[^]]+\]\(([^)]+)\)', tracker):
        target = unquote(target.split('#')[0])
        if not target or '://' in target:
            continue
        candidate = (root / TRACKER.parent / target).resolve()
        if not candidate.is_relative_to(root.resolve()) or candidate.suffix.lower() != '.md':
            continue
        rel = candidate.relative_to(root.resolve())
        if not candidate.exists():
            missing.append(str(rel).replace('\\', '/'))
        elif ('docs/development' in rel.as_posix() or 'docs/product-review' in rel.as_posix() or candidate.name == 'PATIENT_JOURNEY_PLAN.md') and candidate.name != 'README.md':
            paths.add(rel)
    return sorted(paths), sorted(set(missing))

def extract(text):
    items = []
    section = 'Plan overview'
    has_checkpoint = bool(re.search(r'^#{1,6} .*checkpoint', text, re.M | re.I))
    for paragraph in re.split(r'\n\s*\n', text.replace('\r', '')):
        paragraph = paragraph.strip()
        if paragraph.startswith('#'):
            lines = paragraph.splitlines()
            section = clean(lines[0].lstrip('#'))
            paragraph = '\n'.join(lines[1:]).strip()
        if not paragraph or paragraph.startswith('---'):
            continue
        entries = []
        if paragraph.startswith('|'):
            lines = paragraph.splitlines()
            headers = [clean(c).lower() for c in lines[0].strip('|').split('|')]
            # Only recorded work inventories, never design/acceptance specifications.
            if not any(re.search(r'current evidence|current state|status|remaining|important gap', h) for h in headers):
                continue
            for line in lines[2:]:
                cells = [clean(c) for c in line.strip('|').split('|')]
                if len(cells) != len(headers):
                    continue
                context = '\n'.join(f'{h.capitalize()}: {c}' for h, c in zip(headers, cells))
                gap = next((c for h,c in zip(headers,cells) if re.search(r'gap|remaining|next', h)), '')
                status = classify(context)
                evidence_status = status
                if gap and status != 'blocked':
                    if re.match(r'(Add|Implement|Move|Broaden|Extend|Establish)\b', gap):
                        status = 'build'
                    elif re.match(r'(Verify|Test|Exercise|Inspect|Measure|Validate|Retest)\b', gap):
                        status = 'qa'
                entries.append((context, status, ' · '.join(cells[:2])))
                if status == 'build' and evidence_status == 'qa':
                    entries.append((context, 'qa', 'Verify existing source: ' + ' · '.join(cells[:2])))
        elif re.search(r'checkpoint|remaining gaps|remaining work|last run|current status', section, re.I):
            if has_checkpoint and re.search(r'last run', section, re.I):
                continue
            for entry in re.split(r'\n(?=\s*(?:[-*] |\d+\. ))', paragraph):
                entry = clean(entry).lstrip('- ').strip()
                status = classify(entry)
                entries.append((entry, status, section))
        for entry, status, title in entries:
            if len(entry) < 25:
                continue
            items.append({'id': hashlib.sha256((section + status + entry).encode()).hexdigest()[:12], 'section': section, 'title': title, 'text': entry, 'status': status})
    return list({item['id']: item for item in items}.values())

def snapshot():
    paths, missing = discover()
    register = (ROOT / TRACKER).read_text(encoding='utf-8-sig')
    plans = []
    for path in paths:
        content = (ROOT / path).read_text(encoding='utf-8-sig')
        title = re.search(r'^#\s+(.+)', content, re.M)
        items = extract(content)
        if not items:
            items = [{'id': 'review', 'section': 'Status needs reconciliation', 'text': 'This plan does not contain an explicit current work status. Read the plan and reconcile implementation and QA evidence before treating it as complete.', 'status': 'review'}]
        last_change = git('log', '-1', '--format=%aI', '--', path.as_posix())
        reported = re.findall(r'^#{1,6} .*?(20\d{2}-\d{2}-\d{2})', content, re.M)
        tracker_notes = []
        for line in register.splitlines():
            if not line.startswith('|'):
                continue
            for link in re.findall(r'\[[^]]+\]\(([^)]+)\)', line):
                if (ROOT / TRACKER.parent / unquote(link.split('#')[0])).resolve() == (ROOT / path).resolve():
                    tracker_notes.append(clean(line.strip('|').split('|')[-1]))
                    break
        plans.append({'trackerNotes': tracker_notes, 'lastChanged': last_change, 'latestMentionedDate': max(reported) if reported else None, 'id': path.as_posix(), 'title': clean(title.group(1)) if title else path.stem.replace('-', ' '), 'items': items})
    history = git('log', '-30', '--date=iso-strict', '--format=%h%x09%aI%x09%s', '--', str(TRACKER), 'docs/development', 'docs/product-review', 'PATIENT_JOURNEY_PLAN.md')
    dates = {line.split('\t')[1] for line in history.splitlines() if '\t' in line}
    return {'plans': plans, 'missing': missing, 'readAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'recordChangedAt': max(dates) if dates else None, 'commit': git('rev-parse', '--short', 'HEAD'), 'branch': git('branch', '--show-current'), 'history': [dict(zip(['commit','date','title'], line.split('\t', 2))) for line in history.splitlines()]}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        try:
            if url.path in ('/', '/records/implementation/2026-09-27-meta-clinic-tracker-atlas.html'):
                self.send_response(302)
                self.send_header('Location', '/tools/tracker/index.html')
                self.end_headers()
                return
            if url.path == '/api/tracker':
                return self.reply(json.dumps(snapshot()).encode(), 'application/json')
            if url.path == '/api/document':
                name = parse_qs(url.query).get('path', [''])[0]
                allowed, _ = discover()
                if name not in {p.as_posix() for p in allowed} | {TRACKER.as_posix()}:
                    return self.reply(b'Document not found', 'text/plain', 404)
                return self.reply((ROOT / name).read_bytes(), 'text/plain; charset=utf-8')
            assets = {'/tools/tracker/' + name: ROOT / 'tools/tracker' / name for name in ('index.html', 'app.js', 'style.css')}
            assets['/archive'] = ROOT / 'records/implementation/2026-09-27-meta-clinic-tracker-atlas.html'
            if url.path not in assets:
                return self.reply(b'Not found', 'text/plain', 404)
            path = assets[url.path]
            return self.reply(path.read_bytes(), {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'}[path.suffix])
        except Exception as error:
            self.log_error('%s', error)
            self.reply(json.dumps({'error': 'Unable to read repository records. Check the local server and retry.'}).encode(), 'application/json', 503)
    def reply(self, body, content_type, status=200):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8766)
    args = parser.parse_args()
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
