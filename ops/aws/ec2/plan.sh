#!/bin/bash
# Creates an unexecuted change set; never creates the proposed EC2 resources.
set -euo pipefail
[ "$#" = 3 ] || [ "$#" = 4 ] || { echo "Usage: bash plan.sh AWS_PROFILE EXPECTED_ACCOUNT_ID us-east-1|us-east-2 [--allow-root]" >&2; exit 2; }
allow_root=false
if [ "$#" = 4 ]; then
  [ "$4" = --allow-root ] || exit 2
  # Only use this override when the account owner explicitly authorizes root.
  allow_root=true
fi
export AWS_PROFILE=$1 AWS_REGION=$3 AWS_DEFAULT_REGION=$3 AWS_PAGER=''
[[ "$2" =~ ^[0-9]{12}$ ]] || { echo 'Expected a 12-digit account ID' >&2; exit 2; }
[[ "$3" = us-east-1 || "$3" = us-east-2 ]] || exit 2
identity=$(aws sts get-caller-identity --output json)
IDENTITY_JSON="$identity" EXPECTED_ACCOUNT="$2" ALLOW_ROOT="$allow_root" python3 - <<'PY'
import json, os
identity = json.loads(os.environ['IDENTITY_JSON'])
if identity['Account'] != os.environ['EXPECTED_ACCOUNT']:
    raise SystemExit('AWS account mismatch; no change set created')
if identity['Arn'].endswith(':root') and os.environ['ALLOW_ROOT'] != 'true':
    raise SystemExit('Use an individual MFA-protected role/profile, not AWS root')
PY
directory=$(cd "$(dirname "$0")" && pwd)
aws cloudformation deploy --region "$AWS_REGION" \
  --stack-name apply-synthetic-staging \
  --template-file "$directory/stack.yaml" \
  --capabilities CAPABILITY_IAM --tags Project=APPly Environment=synthetic-staging \
  --parameter-overrides InstanceType=t3.micro \
  --no-execute-changeset
echo 'Review the change set, costs, account and operator access before execution. No stack resources launched.'
