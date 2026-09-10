#!/usr/bin/env python3
"""Deploy a verified release through the fixed SSM document; never fetch app secrets."""
import argparse
from datetime import datetime, timezone, timedelta
import json
import os
from pathlib import Path
import re
import subprocess
import time


def command(*args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f'{args[0]} operation failed; raw output suppressed')
    return result.stdout.strip()


def aws(*args):
    return json.loads(command('aws', *args, '--region', 'us-east-1', '--output', 'json'))


def require(pattern, value):
    if not isinstance(value, str) or not re.fullmatch(pattern, value):
        raise ValueError('Invalid release metadata')
    return value


def scan(repository, digest):
    for _ in range(90):
        response = subprocess.run(['aws', 'ecr', 'describe-image-scan-findings', '--repository-name', repository,
                                   '--image-id', f'imageDigest={digest}', '--region', 'us-east-1', '--output', 'json'],
                                  capture_output=True, text=True)
        if response.returncode:
            if 'ScanNotFoundException' in response.stderr:
                time.sleep(5)
                continue
            raise RuntimeError('Cannot read image scan; raw output suppressed')
        result = json.loads(response.stdout)
        status = result['imageScanStatus']['status']
        if status == 'COMPLETE':
            findings = result['imageScanFindings']
            counts = findings.get('findingSeverityCounts', {})
            print('Image scan counts: ' + json.dumps(counts, sort_keys=True), flush=True)
            return findings
        if status not in ('IN_PROGRESS', 'PENDING'):
            raise RuntimeError('Image scan did not complete successfully')
        time.sleep(5)
    raise RuntimeError('Image scan timed out')


def approve_scan(findings):
    counts = findings.get('findingSeverityCounts', {})
    if counts.get('CRITICAL', 0) or counts.get('HIGH', 0):
        raise RuntimeError('Production promotion blocked by critical/high image findings')
    completed = datetime.fromisoformat(findings['imageScanCompletedAt'])
    age = datetime.now(timezone.utc) - completed
    if age > timedelta(hours=24) or age < timedelta(minutes=-5):
        raise RuntimeError('Production promotion needs an image scan from the last 24 hours')


def validate_host_attestation(value, environment, generation, images):
    if not isinstance(value, dict) or value.get('format') != 1:
        raise RuntimeError('Remote release did not return a current host attestation')
    try:
        expected_generation = int(generation)
    except (TypeError, ValueError) as error:
        raise RuntimeError('Recorded release generation is invalid') from error
    if isinstance(value.get('generation'), bool) or value.get('generation') != expected_generation or value.get('images') != images:
        raise RuntimeError('Remote host attestation does not match the requested release')
    if environment == 'staging':
        state = value.get('state')
        if not isinstance(state, dict) or state.get('format') != 1 or state.get('environment') != 'staging':
            raise RuntimeError('Remote staging continuity evidence is incomplete')
        require(r'[a-f0-9]{64}', state.get('state_fingerprint'))
    elif value.get('environment') != environment:
        raise RuntimeError('Remote host attestation has the wrong environment')
    return value


def invocation_attestation(invocation, environment, generation, images):
    output = invocation.get('StandardOutputContent', '')
    markers = [line.removeprefix('APPLY_RELEASE_ATTESTATION=') for line in output.splitlines()
               if line.startswith('APPLY_RELEASE_ATTESTATION=')]
    if len(markers) != 1:
        raise RuntimeError('Remote release returned missing or ambiguous host attestation')
    try:
        value = json.loads(markers[0])
    except json.JSONDecodeError as error:
        raise RuntimeError('Remote release returned invalid host attestation') from error
    return validate_host_attestation(value, environment, generation, images)


def deploy(target, image, web_image, generation, environment):
    response = aws('ssm', 'send-command', '--document-name', 'apply-deploy-release',
                   '--instance-ids', target['instance'], '--timeout-seconds', '60',
                   '--parameters', json.dumps({'image': [image], 'webImage': [web_image], 'generation': [generation]}))
    command_id = response['Command']['CommandId']
    print(f'SSM command: {command_id}', flush=True)
    # Continue tracking the remote command; a runner cancellation does not stop it.
    for _ in range(150):
        result = subprocess.run(['aws', 'ssm', 'get-command-invocation', '--region', 'us-east-1',
                                 '--command-id', command_id, '--instance-id', target['instance'],
                                 '--output', 'json'], capture_output=True, text=True)
        if result.returncode:
            if 'InvocationDoesNotExist' not in result.stderr:
                raise RuntimeError('Cannot read remote release status; inspect the command before retrying')
        else:
            invocation = json.loads(result.stdout)
            status = invocation['Status']
            if status == 'Success':
                images = {'api': image, 'web': web_image}
                return command_id, invocation_attestation(invocation, environment, generation, images)
            if status not in ('Pending', 'InProgress', 'Delayed'):
                raise RuntimeError(f'Remote release ended with {status}; preserve backup and inspect sanitized diagnostics')
        time.sleep(5)
    raise RuntimeError('Remote release status unknown; inspect SSM before another deployment')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('environment', choices=['staging', 'production'])
    parser.add_argument('--sha')
    parser.add_argument('--tag')
    parser.add_argument('--expected-digest')
    parser.add_argument('--expected-web-digest')
    args = parser.parse_args()
    config = json.loads(Path(__file__).with_name('targets.json').read_text())
    if aws('sts', 'get-caller-identity')['Account'] != config['account']:
        raise RuntimeError('AWS account mismatch')
    generation = str(int(require(r'[0-9]{1,15}', os.environ['GITHUB_RUN_ID'])) * 100 +
                     int(require(r'[0-9]{1,2}', os.environ['GITHUB_RUN_ATTEMPT'])))
    stage, target = config['staging'], config[args.environment]
    registry = f'{config["account"]}.dkr.ecr.us-east-1.amazonaws.com'
    if args.environment == 'staging':
        sha = require(r'[a-f0-9]{40}', args.sha)
        tag = require(r'[a-z0-9-]{1,120}', args.tag)
        receipt = {'format': 2, 'sha': sha, 'tag': tag, 'images': {}}
        for component in ['api', 'web']:
            digest = aws('ecr', 'describe-images', '--repository-name', stage['repository'],
                         '--image-ids', f'imageTag={tag}-{component}')['imageDetails'][0]['imageDigest']
            require(r'sha256:[a-f0-9]{64}', digest)
            scan(stage['repository'], digest)
            receipt['images'][component] = digest
    else:
        receipt = json.loads(aws('ssm', 'get-parameter', '--name', '/apply/releases/staging')['Parameter']['Value'])
        if receipt.get('format') != 2:
            raise RuntimeError('Staging is not a verified API/web pair; legacy releases cannot be promoted with this tool')
        sha = require(r'[a-f0-9]{40}', receipt['sha'])
        tag = require(r'[a-z0-9-]{1,120}', receipt['tag'])
        expected = {'api': args.expected_digest, 'web': args.expected_web_digest}
        for component in ['api', 'web']:
            digest = require(r'sha256:[a-f0-9]{64}', receipt['images'][component])
            if digest != require(r'sha256:[a-f0-9]{64}', expected[component]):
                raise RuntimeError('Staging pair changed since review; review both images before promoting')
        staging_images = {component: f'{registry}/{stage["repository"]}@{digest}' for component, digest in receipt['images'].items()}
        validate_host_attestation(receipt.get('host_attestation'), 'staging', receipt.get('generation'), staging_images)
        command('git', 'merge-base', '--is-ancestor', sha, 'HEAD')
        for component in ['api', 'web']:
            digest = receipt['images'][component]
            approve_scan(scan(stage['repository'], digest))
            source = f'{registry}/{stage["repository"]}@{digest}'
            component_tag = f'{tag}-{component}'
            destination = f'{registry}/{target["repository"]}:{component_tag}'
            command('docker', 'pull', source)
            command('docker', 'tag', source, destination)
            existing = aws('ecr', 'describe-images', '--repository-name', target['repository'])['imageDetails']
            matching = [item for item in existing if component_tag in item.get('imageTags', [])]
            if matching:
                if matching[0]['imageDigest'] != digest:
                    raise RuntimeError('Production tag already points to different content')
            else:
                command('docker', 'push', destination)
            copied = aws('ecr', 'describe-images', '--repository-name', target['repository'],
                         '--image-ids', f'imageTag={component_tag}')['imageDetails'][0]['imageDigest']
            if copied != digest:
                raise RuntimeError('Copied image digest differs; production was not changed')
    images = {component: f'{registry}/{target["repository"]}@{digest}' for component, digest in receipt['images'].items()}
    receipt['command'], receipt['host_attestation'] = deploy(target, images['api'], images['web'], generation, args.environment)
    receipt['generation'] = generation
    receipt['verified_at'] = datetime.now(timezone.utc).isoformat()
    aws('ssm', 'put-parameter', '--name', f'/apply/releases/{args.environment}/{generation}', '--type', 'String',
        '--value', json.dumps(receipt))
    aws('ssm', 'put-parameter', '--name', f'/apply/releases/{args.environment}', '--type', 'String',
        '--overwrite', '--value', json.dumps(receipt))
    print(f'{args.environment} verified: {sha} / API {receipt["images"]["api"]} / web {receipt["images"]["web"]}', flush=True)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as output:
            output.write(f'**{args.environment} pair deployed**\n\nCommit: `{sha}`\n\nAPI: `{receipt["images"]["api"]}`\n\nWeb: `{receipt["images"]["web"]}`\n')


if __name__ == '__main__':
    main()
