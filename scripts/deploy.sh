#!/bin/bash
# ============================================================
# deploy.sh — Full deployment script for Secure Video Platform
# ============================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ENVIRONMENT="${1:-dev}"
STACK_NAME="secure-video-platform-${ENVIRONMENT}"
TEMPLATE="infrastructure/template.yaml"
PARAMS_FILE="infrastructure/parameters/${ENVIRONMENT}.json"

echo -e "${YELLOW}🚀 Deploying Secure Video Platform — ${ENVIRONMENT}${NC}"
echo "=================================================="

# ---- Pre-flight checks ----
echo -e "\n${YELLOW}[1/5] Pre-flight checks...${NC}"

if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found. Please install it first.${NC}"
    exit 1
fi

if ! command -v sam &> /dev/null; then
    echo -e "${RED}❌ SAM CLI not found. Please install it first.${NC}"
    exit 1
fi

if [ ! -f "$PARAMS_FILE" ]; then
    echo -e "${RED}❌ Parameters file not found: ${PARAMS_FILE}${NC}"
    echo "  Copy the example: cp ${PARAMS_FILE}.example ${PARAMS_FILE}"
    exit 1
fi

echo -e "${GREEN}✓ All checks passed${NC}"

# ---- Install Lambda dependencies ----
echo -e "\n${YELLOW}[2/5] Installing Lambda dependencies...${NC}"

for func_dir in backend/functions/*/; do
    if [ -f "${func_dir}package.json" ]; then
        echo "  Installing deps for $(basename $func_dir)..."
        (cd "$func_dir" && npm install --production)
    fi
done

echo -e "${GREEN}✓ Dependencies installed${NC}"

# ---- SAM Build ----
echo -e "\n${YELLOW}[3/5] Building SAM application...${NC}"

sam build \
    --template "$TEMPLATE" \
    --use-container \
    --parallel

echo -e "${GREEN}✓ Build complete${NC}"

# ---- SAM Deploy ----
echo -e "\n${YELLOW}[4/5] Deploying to AWS...${NC}"

sam deploy \
    --stack-name "$STACK_NAME" \
    --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
    --parameter-overrides "$(cat $PARAMS_FILE | python3 -c "
import sys, json
params = json.load(sys.stdin)['Parameters']
print(' '.join(f'{k}={v}' for k, v in params.items()))
")" \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset

echo -e "${GREEN}✓ Infrastructure deployed${NC}"

# ---- Deploy Frontend ----
echo -e "\n${YELLOW}[5/5] Deploying frontend...${NC}"

# Get stack outputs
FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" \
    --output text)

CF_DISTRIBUTION=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" \
    --output text)

echo "  Syncing frontend to s3://${FRONTEND_BUCKET}..."
aws s3 sync frontend/ "s3://${FRONTEND_BUCKET}" \
    --delete \
    --cache-control "max-age=31536000,public" \
    --exclude "*.html" \
    --exclude "js/*.mjs"

# HTML and JS files with shorter cache
aws s3 sync frontend/ "s3://${FRONTEND_BUCKET}" \
    --delete \
    --cache-control "max-age=300,must-revalidate" \
    --include "*.html" \
    --include "js/*.mjs"

echo -e "${GREEN}✓ Frontend deployed${NC}"

# ---- Summary ----
echo ""
echo "=================================================="
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo "=================================================="
echo ""

# Print all outputs
aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[*].[OutputKey, OutputValue]" \
    --output table

echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "  1. Run scripts/setup-db.sql against the RDS instance"
echo "  2. Update frontend/js/auth.mjs with Cognito config"
echo "  3. Update frontend/js/api.mjs with API Gateway endpoint"
echo "  4. Re-sync frontend: bash scripts/sync-frontend.sh"
echo "  5. Invalidate CloudFront cache if needed"
