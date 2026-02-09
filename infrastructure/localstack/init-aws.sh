#!/bin/bash

# LocalStack initialization script
# Creates AWS resources for local development

echo "Initializing LocalStack AWS resources..."

# Create S3 buckets
awslocal s3 mb s3://kyc-raw-documents
awslocal s3 mb s3://kyc-processed-documents
awslocal s3 mb s3://kyc-textract-output

# Configure CORS for raw documents bucket
awslocal s3api put-bucket-cors --bucket kyc-raw-documents --cors-configuration '{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["PUT", "POST", "GET"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"]
    }
  ]
}'

# Create SQS queues
awslocal sqs create-queue --queue-name kyc-document-ingestion
awslocal sqs create-queue --queue-name kyc-document-ingestion-dlq
awslocal sqs create-queue --queue-name kyc-document-processing
awslocal sqs create-queue --queue-name kyc-document-processing-dlq
awslocal sqs create-queue --queue-name kyc-human-review
awslocal sqs create-queue --queue-name kyc-human-review-dlq
awslocal sqs create-queue --queue-name kyc-notifications
awslocal sqs create-queue --queue-name kyc-notifications-dlq

# Create SNS topics
awslocal sns create-topic --name kyc-textract-completion
awslocal sns create-topic --name kyc-status-updates
awslocal sns create-topic --name kyc-alarms

# Subscribe SQS to SNS
awslocal sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:000000000000:kyc-status-updates \
  --protocol sqs \
  --notification-endpoint arn:aws:sqs:us-east-1:000000000000:kyc-notifications

# Configure S3 event notifications to trigger SQS when objects are uploaded
# This mimics the production setup where S3 → SQS → Lambda
awslocal s3api put-bucket-notification-configuration \
  --bucket kyc-raw-documents \
  --notification-configuration '{
    "QueueConfigurations": [
      {
        "QueueArn": "arn:aws:sqs:us-east-1:000000000000:kyc-document-ingestion",
        "Events": ["s3:ObjectCreated:*"],
        "Filter": {
          "Key": {
            "FilterRules": [
              {"Name": "prefix", "Value": "raw/"}
            ]
          }
        }
      }
    ]
  }'

echo "S3 event notification configured for kyc-raw-documents → kyc-document-ingestion queue"

# Create KMS key for encryption
awslocal kms create-key --description "KYC encryption key"

# Create secrets
awslocal secretsmanager create-secret \
  --name kyc-dev-rds-credentials \
  --secret-string '{"username":"kyc_admin","password":"kyc_password","host":"postgres","port":5432,"dbname":"kyc_db"}'

awslocal secretsmanager create-secret \
  --name kyc-dev-redis-auth-token \
  --secret-string '{"auth_token":"","primary_endpoint":"redis","port":6379}'

echo "LocalStack initialization complete!"

# List created resources
echo ""
echo "=== Created Resources ==="
echo ""
echo "S3 Buckets:"
awslocal s3 ls

echo ""
echo "SQS Queues:"
awslocal sqs list-queues

echo ""
echo "SNS Topics:"
awslocal sns list-topics

echo ""
echo "Secrets:"
awslocal secretsmanager list-secrets
