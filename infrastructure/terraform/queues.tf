# KYC Onboarding System - Messaging Infrastructure
# SQS Queues, Dead Letter Queues, SNS Topics

# ========================
# SQS - Document Ingestion Queue
# ========================

resource "aws_sqs_queue" "document_ingestion" {
  name = "${local.name_prefix}-document-ingestion"

  # High throughput settings
  visibility_timeout_seconds  = var.sqs_visibility_timeout_seconds
  message_retention_seconds   = var.sqs_message_retention_seconds
  delay_seconds               = 0
  receive_wait_time_seconds   = 20 # Long polling
  max_message_size            = 262144 # 256 KB

  # Encryption
  kms_master_key_id                 = aws_kms_key.main.id
  kms_data_key_reuse_period_seconds = 300

  # Dead Letter Queue
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.document_ingestion_dlq.arn
    maxReceiveCount     = var.sqs_max_receive_count
  })

  tags = {
    Name    = "${local.name_prefix}-document-ingestion"
    Purpose = "Receives S3 upload events for document processing"
  }
}

resource "aws_sqs_queue" "document_ingestion_dlq" {
  name = "${local.name_prefix}-document-ingestion-dlq"

  message_retention_seconds = 1209600 # 14 days for investigation

  kms_master_key_id                 = aws_kms_key.main.id
  kms_data_key_reuse_period_seconds = 300

  tags = {
    Name    = "${local.name_prefix}-document-ingestion-dlq"
    Purpose = "Dead letter queue for failed document ingestion"
  }
}

# Allow S3 to send messages to ingestion queue
resource "aws_sqs_queue_policy" "document_ingestion_s3" {
  queue_url = aws_sqs_queue.document_ingestion.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowS3Notification"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.document_ingestion.arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = aws_s3_bucket.raw_documents.arn
          }
        }
      }
    ]
  })
}

# ========================
# SQS - Document Processing Queue
# ========================

resource "aws_sqs_queue" "document_processing" {
  name = "${local.name_prefix}-document-processing"

  visibility_timeout_seconds  = var.sqs_visibility_timeout_seconds
  message_retention_seconds   = var.sqs_message_retention_seconds
  delay_seconds               = 0
  receive_wait_time_seconds   = 20

  kms_master_key_id                 = aws_kms_key.main.id
  kms_data_key_reuse_period_seconds = 300

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.document_processing_dlq.arn
    maxReceiveCount     = var.sqs_max_receive_count
  })

  tags = {
    Name    = "${local.name_prefix}-document-processing"
    Purpose = "Receives AI processing results for validation"
  }
}

resource "aws_sqs_queue" "document_processing_dlq" {
  name = "${local.name_prefix}-document-processing-dlq"

  message_retention_seconds = 1209600

  kms_master_key_id                 = aws_kms_key.main.id
  kms_data_key_reuse_period_seconds = 300

  tags = {
    Name    = "${local.name_prefix}-document-processing-dlq"
    Purpose = "Dead letter queue for failed document processing"
  }
}

# ========================
# SQS - Human Review Queue
# ========================

resource "aws_sqs_queue" "human_review" {
  name = "${local.name_prefix}-human-review"

  visibility_timeout_seconds  = 900 # 15 min - longer for human review
  message_retention_seconds   = var.sqs_message_retention_seconds
  delay_seconds               = 0
  receive_wait_time_seconds   = 20

  kms_master_key_id                 = aws_kms_key.main.id
  kms_data_key_reuse_period_seconds = 300

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.human_review_dlq.arn
    maxReceiveCount     = 10 # More retries for human review
  })

  tags = {
    Name    = "${local.name_prefix}-human-review"
    Purpose = "Queue for documents pending human review"
  }
}

resource "aws_sqs_queue" "human_review_dlq" {
  name = "${local.name_prefix}-human-review-dlq"

  message_retention_seconds = 1209600

  kms_master_key_id                 = aws_kms_key.main.id
  kms_data_key_reuse_period_seconds = 300

  tags = {
    Name    = "${local.name_prefix}-human-review-dlq"
    Purpose = "Dead letter queue for review failures"
  }
}

# ========================
# SQS - Notification Queue
# ========================

resource "aws_sqs_queue" "notifications" {
  name = "${local.name_prefix}-notifications"

  visibility_timeout_seconds  = 60
  message_retention_seconds   = 86400 # 1 day
  delay_seconds               = 0
  receive_wait_time_seconds   = 20

  kms_master_key_id                 = aws_kms_key.main.id
  kms_data_key_reuse_period_seconds = 300

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.notifications_dlq.arn
    maxReceiveCount     = 5
  })

  tags = {
    Name    = "${local.name_prefix}-notifications"
    Purpose = "Queue for user notifications"
  }
}

resource "aws_sqs_queue" "notifications_dlq" {
  name = "${local.name_prefix}-notifications-dlq"

  message_retention_seconds = 1209600

  kms_master_key_id                 = aws_kms_key.main.id
  kms_data_key_reuse_period_seconds = 300

  tags = {
    Name    = "${local.name_prefix}-notifications-dlq"
    Purpose = "Dead letter queue for notification failures"
  }
}

# ========================
# SNS - Textract Completion Topic
# ========================

resource "aws_sns_topic" "textract_completion" {
  name              = "${local.name_prefix}-textract-completion"
  kms_master_key_id = aws_kms_key.main.id

  tags = {
    Name    = "${local.name_prefix}-textract-completion"
    Purpose = "Receives Textract async job completion notifications"
  }
}

resource "aws_sns_topic_policy" "textract_completion" {
  arn = aws_sns_topic.textract_completion.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowTextractPublish"
        Effect = "Allow"
        Principal = {
          Service = "textract.amazonaws.com"
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.textract_completion.arn
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = local.account_id
          }
        }
      }
    ]
  })
}

# Subscribe processing queue to Textract completion topic
resource "aws_sns_topic_subscription" "textract_to_processing" {
  topic_arn = aws_sns_topic.textract_completion.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.document_processing.arn
}

# Allow SNS to send to SQS
resource "aws_sqs_queue_policy" "document_processing_sns" {
  queue_url = aws_sqs_queue.document_processing.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowSNSMessages"
        Effect = "Allow"
        Principal = {
          Service = "sns.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.document_processing.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_sns_topic.textract_completion.arn
          }
        }
      }
    ]
  })
}

# ========================
# SNS - KYC Status Updates Topic
# ========================

resource "aws_sns_topic" "kyc_status_updates" {
  name              = "${local.name_prefix}-kyc-status-updates"
  kms_master_key_id = aws_kms_key.main.id

  tags = {
    Name    = "${local.name_prefix}-kyc-status-updates"
    Purpose = "Publishes KYC status change events"
  }
}

# Subscribe notification queue to status updates
resource "aws_sns_topic_subscription" "status_to_notifications" {
  topic_arn = aws_sns_topic.kyc_status_updates.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.notifications.arn
}

resource "aws_sqs_queue_policy" "notifications_sns" {
  queue_url = aws_sqs_queue.notifications.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowSNSMessages"
        Effect = "Allow"
        Principal = {
          Service = "sns.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.notifications.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_sns_topic.kyc_status_updates.arn
          }
        }
      }
    ]
  })
}

# ========================
# SNS - Alarm Topic
# ========================

resource "aws_sns_topic" "alarms" {
  name              = "${local.name_prefix}-alarms"
  kms_master_key_id = aws_kms_key.main.id

  tags = {
    Name    = "${local.name_prefix}-alarms"
    Purpose = "CloudWatch alarm notifications"
  }
}

resource "aws_sns_topic_subscription" "alarm_email" {
  count = var.alarm_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# ========================
# CloudWatch Alarms for DLQs
# ========================

resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  for_each = {
    "ingestion"  = aws_sqs_queue.document_ingestion_dlq.arn
    "processing" = aws_sqs_queue.document_processing_dlq.arn
    "review"     = aws_sqs_queue.human_review_dlq.arn
  }

  alarm_name          = "${local.name_prefix}-dlq-${each.key}-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert when messages appear in ${each.key} DLQ"

  dimensions = {
    QueueName = "${local.name_prefix}-${each.key == "ingestion" ? "document-ingestion" : each.key == "processing" ? "document-processing" : "human-review"}-dlq"
  }

  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]

  tags = {
    Name = "${local.name_prefix}-dlq-${each.key}-alarm"
  }
}
