# KYC Onboarding System - Compute Infrastructure
# Lambda Functions, ECS Cluster, ALB, Auto Scaling

# ========================
# CloudWatch Log Groups
# ========================

resource "aws_cloudwatch_log_group" "lambda_orchestrator" {
  name              = "/aws/lambda/${local.name_prefix}-document-orchestrator"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.main.arn

  tags = {
    Name = "${local.name_prefix}-lambda-orchestrator-logs"
  }
}

resource "aws_cloudwatch_log_group" "lambda_validator" {
  name              = "/aws/lambda/${local.name_prefix}-document-validator"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.main.arn

  tags = {
    Name = "${local.name_prefix}-lambda-validator-logs"
  }
}

resource "aws_cloudwatch_log_group" "ecs_api" {
  name              = "/ecs/${local.name_prefix}-api"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.main.arn

  tags = {
    Name = "${local.name_prefix}-ecs-api-logs"
  }
}

# ========================
# Lambda - Document Orchestrator
# ========================

resource "aws_lambda_function" "document_orchestrator" {
  function_name = "${local.name_prefix}-document-orchestrator"
  description   = "Orchestrates document processing with Textract and Rekognition"

  # Placeholder - will be updated by CI/CD
  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs20.x"

  role        = aws_iam_role.lambda_orchestrator.arn
  memory_size = var.lambda_memory_size
  timeout     = var.lambda_timeout

  reserved_concurrent_executions = var.lambda_reserved_concurrency

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      ENVIRONMENT              = var.environment
      RAW_BUCKET               = aws_s3_bucket.raw_documents.id
      PROCESSED_BUCKET         = aws_s3_bucket.processed_documents.id
      TEXTRACT_OUTPUT_BUCKET   = aws_s3_bucket.textract_output.id
      TEXTRACT_SNS_TOPIC_ARN   = aws_sns_topic.textract_completion.arn
      TEXTRACT_ROLE_ARN        = aws_iam_role.textract_service.arn
      PROCESSING_QUEUE_URL     = aws_sqs_queue.document_processing.url
      KMS_KEY_ID               = aws_kms_key.main.id
    }
  }

  tracing_config {
    mode = "Active"
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda_orchestrator,
    aws_iam_role_policy_attachment.lambda_orchestrator_policy
  ]

  tags = {
    Name = "${local.name_prefix}-document-orchestrator"
  }
}

# Lambda trigger from SQS
resource "aws_lambda_event_source_mapping" "orchestrator_sqs" {
  event_source_arn                   = aws_sqs_queue.document_ingestion.arn
  function_name                      = aws_lambda_function.document_orchestrator.arn
  batch_size                         = 10
  maximum_batching_window_in_seconds = 5
  enabled                            = true

  scaling_config {
    maximum_concurrency = 100
  }
}

# ========================
# Lambda - Document Validator
# ========================

resource "aws_lambda_function" "document_validator" {
  function_name = "${local.name_prefix}-document-validator"
  description   = "Validates extracted data and queues for human review"

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs20.x"

  role        = aws_iam_role.lambda_validator.arn
  memory_size = var.lambda_memory_size
  timeout     = var.lambda_timeout

  reserved_concurrent_executions = var.lambda_reserved_concurrency

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      ENVIRONMENT           = var.environment
      PROCESSED_BUCKET      = aws_s3_bucket.processed_documents.id
      REVIEW_QUEUE_URL      = aws_sqs_queue.human_review.url
      STATUS_TOPIC_ARN      = aws_sns_topic.kyc_status_updates.arn
      DB_SECRET_ARN         = aws_secretsmanager_secret.rds_credentials.arn
      REDIS_SECRET_ARN      = aws_secretsmanager_secret.redis_auth_token.arn
      KMS_KEY_ID            = aws_kms_key.main.id
      CONFIDENCE_THRESHOLD  = "0.85"
    }
  }

  tracing_config {
    mode = "Active"
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda_validator,
    aws_iam_role_policy_attachment.lambda_validator_policy
  ]

  tags = {
    Name = "${local.name_prefix}-document-validator"
  }
}

# Lambda trigger from SQS (processing queue)
resource "aws_lambda_event_source_mapping" "validator_sqs" {
  event_source_arn                   = aws_sqs_queue.document_processing.arn
  function_name                      = aws_lambda_function.document_validator.arn
  batch_size                         = 10
  maximum_batching_window_in_seconds = 5
  enabled                            = true

  scaling_config {
    maximum_concurrency = 100
  }
}

# Placeholder Lambda code
data "archive_file" "lambda_placeholder" {
  type        = "zip"
  output_path = "${path.module}/lambda_placeholder.zip"

  source {
    content  = <<-EOF
      exports.handler = async (event) => {
        console.log('Placeholder Lambda - deploy actual code via CI/CD');
        return { statusCode: 200, body: 'OK' };
      };
    EOF
    filename = "index.js"
  }
}

# ========================
# ECS Cluster
# ========================

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  configuration {
    execute_command_configuration {
      kms_key_id = aws_kms_key.main.arn
      logging    = "OVERRIDE"

      log_configuration {
        cloud_watch_encryption_enabled = true
        cloud_watch_log_group_name     = aws_cloudwatch_log_group.ecs_api.name
      }
    }
  }

  tags = {
    Name = "${local.name_prefix}-cluster"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 1
    capacity_provider = "FARGATE"
  }

  default_capacity_provider_strategy {
    weight            = 4
    capacity_provider = "FARGATE_SPOT"
  }
}

# ========================
# ECS Task Definition - API
# ========================

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name_prefix}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "api"
      image = "node:20-alpine" # Placeholder - update with actual ECR image

      portMappings = [
        {
          containerPort = var.api_container_port
          hostPort      = var.api_container_port
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = var.environment },
        { name = "PORT", value = tostring(var.api_container_port) },
        { name = "AWS_REGION", value = local.region }
      ]

      secrets = [
        {
          name      = "DB_CONNECTION"
          valueFrom = aws_secretsmanager_secret.rds_credentials.arn
        },
        {
          name      = "REDIS_CONNECTION"
          valueFrom = aws_secretsmanager_secret.redis_auth_token.arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs_api.name
          "awslogs-region"        = local.region
          "awslogs-stream-prefix" = "api"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:${var.api_container_port}/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

      essential = true
    }
  ])

  tags = {
    Name = "${local.name_prefix}-api-task"
  }
}

# ========================
# ECS Service - API
# ========================

resource "aws_ecs_service" "api" {
  name            = "${local.name_prefix}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.ecs_desired_count

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 4
  }

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = var.api_container_port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_controller {
    type = "ECS"
  }

  propagate_tags = "SERVICE"

  lifecycle {
    ignore_changes = [desired_count] # Managed by auto-scaling
  }

  depends_on = [aws_lb_listener.https]

  tags = {
    Name = "${local.name_prefix}-api-service"
  }
}

# ========================
# Application Load Balancer
# ========================

resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = var.environment == "prod"
  enable_http2               = true

  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    prefix  = "alb"
    enabled = true
  }

  tags = {
    Name = "${local.name_prefix}-alb"
  }
}

# ALB Logs Bucket
resource "aws_s3_bucket" "alb_logs" {
  bucket = "${local.name_prefix}-alb-logs-${random_id.suffix.hex}"

  tags = {
    Name = "${local.name_prefix}-alb-logs"
  }
}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_elb_service_account.main.id}:root"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.alb_logs.arn}/alb/*"
      }
    ]
  })
}

data "aws_elb_service_account" "main" {}

# Target Group
resource "aws_lb_target_group" "api" {
  name        = "${local.name_prefix}-api-tg"
  port        = var.api_container_port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/health"
    protocol            = "HTTP"
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = {
    Name = "${local.name_prefix}-api-tg"
  }
}

# HTTP Listener (redirect to HTTPS)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = {
    Name = "${local.name_prefix}-http-listener"
  }
}

# HTTPS Listener
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.main.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  tags = {
    Name = "${local.name_prefix}-https-listener"
  }
}

# Self-signed certificate for development (replace with ACM in production)
resource "aws_acm_certificate" "main" {
  domain_name       = var.domain_name != "" ? var.domain_name : "kyc.${var.environment}.local"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${local.name_prefix}-certificate"
  }
}

# ========================
# Auto Scaling - ECS
# ========================

resource "aws_appautoscaling_target" "ecs_api" {
  max_capacity       = var.ecs_max_capacity
  min_capacity       = var.ecs_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Scale on CPU
resource "aws_appautoscaling_policy" "ecs_cpu" {
  name               = "${local.name_prefix}-ecs-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_api.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_api.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = var.scaling_target_cpu
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Scale on Memory
resource "aws_appautoscaling_policy" "ecs_memory" {
  name               = "${local.name_prefix}-ecs-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_api.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_api.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = var.scaling_target_memory
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Scale on ALB Request Count
resource "aws_appautoscaling_policy" "ecs_requests" {
  name               = "${local.name_prefix}-ecs-requests-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_api.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_api.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.main.arn_suffix}/${aws_lb_target_group.api.arn_suffix}"
    }
    target_value       = var.scaling_target_requests
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# ========================
# Lambda Provisioned Concurrency (for high throughput)
# ========================

resource "aws_lambda_provisioned_concurrency_config" "orchestrator" {
  count = var.environment == "prod" ? 1 : 0

  function_name                     = aws_lambda_function.document_orchestrator.function_name
  provisioned_concurrent_executions = 100
  qualifier                         = aws_lambda_function.document_orchestrator.version
}

resource "aws_lambda_provisioned_concurrency_config" "validator" {
  count = var.environment == "prod" ? 1 : 0

  function_name                     = aws_lambda_function.document_validator.function_name
  provisioned_concurrent_executions = 100
  qualifier                         = aws_lambda_function.document_validator.version
}
