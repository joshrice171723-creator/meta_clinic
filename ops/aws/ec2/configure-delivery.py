#!/usr/bin/env python3
"""Configure delivery after gh auth login. Does not commit, push or deploy the app."""
import argparse
import json
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parent
REPO = 'Fibrodysplasia/APPly'


def run(args, payload=None, missing_ok=False):
    result = subprocess.run(args, input=json.dumps(payload) if payload is not None else None,
                            text=True, capture_output=True)
    if result.returncode:
        if missing_ok and ('HTTP 404' in result.stderr or 'does not exist' in result.stderr):
            return None
        raise RuntimeError(f'{args[0]} request failed: check login, account permissions and plan support; raw output suppressed')
    return json.loads(result.stdout) if result.stdout.strip() else {}


def github(path, payload=None, missing_ok=False):
    args = ['gh', 'api', '-H', 'X-GitHub-Api-Version: 2026-03-10', f'repos/{REPO}/{path}']
    if payload is not None:
        args += ['--method', 'PUT', '--input', '-']
    return run(args, payload, missing_ok)


def aws(*args, missing_ok=False):
    return run(['aws', *args, '--region', 'us-east-1', '--output', 'json'], missing_ok=missing_ok)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Create GitHub controls and apply an additions-only AWS change set')
    args = parser.parse_args()
    config = json.loads((ROOT / 'targets.json').read_text())
    if aws('sts', 'get-caller-identity')['Account'] != config['account']:
        raise RuntimeError('AWS account mismatch')
    repo = github('')
    if not repo.get('permissions', {}).get('admin'):
        raise RuntimeError('GitHub repository administrator access is required')
    oidc = github('actions/oidc/customization/sub')
    if not oidc.get('use_default') and oidc.get('include_claim_keys') != ['repo', 'context']:
        raise RuntimeError('Existing custom OIDC subject requires review; it was not changed')
    immutable = oidc.get('use_immutable_subject')
    if not isinstance(immutable, bool):
        raise RuntimeError('Cannot verify the OIDC subject format; no trust policy created')
    owner = repo['owner']['login'] + (f'@{repo["owner"]["id"]}' if immutable else '')
    name = repo['name'] + (f'@{repo["id"]}' if immutable else '')
    subject = f'repo:{owner}/{name}'
    environment = github('environments/production', missing_ok=True)
    if environment:
        policy = environment.get('deployment_branch_policy') or {}
        branches = github('environments/production/deployment-branch-policies')['branch_policies']
        if policy != {'protected_branches': False, 'custom_branch_policies': True} or \
                [(b['name'], b.get('type', 'branch')) for b in branches] != [('main', 'branch')]:
            raise RuntimeError('Existing production environment must permit only the main branch; existing rules were preserved')
    print('Verified subject prefix: ' + subject)
    print('Production requires explicit workflow dispatch, matching staging digest and a fresh clean high/critical scan.')
    if not args.apply:
        print('Read-only check complete. Use --apply to configure delivery.')
        return
    if not environment:
        github('environments/production', {'deployment_branch_policy': {'protected_branches': False, 'custom_branch_policies': True}})
        run(['gh', 'api', '-H', 'X-GitHub-Api-Version: 2026-03-10', '--method', 'POST',
             f'repos/{REPO}/environments/production/deployment-branch-policies', '--input', '-'],
            {'name': 'main', 'type': 'branch'})
    stack = aws('cloudformation', 'describe-stacks', '--stack-name', 'apply-delivery', missing_ok=True)
    parameters = [{'ParameterKey': 'GitHubSubjectPrefix', 'ParameterValue': subject}]
    for env in ['staging', 'production']:
        parameters += [{'ParameterKey': env.title() + 'Instance', 'ParameterValue': config[env]['instance']},
                       {'ParameterKey': env.title() + 'Repository', 'ParameterValue': config[env]['repository']}]
    change = 'delivery-' + uuid.uuid4().hex
    result = aws('cloudformation', 'create-change-set', '--stack-name', 'apply-delivery',
                 '--change-set-name', change, '--change-set-type', 'UPDATE' if stack else 'CREATE',
                 '--template-body', 'file://' + str(ROOT / 'delivery.yaml'),
                 '--capabilities', 'CAPABILITY_NAMED_IAM', '--parameters', json.dumps(parameters))
    change_id = result['Id']
    for _ in range(60):
        proposed = aws('cloudformation', 'describe-change-set', '--change-set-name', change_id)
        if proposed['Status'] == 'CREATE_COMPLETE':
            break
        if proposed['Status'] == 'FAILED':
            raise RuntimeError('Change set failed or has no changes; inspect it before retrying')
        time.sleep(2)
    else:
        raise RuntimeError('Change set is not ready')
    changes = [item['ResourceChange'] for item in proposed['Changes']]
    if any(item['Action'] != 'Add' for item in changes):
        raise RuntimeError('Existing delivery resources would change; inspect the unexecuted change set before applying')
    print('Reviewed additions: ' + ', '.join(item['LogicalResourceId'] for item in changes), flush=True)
    aws('cloudformation', 'execute-change-set', '--change-set-name', change_id)
    print('Delivery stack creation started. Verify CREATE_COMPLETE and the exact OIDC subject before pushing workflows.')


if __name__ == '__main__':
    main()
