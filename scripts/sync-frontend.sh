#!/bin/bash
# ============================================================
# sync-frontend.sh — Sync frontend to S3 and invalidate cache
# ============================================================

set -euo pipefail

ENVIRONMENT="${1:-dev}"
STACK_NAME="secure-video-platform-${ENVIRONMENT}"

echo "🔄 Syncing frontend for ${STACK_NAME}..."

# Get bucket name from stack
FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" \
    --output text)

# Get CloudFront distribution ID
CF_DOMAIN=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" \
    --output text)

# Extract distribution ID from domain
CF_DIST_ID=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?DomainName=='${CF_DOMAIN#https://}'].Id" \
    --output text)

echo "  Bucket: ${FRONTEND_BUCKET}"
echo "  Distribution: ${CF_DIST_ID}"

# Sync files
aws s3 sync frontend/ "s3://${FRONTEND_BUCKET}" \
    --delete \
    --cache-control "max-age=31536000,public" \
    --exclude "*.html" \
    --exclude "js/*.mjs"

aws s3 sync frontend/ "s3://${FRONTEND_BUCKET}" \
    --delete \
    --cache-control "max-age=300,must-revalidate" \
    --include "*.html" \
    --include "js/*.mjs"

# Invalidate CloudFront cache
if [ -n "$CF_DIST_ID" ]; then
    echo "  Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
        --distribution-id "$CF_DIST_ID" \
        --paths "/*" \
        --query "Invalidation.Id" \
        --output text
fi

echo "✅ Frontend synced successfully!"
