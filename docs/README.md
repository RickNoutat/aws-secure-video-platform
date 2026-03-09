# Documentation

This directory contains project documentation and diagrams.

## Architecture Diagram

The `architecture-diagram.png` is auto-generated from the architecture described in the README.

## Key Design Decisions

### Serverless-first approach
All compute runs on AWS Lambda to minimize operational overhead and costs at low traffic volumes.

### Security layers
- **Network**: VPC with private subnets for Lambda and RDS
- **Authentication**: Cognito with OAuth2 implicit flow
- **Authorization**: JWT validation at API Gateway level
- **Data access**: Pre-signed URLs with expiration for both upload and playback
- **Secrets**: All credentials managed via AWS Secrets Manager

### Cost optimization
- Lambda and API Gateway benefit from AWS Free Tier
- S3 lifecycle rules transition old videos to Infrequent Access
- CloudFront provides cost-effective CDN distribution
