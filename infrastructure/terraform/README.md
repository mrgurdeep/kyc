# KYC Infrastructure - Terraform

This Terraform configuration deploys the AWS infrastructure for the KYC Onboarding System.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                    VPC                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         Public Subnets                                  ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                     ││
│  │  │     ALB     │  │ NAT Gateway │  │ NAT Gateway │                     ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘                     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         Private Subnets                                 ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ ││
│  │  │  ECS Fargate │  │    Lambda    │  │ ElastiCache  │  │VPC Endpoints│ ││
│  │  │   (API)      │  │  (Processors)│  │   (Redis)    │  │             │ ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                        Database Subnets (Isolated)                      ││
│  │  ┌──────────────────────────────────────────────────┐                   ││
│  │  │               RDS PostgreSQL                      │                   ││
│  │  │               (Multi-AZ)                          │                   ││
│  │  └──────────────────────────────────────────────────┘                   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

## Resources Created

### Networking
- VPC with public, private, and database subnets across 3 AZs
- Internet Gateway and NAT Gateways
- VPC Endpoints for S3, SQS, SNS, Secrets Manager, KMS, ECR, Textract, Rekognition
- Security groups for ALB, ECS, Lambda, RDS, ElastiCache

### Storage
- S3 buckets: raw documents, processed documents, archived, Textract output
- KMS key for encryption
- Lifecycle policies for cost optimization

### Database
- RDS PostgreSQL with Multi-AZ (production)
- ElastiCache Redis cluster
- Secrets Manager for credentials

### Messaging
- SQS queues: ingestion, processing, human review, notifications
- Dead Letter Queues for each queue
- SNS topics: Textract completion, KYC status updates, alarms

### Compute
- Lambda functions: document orchestrator, document validator
- ECS Fargate cluster with auto-scaling
- Application Load Balancer with HTTPS

### Security
- IAM roles and policies for all services
- Field-level encryption with KMS
- VPC isolation for databases

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. Terraform >= 1.5.0
3. An AWS account with sufficient permissions

## Quick Start

### 1. Initialize Terraform

```bash
cd infrastructure/terraform
terraform init
```

### 2. Configure Variables

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your settings
```

### 3. Plan the Deployment

```bash
terraform plan -out=tfplan
```

### 4. Apply (Deploy)

```bash
terraform apply tfplan
```

## Environment-Specific Configurations

### Development
```hcl
environment           = "dev"
single_nat_gateway    = true
db_instance_class     = "db.t3.medium"
db_multi_az           = false
redis_node_type       = "cache.t3.medium"
redis_num_cache_nodes = 1
ecs_desired_count     = 1
```

### Production
```hcl
environment           = "prod"
single_nat_gateway    = false
db_instance_class     = "db.r6g.large"
db_multi_az           = true
redis_node_type       = "cache.r6g.large"
redis_num_cache_nodes = 3
ecs_desired_count     = 3
ecs_max_capacity      = 100
```

## Remote State Configuration

For team collaboration, configure remote state in `main.tf`:

```hcl
terraform {
  backend "s3" {
    bucket         = "kyc-terraform-state"
    key            = "kyc/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "kyc-terraform-locks"
  }
}
```

Create the S3 bucket and DynamoDB table beforehand:

```bash
# Create state bucket
aws s3api create-bucket --bucket kyc-terraform-state --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket kyc-terraform-state \
  --versioning-configuration Status=Enabled

# Create lock table
aws dynamodb create-table \
  --table-name kyc-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

## Outputs

After deployment, important values are available:

```bash
# Get all outputs
terraform output

# Get specific output
terraform output alb_dns_name
terraform output ecr_repository_url
terraform output environment_variables
```

## Cost Estimation

### Development (~$200-300/month)
- NAT Gateway: ~$45
- RDS t3.medium: ~$50
- ElastiCache t3.medium: ~$40
- ECS Fargate: ~$30-50
- S3/SQS/Lambda: ~$10-20

### Production (~$1,500-3,000/month)
- NAT Gateways (3): ~$135
- RDS r6g.large Multi-AZ: ~$400
- ElastiCache r6g.large (3 nodes): ~$400
- ECS Fargate (scaled): ~$300-800
- S3/SQS/Lambda: ~$100-300

## Destroying Infrastructure

```bash
# Review what will be destroyed
terraform plan -destroy

# Destroy all resources
terraform destroy
```

**Warning**: This will delete all data including databases and S3 objects.

## Security Considerations

1. **Encryption**: All data encrypted at rest (KMS) and in transit (TLS)
2. **Network Isolation**: Databases in isolated subnets with no internet access
3. **IAM**: Least privilege policies for all services
4. **Secrets**: All credentials stored in Secrets Manager
5. **Logging**: CloudWatch logs with encryption

## Troubleshooting

### Lambda can't connect to RDS
- Check security group rules
- Verify Lambda is in VPC with correct subnets
- Ensure NAT Gateway is configured for outbound traffic

### ECS tasks failing health checks
- Check container logs in CloudWatch
- Verify security group allows ALB to reach containers
- Confirm health check path exists in application

### Textract not processing documents
- Verify S3 bucket policy allows Textract access
- Check Textract service role has correct permissions
- Ensure KMS key policy allows Textract
