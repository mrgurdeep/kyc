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

- Node.js 18+ (Node.js 20+ recommended)
- Docker and Docker Compose
- AWS CLI (for deployment only)

### Local Development Setup

#### Step 1: Start Infrastructure Services

Start PostgreSQL, Redis, and LocalStack (local AWS emulator):

```bash
docker-compose up -d
```

Wait for services to be healthy (LocalStack takes ~15-20 seconds to initialize):

```bash
docker-compose ps
```

You should see all services as "healthy".

#### Step 2: Setup Backend

```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

The `.env` file is pre-configured for local development with LocalStack. Key settings:
- `AWS_ENDPOINT_URL=http://localhost:4566` - Routes AWS calls to LocalStack
- `DATABASE_URL` - Points to local PostgreSQL
- `SIMULATE_AI_PROCESSING=true` - Simulates Textract/Rekognition locally

#### Step 3: Initialize Database

```bash
cd backend

# Run migrations (use --skip-generate if you encounter Prisma binary errors on Apple Silicon)
npx prisma migrate dev --skip-generate

# Generate Prisma client
npx prisma generate
```

**Note for Apple Silicon (M1/M2) users**: If you see `BasicBlock` errors during Prisma operations, this is a known issue. Always use `--skip-generate` with migrate and run `npx prisma generate` separately.

#### Step 4: Setup Frontend

```bash
cd frontend

# Install dependencies
npm install

# Copy environment file (already configured for local dev)
cp .env.example .env
```

#### Step 5: Start Development Servers

Open two terminal windows:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

You should see:
```
Server running on port 3000
WebSocket server running on ws://0.0.0.0:3000/ws
Document processor worker started (local development mode)
Redis connected
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

#### Step 6: Create a Test User

The application is now running! Open http://localhost:5173 and register a new account.

**To create an admin user:**

```bash
# Option 1: Promote an existing user to admin
docker exec kyc-postgres psql -U kyc_admin -d kyc_db -c "UPDATE users SET role = 'admin' WHERE email = 'your@email.com';"

# Option 2: Use the admin creation script
cd backend
npx tsx scripts/createAdmin.ts admin@example.com YourPassword123! Admin User
```

**Important**: After changing a user's role, you must log out and log back in to get a new JWT token with the updated role.

#### Step 7: Test the Full Flow

1. **Register/Login** as a regular user at http://localhost:5173
2. **Upload a document** (passport, ID, etc.) - supports PNG, JPG, PDF
3. **Watch the status change** automatically:
   - `pending_upload` → `processing` → `pending_review`
4. **Login as admin** to review submissions at `/admin`
5. **Approve or reject** documents from the review queue

### Access Points

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3000 |
| API Health Check | http://localhost:3000/health |
| LocalStack | http://localhost:4566 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

### Useful Commands

```bash
# View backend logs
docker-compose logs -f backend

# View all container logs
docker-compose logs -f

# Check LocalStack resources
aws --endpoint-url=http://localhost:4566 s3 ls
aws --endpoint-url=http://localhost:4566 sqs list-queues

# Access PostgreSQL directly
docker exec -it kyc-postgres psql -U kyc_admin -d kyc_db

# Reset everything (removes all data)
docker-compose down -v
docker-compose up -d

# Rebuild after code changes
docker-compose up -d --build
```

### Troubleshooting

**WebSocket connection fails:**
- Restart the frontend dev server (`Ctrl+C` then `npm run dev`)
- Check that the backend is running on port 3000

**Database connection errors:**
- Verify Docker containers are running: `docker-compose ps`
- Check DATABASE_URL in `backend/.env` matches docker-compose credentials

**LocalStack errors ("Device or resource busy"):**
```bash
docker-compose down -v
docker volume prune -f
docker-compose up -d
```

**Prisma "BasicBlock" errors (Apple Silicon):**
```bash
cd backend
rm -rf node_modules/.prisma node_modules/@prisma/engines
npm install prisma@5.22.0 @prisma/client@5.22.0
npx prisma generate
```

**Documents stuck in "pending" status:**
- Check that `SIMULATE_AI_PROCESSING=true` is set in `backend/.env`
- Verify the document processor worker is running (check backend logs)
- Check LocalStack S3 notifications: `docker logs kyc-localstack`

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
