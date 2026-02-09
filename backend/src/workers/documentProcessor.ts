/**
 * Document Processor Worker
 * 
 * This worker polls the SQS ingestion queue for S3 upload events and processes documents.
 * In production, this logic runs in AWS Lambda triggered by SQS.
 * For local development, this runs as a background worker.
 */

import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { prisma } from '../services/database';
import { logger } from '../utils/logger';

// Lazy initialization
let _sqsClient: SQSClient | null = null;

function getSQSClient(): SQSClient {
  if (!_sqsClient) {
    const isLocalStack = process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT;
    const endpoint = process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';

    _sqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
      ...(isLocalStack && {
        endpoint,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
        },
      }),
    });
  }
  return _sqsClient;
}

interface S3EventRecord {
  eventSource: string;
  eventName: string;
  s3: {
    bucket: { name: string };
    object: { key: string; size: number };
  };
}

interface S3EventMessage {
  Records: S3EventRecord[];
}

const INGESTION_QUEUE_URL = () => process.env.SQS_INGESTION_QUEUE_URL || '';
const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds
const MAX_MESSAGES = 10;

let isRunning = false;

/**
 * Process a single S3 event (document upload)
 */
async function processS3Event(record: S3EventRecord): Promise<void> {
  const { bucket, object } = record.s3;
  const s3Key = decodeURIComponent(object.key.replace(/\+/g, ' '));

  logger.info('Processing S3 upload event', { bucket: bucket.name, key: s3Key });

  // Extract submission ID from key: raw/YYYY/MM/submissionId/documentType.ext
  const keyParts = s3Key.split('/');
  if (keyParts.length < 4) {
    logger.warn('Invalid S3 key format', { key: s3Key });
    return;
  }

  const submissionId = keyParts[3];

  try {
    // Find the KYC submission
    const submission = await prisma.kycSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      logger.warn('Submission not found for S3 event', { submissionId, s3Key });
      return;
    }

    // Update status to processing
    await prisma.kycSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'processing',
        updatedAt: new Date(),
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        action: 'document_upload_received',
        submissionId,
        actorId: submission.userId,
        details: {
          s3Key,
          bucket: bucket.name,
          fileSize: object.size,
          eventName: record.eventName,
        },
      },
    });

    logger.info('Document processing initiated', { submissionId, status: 'processing' });

    // In production, this would:
    // 1. Call AWS Textract to analyze the document
    // 2. Call AWS Rekognition for face detection/quality
    // 3. Queue results for validation
    
    // For local development, simulate processing with a delay
    if (process.env.SIMULATE_AI_PROCESSING === 'true') {
      await simulateAIProcessing(submissionId, submission.documentType);
    }

  } catch (error) {
    logger.error('Error processing S3 event', { submissionId, s3Key, error });
    
    // Update status to failed
    await prisma.kycSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'failed',
        rejectionReason: error instanceof Error ? error.message : 'Processing failed',
      },
    });
  }
}

/**
 * Simulate AI processing for local development
 */
async function simulateAIProcessing(submissionId: string, documentType: string): Promise<void> {
  logger.info('Simulating AI processing', { submissionId, documentType });

  // Simulate processing delay (2-5 seconds)
  await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));

  // Generate mock extracted data based on document type
  const mockExtractedData = generateMockExtractedData(documentType);
  const baseConfidence = 0.85 + Math.random() * 0.1; // 85-95% confidence

  // Get the submission to find the user ID for audit log
  const submission = await prisma.kycSubmission.findUnique({
    where: { id: submissionId },
  });

  // Store extracted data in the ExtractedData table
  const extractedDataRecords = Object.entries(mockExtractedData)
    .filter(([key]) => !['documentType', 'extractedAt', 'confidence'].includes(key))
    .map(([fieldName, value]) => ({
      submissionId,
      fieldName,
      encryptedValue: JSON.stringify(value), // In production, this would be encrypted
      confidenceScore: baseConfidence + (Math.random() * 0.05 - 0.025), // Slight variation per field
    }));

  // Use transaction to update submission and create extracted data
  await prisma.$transaction([
    // Update submission status
    prisma.kycSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'pending_review',
        processedAt: new Date(),
      },
    }),
    // Create extracted data records
    prisma.extractedData.createMany({
      data: extractedDataRecords,
    }),
    // Add to review queue
    prisma.reviewQueue.create({
      data: {
        submissionId,
        priority: 3, // Normal priority
      },
    }),
    // Create audit log
    prisma.auditLog.create({
      data: {
        action: 'processing_completed',
        submissionId,
        actorId: submission?.userId,
        details: {
          extractedFields: Object.keys(mockExtractedData),
          averageConfidence: baseConfidence,
          simulatedProcessing: true,
        },
      },
    }),
  ]);

  logger.info('AI processing simulation complete', { submissionId, status: 'pending_review' });
}

/**
 * Generate mock extracted data for testing
 */
function generateMockExtractedData(documentType: string): Record<string, any> {
  const baseData = {
    documentType,
    extractedAt: new Date().toISOString(),
    confidence: 0.92,
  };

  switch (documentType) {
    case 'passport':
      return {
        ...baseData,
        firstName: 'JOHN',
        lastName: 'DOE',
        dateOfBirth: '1990-01-15',
        passportNumber: 'AB1234567',
        nationality: 'USA',
        expiryDate: '2030-01-15',
        issuingCountry: 'United States',
        mrz: 'P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<',
      };
    case 'national_id':
      return {
        ...baseData,
        firstName: 'JOHN',
        lastName: 'DOE',
        dateOfBirth: '1990-01-15',
        idNumber: 'ID123456789',
        address: '123 Main St, City, State 12345',
        expiryDate: '2028-06-30',
      };
    case 'drivers_license':
      return {
        ...baseData,
        firstName: 'JOHN',
        lastName: 'DOE',
        dateOfBirth: '1990-01-15',
        licenseNumber: 'DL987654321',
        address: '123 Main St, City, State 12345',
        expiryDate: '2027-01-15',
        class: 'C',
      };
    case 'utility_bill':
      return {
        ...baseData,
        accountHolder: 'JOHN DOE',
        address: '123 Main St, City, State 12345',
        billDate: '2026-01-01',
        utilityType: 'Electric',
        provider: 'City Power Co.',
      };
    case 'bank_statement':
      return {
        ...baseData,
        accountHolder: 'JOHN DOE',
        accountNumber: '****1234',
        bankName: 'First National Bank',
        statementDate: '2026-01-31',
        address: '123 Main St, City, State 12345',
      };
    default:
      return baseData;
  }
}

/**
 * Poll SQS queue for messages
 */
async function pollQueue(): Promise<void> {
  const queueUrl = INGESTION_QUEUE_URL();
  
  if (!queueUrl) {
    logger.debug('Ingestion queue URL not configured, skipping poll');
    return;
  }

  try {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: MAX_MESSAGES,
      WaitTimeSeconds: 5, // Long polling
      MessageAttributeNames: ['All'],
    });

    const response = await getSQSClient().send(command);

    if (!response.Messages || response.Messages.length === 0) {
      return;
    }

    logger.debug(`Received ${response.Messages.length} messages from ingestion queue`);

    for (const message of response.Messages) {
      try {
        // Parse message body - S3 events are wrapped in SNS or direct S3 notification format
        let body = JSON.parse(message.Body || '{}');
        
        // Handle SNS wrapper
        if (body.Message) {
          body = JSON.parse(body.Message);
        }

        // Process S3 event records
        if (body.Records && Array.isArray(body.Records)) {
          for (const record of body.Records as S3EventRecord[]) {
            if (record.eventSource === 'aws:s3') {
              await processS3Event(record);
            }
          }
        }

        // Delete message after successful processing
        await getSQSClient().send(
          new DeleteMessageCommand({
            QueueUrl: queueUrl,
            ReceiptHandle: message.ReceiptHandle!,
          })
        );

      } catch (error) {
        logger.error('Error processing SQS message', { 
          messageId: message.MessageId, 
          error 
        });
        // Message will return to queue after visibility timeout
      }
    }
  } catch (error) {
    logger.error('Error polling SQS queue', { error });
  }
}

/**
 * Start the document processor worker
 */
export function startDocumentProcessor(): void {
  if (isRunning) {
    logger.warn('Document processor already running');
    return;
  }

  isRunning = true;
  logger.info('Starting document processor worker', { 
    pollInterval: POLL_INTERVAL_MS,
    simulateAI: process.env.SIMULATE_AI_PROCESSING === 'true',
  });

  const poll = async () => {
    if (!isRunning) return;

    await pollQueue();
    
    // Schedule next poll
    setTimeout(poll, POLL_INTERVAL_MS);
  };

  // Start polling
  poll();
}

/**
 * Stop the document processor worker
 */
export function stopDocumentProcessor(): void {
  isRunning = false;
  logger.info('Document processor worker stopped');
}

export { processS3Event, simulateAIProcessing };
