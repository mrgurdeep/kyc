# KYC Onboarding System - Terraform Outputs

# ========================
# VPC Outputs
# ========================

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "database_subnet_ids" {
  description = "Database subnet IDs"
  value       = aws_subnet.database[*].id
}

# ========================
# S3 Outputs
# ========================

output "raw_documents_bucket" {
  description = "S3 bucket for raw document uploads"
  value       = aws_s3_bucket.raw_documents.id
}

output "processed_documents_bucket" {
  description = "S3 bucket for processed documents"
  value       = aws_s3_bucket.processed_documents.id
}

output "textract_output_bucket" {
  description = "S3 bucket for Textract output"
  value       = aws_s3_bucket.textract_output.id
}

# ========================
# Database Outputs
# ========================

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = aws_db_instance.main.endpoint
}

output "rds_port" {
  description = "RDS PostgreSQL port"
  value       = aws_db_instance.main.port
}

output "rds_database_name" {
  description = "RDS database name"
  value       = aws_db_instance.main.db_name
}

output "rds_credentials_secret_arn" {
  description = "Secrets Manager ARN for RDS credentials"
  value       = aws_secretsmanager_secret.rds_credentials.arn
}

# ========================
# Redis Outputs
# ========================

output "redis_primary_endpoint" {
  description = "Redis primary endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "redis_reader_endpoint" {
  description = "Redis reader endpoint"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
}

output "redis_auth_token_secret_arn" {
  description = "Secrets Manager ARN for Redis auth token"
  value       = aws_secretsmanager_secret.redis_auth_token.arn
}

# ========================
# SQS Outputs
# ========================

output "document_ingestion_queue_url" {
  description = "SQS URL for document ingestion queue"
  value       = aws_sqs_queue.document_ingestion.url
}

output "document_ingestion_queue_arn" {
  description = "SQS ARN for document ingestion queue"
  value       = aws_sqs_queue.document_ingestion.arn
}

output "document_processing_queue_url" {
  description = "SQS URL for document processing queue"
  value       = aws_sqs_queue.document_processing.url
}

output "human_review_queue_url" {
  description = "SQS URL for human review queue"
  value       = aws_sqs_queue.human_review.url
}

output "notifications_queue_url" {
  description = "SQS URL for notifications queue"
  value       = aws_sqs_queue.notifications.url
}

# ========================
# SNS Outputs
# ========================

output "textract_completion_topic_arn" {
  description = "SNS topic ARN for Textract completion"
  value       = aws_sns_topic.textract_completion.arn
}

output "kyc_status_updates_topic_arn" {
  description = "SNS topic ARN for KYC status updates"
  value       = aws_sns_topic.kyc_status_updates.arn
}

output "alarms_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarms"
  value       = aws_sns_topic.alarms.arn
}

# ========================
# Lambda Outputs
# ========================

output "document_orchestrator_function_name" {
  description = "Document orchestrator Lambda function name"
  value       = aws_lambda_function.document_orchestrator.function_name
}

output "document_orchestrator_function_arn" {
  description = "Document orchestrator Lambda function ARN"
  value       = aws_lambda_function.document_orchestrator.arn
}

output "document_validator_function_name" {
  description = "Document validator Lambda function name"
  value       = aws_lambda_function.document_validator.function_name
}

output "document_validator_function_arn" {
  description = "Document validator Lambda function ARN"
  value       = aws_lambda_function.document_validator.arn
}

# ========================
# ECS Outputs
# ========================

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN"
  value       = aws_ecs_cluster.main.arn
}

output "ecs_service_name" {
  description = "ECS API service name"
  value       = aws_ecs_service.api.name
}

output "ecr_repository_url" {
  description = "ECR repository URL for API"
  value       = aws_ecr_repository.api.repository_url
}

# ========================
# ALB Outputs
# ========================

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB zone ID for Route53 alias"
  value       = aws_lb.main.zone_id
}

output "alb_arn" {
  description = "ALB ARN"
  value       = aws_lb.main.arn
}

# ========================
# KMS Outputs
# ========================

output "kms_key_id" {
  description = "KMS key ID for encryption"
  value       = aws_kms_key.main.key_id
}

output "kms_key_arn" {
  description = "KMS key ARN for encryption"
  value       = aws_kms_key.main.arn
}

# ========================
# IAM Outputs
# ========================

output "textract_service_role_arn" {
  description = "IAM role ARN for Textract service"
  value       = aws_iam_role.textract_service.arn
}

output "lambda_orchestrator_role_arn" {
  description = "IAM role ARN for Lambda orchestrator"
  value       = aws_iam_role.lambda_orchestrator.arn
}

output "lambda_validator_role_arn" {
  description = "IAM role ARN for Lambda validator"
  value       = aws_iam_role.lambda_validator.arn
}

output "ecs_task_role_arn" {
  description = "IAM role ARN for ECS task"
  value       = aws_iam_role.ecs_task.arn
}

# ========================
# Security Group Outputs
# ========================

output "alb_security_group_id" {
  description = "Security group ID for ALB"
  value       = aws_security_group.alb.id
}

output "ecs_tasks_security_group_id" {
  description = "Security group ID for ECS tasks"
  value       = aws_security_group.ecs_tasks.id
}

output "lambda_security_group_id" {
  description = "Security group ID for Lambda"
  value       = aws_security_group.lambda.id
}

output "rds_security_group_id" {
  description = "Security group ID for RDS"
  value       = aws_security_group.rds.id
}

output "elasticache_security_group_id" {
  description = "Security group ID for ElastiCache"
  value       = aws_security_group.elasticache.id
}

# ========================
# Useful Connection Strings (for reference)
# ========================

output "api_endpoint" {
  description = "API endpoint URL"
  value       = "https://${aws_lb.main.dns_name}"
}

output "environment_variables" {
  description = "Environment variables for application configuration"
  value = {
    AWS_REGION                = local.region
    RAW_BUCKET                = aws_s3_bucket.raw_documents.id
    PROCESSED_BUCKET          = aws_s3_bucket.processed_documents.id
    TEXTRACT_OUTPUT_BUCKET    = aws_s3_bucket.textract_output.id
    TEXTRACT_SNS_TOPIC_ARN    = aws_sns_topic.textract_completion.arn
    TEXTRACT_ROLE_ARN         = aws_iam_role.textract_service.arn
    INGESTION_QUEUE_URL       = aws_sqs_queue.document_ingestion.url
    PROCESSING_QUEUE_URL      = aws_sqs_queue.document_processing.url
    REVIEW_QUEUE_URL          = aws_sqs_queue.human_review.url
    NOTIFICATIONS_QUEUE_URL   = aws_sqs_queue.notifications.url
    STATUS_TOPIC_ARN          = aws_sns_topic.kyc_status_updates.arn
    DB_SECRET_ARN             = aws_secretsmanager_secret.rds_credentials.arn
    REDIS_SECRET_ARN          = aws_secretsmanager_secret.redis_auth_token.arn
    KMS_KEY_ID                = aws_kms_key.main.id
  }
  sensitive = false
}
