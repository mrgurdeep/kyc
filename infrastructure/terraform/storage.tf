# KYC Onboarding System - Storage Infrastructure
# S3 Buckets, KMS Keys, Encryption

# ========================
# KMS Key for Encryption
# ========================

resource "aws_kms_key" "main" {
  description             = "KMS key for KYC data encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${local.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow S3 Service"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      },
      {
        Sid    = "Allow Lambda Service"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      },
      {
        Sid    = "Allow Textract Service"
        Effect = "Allow"
        Principal = {
          Service = "textract.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey*"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name = "${local.name_prefix}-kms-key"
  }
}

resource "aws_kms_alias" "main" {
  name          = "alias/${local.name_prefix}-key"
  target_key_id = aws_kms_key.main.key_id
}

# ========================
# S3 Bucket - Raw Documents
# ========================

resource "aws_s3_bucket" "raw_documents" {
  bucket = "${local.name_prefix}-raw-documents-${random_id.suffix.hex}"

  tags = {
    Name    = "${local.name_prefix}-raw-documents"
    Purpose = "Raw document uploads"
  }
}

resource "aws_s3_bucket_versioning" "raw_documents" {
  bucket = aws_s3_bucket.raw_documents.id

  versioning_configuration {
    status = var.s3_versioning_enabled ? "Enabled" : "Disabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "raw_documents" {
  bucket = aws_s3_bucket.raw_documents.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.main.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "raw_documents" {
  bucket = aws_s3_bucket.raw_documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "raw_documents" {
  bucket = aws_s3_bucket.raw_documents.id

  rule {
    id     = "archive-old-documents"
    status = "Enabled"

    transition {
      days          = var.s3_lifecycle_raw_days
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = var.s3_lifecycle_raw_days + 180
      storage_class = "GLACIER"
    }

    expiration {
      days = var.s3_lifecycle_archive_days
    }

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "GLACIER"
    }

    noncurrent_version_expiration {
      noncurrent_days = 365
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "raw_documents" {
  bucket = aws_s3_bucket.raw_documents.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "POST"]
    allowed_origins = ["*"] # Restrict in production
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# S3 Event Notification to SQS
resource "aws_s3_bucket_notification" "raw_documents" {
  bucket = aws_s3_bucket.raw_documents.id

  queue {
    queue_arn     = aws_sqs_queue.document_ingestion.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "raw/"
  }

  depends_on = [aws_sqs_queue_policy.document_ingestion_s3]
}

# ========================
# S3 Bucket - Processed Documents
# ========================

resource "aws_s3_bucket" "processed_documents" {
  bucket = "${local.name_prefix}-processed-documents-${random_id.suffix.hex}"

  tags = {
    Name    = "${local.name_prefix}-processed-documents"
    Purpose = "Processed Textract outputs"
  }
}

resource "aws_s3_bucket_versioning" "processed_documents" {
  bucket = aws_s3_bucket.processed_documents.id

  versioning_configuration {
    status = var.s3_versioning_enabled ? "Enabled" : "Disabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "processed_documents" {
  bucket = aws_s3_bucket.processed_documents.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.main.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "processed_documents" {
  bucket = aws_s3_bucket.processed_documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "processed_documents" {
  bucket = aws_s3_bucket.processed_documents.id

  rule {
    id     = "archive-processed-documents"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 365
      storage_class = "GLACIER"
    }

    expiration {
      days = var.s3_lifecycle_archive_days
    }
  }
}

# ========================
# S3 Bucket - Archived Documents
# ========================

resource "aws_s3_bucket" "archived_documents" {
  bucket = "${local.name_prefix}-archived-documents-${random_id.suffix.hex}"

  tags = {
    Name    = "${local.name_prefix}-archived-documents"
    Purpose = "Long-term document archive"
  }
}

resource "aws_s3_bucket_versioning" "archived_documents" {
  bucket = aws_s3_bucket.archived_documents.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "archived_documents" {
  bucket = aws_s3_bucket.archived_documents.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.main.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "archived_documents" {
  bucket = aws_s3_bucket.archived_documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_object_lock_configuration" "archived_documents" {
  bucket              = aws_s3_bucket.archived_documents.id
  object_lock_enabled = "Enabled"

  rule {
    default_retention {
      mode = "COMPLIANCE"
      days = var.s3_lifecycle_archive_days
    }
  }
}

# ========================
# S3 Bucket - Textract Output
# ========================

resource "aws_s3_bucket" "textract_output" {
  bucket = "${local.name_prefix}-textract-output-${random_id.suffix.hex}"

  tags = {
    Name    = "${local.name_prefix}-textract-output"
    Purpose = "Textract async job outputs"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "textract_output" {
  bucket = aws_s3_bucket.textract_output.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.main.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "textract_output" {
  bucket = aws_s3_bucket.textract_output.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "textract_output" {
  bucket = aws_s3_bucket.textract_output.id

  rule {
    id     = "cleanup-textract-output"
    status = "Enabled"

    expiration {
      days = 7 # Short retention - data is copied to processed bucket
    }
  }
}

# ========================
# S3 Bucket Policy for Textract
# ========================

resource "aws_s3_bucket_policy" "textract_output" {
  bucket = aws_s3_bucket.textract_output.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowTextractWrite"
        Effect = "Allow"
        Principal = {
          Service = "textract.amazonaws.com"
        }
        Action = [
          "s3:PutObject"
        ]
        Resource = "${aws_s3_bucket.textract_output.arn}/*"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = local.account_id
          }
        }
      }
    ]
  })
}
