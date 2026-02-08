# KYC Client Onboarding System

A scalable, event-driven KYC (Know Your Customer) verification system built with React, Express/Node.js, and AWS services. Designed to handle 10k requests per second with AI-powered document processing and human review workflow.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ Document Upload │  │ Status Tracker  │  │ Admin Dashboard │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
└───────────┼─────────────────────┼─────────────────────┼─────────────────────┘
            │                     │                     │
            ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API Gateway (ALB)                                  │
│                    Express/Node.js API Cluster                              │
│                         (ECS Fargate)                                       │
└────────┬──────────────────────┬───────────────────────┬─────────────────────┘
         │                      │                       │
         ▼                      ▼                       ▼
┌─────────────┐      ┌─────────────────┐      ┌─────────────────┐
│     S3      │      │      SQS        │      │   PostgreSQL    │
│  Documents  │      │     Queues      │      │    (RDS)        │
└──────┬──────┘      └────────┬────────┘      └─────────────────┘
       │                      │
       ▼                      ▼
┌─────────────────────────────────────────────┐
│              Lambda Functions               │
│  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Orchestrator  │  │    Validator    │  │
│  │    (Textract)   │  │  (Data Store)   │  │
│  └────────┬────────┘  └────────┬────────┘  │
└───────────┼─────────────────────┼──────────┘
            │                     │
            ▼                     ▼
┌─────────────────┐    ┌─────────────────────┐
│  AWS Textract   │    │  Human Review Queue │
│  AWS Rekognition│    │    (SQS + API)      │
└─────────────────┘    └─────────────────────┘
```

## Features

- **Document Upload**: Secure file upload with presigned S3 URLs (PNG, JPG, PDF)
- **AI Processing**: AWS Textract for OCR and data extraction, Rekognition for face detection
- **Human Review**: Queue-based review system with assignment and approval workflow
- **Real-time Updates**: WebSocket notifications for status changes
- **Field-level Encryption**: AES-256 encryption for PII data
- **Audit Logging**: Complete audit trail of all actions
- **Auto-scaling**: Designed for 10k requests/second throughput

## Project Structure

```
kyc/
├── frontend/                    # React application
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── pages/             # Page components
│   │   ├── services/          # API and WebSocket services
│   │   └── store/             # Zustand state management
│   └── package.json
├── backend/                     # Express/Node.js API
│   ├── src/
│   │   ├── api/               # Routes, controllers, middleware
│   │   ├── services/          # AWS services, database, cache
│   │   ├── utils/             # Helpers, encryption, logging
│   │   └── websocket/         # WebSocket handlers
│   ├── prisma/                # Database schema
│   └── package.json
├── lambdas/                     # AWS Lambda functions
│   ├── document-orchestrator/ # Triggers Textract/Rekognition
│   └── document-validator/    # Processes AI results
├── infrastructure/              # Terraform IaC
│   ├── terraform/             # AWS infrastructure
│   └── localstack/            # Local development setup
└── docker-compose.yml          # Local development environment
```

## Quick Start

### Prerequisites

- Node.js 20+
- Docker and Docker Compose
- AWS CLI (for deployment)

### Local Development

1. **Clone and install dependencies**:

```bash
# Backend
cd backend
npm install
cp .env.example .env

# Frontend
cd ../frontend
npm install
```

2. **Start local services with Docker**:

```bash
docker-compose up -d
```

This starts:
- PostgreSQL (port 5432)
- Redis (port 6379)
- LocalStack (AWS services, port 4566)

3. **Initialize the database**:

```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

4. **Start the development servers**:

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

5. **Access the application**:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- API Health: http://localhost:3000/health

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/auth/me` - Get current user

### Upload
- `POST /api/v1/upload/presigned-url` - Get upload URL
- `POST /api/v1/upload/confirm` - Confirm upload
- `GET /api/v1/upload/status/:id` - Get upload status

### KYC
- `GET /api/v1/kyc/submissions` - List submissions
- `GET /api/v1/kyc/submissions/:id` - Get submission details
- `GET /api/v1/kyc/status` - Get overall KYC status

### Review (Admin)
- `GET /api/v1/review/queue` - List review queue
- `POST /api/v1/review/claim/:id` - Claim review item
- `POST /api/v1/review/release/:id` - Release review item
- `POST /api/v1/review/:id/decision` - Submit decision

## Deployment

### Infrastructure Setup

1. **Configure Terraform**:

```bash
cd infrastructure/terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your settings
```

2. **Deploy AWS infrastructure**:

```bash
terraform init
terraform plan
terraform apply
```

3. **Deploy application**:

```bash
# Build and push Docker images to ECR
# Update ECS service with new images
# Deploy Lambda functions
```

### Environment Variables

See `.env.example` files in backend and frontend directories for required environment variables.

## Security Features

- **Encryption at Rest**: S3, RDS, and ElastiCache all encrypted with KMS
- **Encryption in Transit**: TLS 1.3 for all connections
- **Field-level Encryption**: PII encrypted with AES-256-GCM
- **VPC Isolation**: Database in isolated subnets
- **IAM Least Privilege**: Minimal permissions for all services
- **Audit Logging**: Complete audit trail in database

## Scaling for 10k/sec

- **ECS Auto-scaling**: CPU, memory, and request-based scaling
- **Lambda Concurrency**: 1000+ concurrent executions
- **SQS Standard Queues**: Unlimited throughput
- **RDS Read Replicas**: For read-heavy workloads
- **ElastiCache Cluster**: Redis cluster mode for caching
- **Presigned URLs**: Direct S3 uploads bypass API

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Zustand, React Router
- **Backend**: Node.js 20, Express, TypeScript, Prisma, Zod
- **Database**: PostgreSQL 15, Redis 7
- **AWS**: S3, SQS, SNS, Lambda, Textract, Rekognition, ECS, ALB, RDS
- **Infrastructure**: Terraform, Docker

## License

MIT
