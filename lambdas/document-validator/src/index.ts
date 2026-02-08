import { SQSEvent, SQSRecord, Context } from 'aws-lambda';
import {
  TextractClient,
  GetDocumentAnalysisCommand,
  Block,
  BlockType,
} from '@aws-sdk/client-textract';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import crypto from 'crypto';

// Initialize clients
const textractClient = new TextractClient({});
const snsClient = new SNSClient({});
const sqsClient = new SQSClient({});
const secretsClient = new SecretsManagerClient({});

// Environment variables
const REVIEW_QUEUE_URL = process.env.REVIEW_QUEUE_URL || '';
const STATUS_TOPIC_ARN = process.env.STATUS_TOPIC_ARN || '';
const DB_SECRET_ARN = process.env.DB_SECRET_ARN || '';
const KMS_KEY_ID = process.env.KMS_KEY_ID || '';
const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.85');

// Field mappings for different document types
const FIELD_MAPPINGS: Record<string, string[]> = {
  passport: [
    'full_name',
    'date_of_birth',
    'passport_number',
    'nationality',
    'expiry_date',
    'issue_date',
    'place_of_birth',
    'gender',
  ],
  national_id: [
    'full_name',
    'date_of_birth',
    'id_number',
    'address',
    'expiry_date',
  ],
  drivers_license: [
    'full_name',
    'date_of_birth',
    'license_number',
    'address',
    'expiry_date',
    'class',
  ],
  utility_bill: ['full_name', 'address', 'account_number', 'bill_date'],
  bank_statement: ['full_name', 'address', 'account_number', 'statement_date'],
};

interface ProcessingMessage {
  submissionId: string;
  userId: string;
  documentType: string;
  s3Key: string;
  textractJobId: string;
  rekognitionResults?: {
    faces: object[];
    text: object[];
  };
  timestamp: string;
}

interface SNSTextractMessage {
  JobId: string;
  Status: 'SUCCEEDED' | 'FAILED';
  API: string;
  Timestamp: number;
}

interface ExtractedField {
  fieldName: string;
  value: string;
  confidence: number;
}

export const handler = async (event: SQSEvent, context: Context): Promise<void> => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (error) {
      console.error('Failed to process record:', error);
      throw error; // Let SQS retry
    }
  }
};

async function processRecord(record: SQSRecord): Promise<void> {
  const body = JSON.parse(record.body);

  // Check if this is a Textract SNS notification
  if (body.Message) {
    const snsMessage: SNSTextractMessage = JSON.parse(body.Message);
    await handleTextractCompletion(snsMessage);
    return;
  }

  // Direct processing message
  const message = body as ProcessingMessage;
  await processDocument(message);
}

async function handleTextractCompletion(
  notification: SNSTextractMessage
): Promise<void> {
  console.log('Textract job completed:', notification);

  if (notification.Status !== 'SUCCEEDED') {
    console.error('Textract job failed:', notification.JobId);
    // TODO: Update submission status to failed
    return;
  }

  // Fetch Textract results and process
  const extractedData = await getTextractResults(notification.JobId);
  console.log('Extracted data:', extractedData);

  // TODO: Store in database and queue for review
}

async function processDocument(message: ProcessingMessage): Promise<void> {
  console.log('Processing document:', message.submissionId);

  // Get Textract results
  const blocks = await getTextractResults(message.textractJobId);

  // Extract and categorize data
  const extractedFields = extractFields(blocks, message.documentType);

  // Validate completeness and confidence
  const validationResult = validateExtractedData(
    extractedFields,
    message.documentType
  );

  // Encrypt sensitive data
  const encryptedFields = await encryptFields(extractedFields);

  // Determine if human review is needed
  const needsReview =
    !validationResult.isComplete ||
    validationResult.lowConfidenceFields.length > 0;

  // Calculate priority based on confidence and completeness
  const priority = calculatePriority(validationResult);

  // TODO: Store in database using Prisma
  // For now, just log and queue for review

  if (needsReview) {
    // Queue for human review
    await queueForReview({
      submissionId: message.submissionId,
      priority,
      extractedData: encryptedFields,
      validationResult,
      timestamp: new Date().toISOString(),
    });

    // Publish status update
    await publishStatusUpdate({
      submissionId: message.submissionId,
      userId: message.userId,
      status: 'review',
      timestamp: new Date().toISOString(),
    });
  } else {
    // Auto-approve high confidence complete submissions
    await publishStatusUpdate({
      submissionId: message.submissionId,
      userId: message.userId,
      status: 'approved',
      timestamp: new Date().toISOString(),
    });
  }

  console.log('Document processed:', {
    submissionId: message.submissionId,
    fieldsExtracted: extractedFields.length,
    needsReview,
    priority,
  });
}

async function getTextractResults(jobId: string): Promise<Block[]> {
  const blocks: Block[] = [];
  let nextToken: string | undefined;

  do {
    const response = await textractClient.send(
      new GetDocumentAnalysisCommand({
        JobId: jobId,
        NextToken: nextToken,
      })
    );

    if (response.Blocks) {
      blocks.push(...response.Blocks);
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return blocks;
}

function extractFields(blocks: Block[], documentType: string): ExtractedField[] {
  const fields: ExtractedField[] = [];
  const expectedFields = FIELD_MAPPINGS[documentType] || [];

  // Build key-value map from Textract blocks
  const keyValueMap = buildKeyValueMap(blocks);

  // Extract fields based on document type
  for (const fieldName of expectedFields) {
    const normalizedFieldName = fieldName.toLowerCase().replace(/_/g, ' ');

    // Search for matching keys
    for (const [key, valueData] of keyValueMap.entries()) {
      const normalizedKey = key.toLowerCase();

      if (isFieldMatch(normalizedKey, normalizedFieldName)) {
        fields.push({
          fieldName,
          value: valueData.value,
          confidence: valueData.confidence,
        });
        break;
      }
    }
  }

  return fields;
}

function buildKeyValueMap(
  blocks: Block[]
): Map<string, { value: string; confidence: number }> {
  const keyMap = new Map<string, Block>();
  const valueMap = new Map<string, Block>();
  const keyValueMap = new Map<string, { value: string; confidence: number }>();

  // Build maps of keys and values
  for (const block of blocks) {
    if (block.BlockType === BlockType.KEY_VALUE_SET) {
      if (block.EntityTypes?.includes('KEY')) {
        keyMap.set(block.Id || '', block);
      } else if (block.EntityTypes?.includes('VALUE')) {
        valueMap.set(block.Id || '', block);
      }
    }
  }

  // Create block ID to text map
  const blockTextMap = new Map<string, string>();
  for (const block of blocks) {
    if (block.BlockType === BlockType.WORD || block.BlockType === BlockType.SELECTION_ELEMENT) {
      blockTextMap.set(block.Id || '', block.Text || '');
    }
  }

  // Match keys to values
  for (const [keyId, keyBlock] of keyMap.entries()) {
    const keyText = getTextFromBlock(keyBlock, blockTextMap);
    const valueIds = keyBlock.Relationships?.find((r) => r.Type === 'VALUE')?.Ids || [];

    for (const valueId of valueIds) {
      const valueBlock = valueMap.get(valueId);
      if (valueBlock) {
        const valueText = getTextFromBlock(valueBlock, blockTextMap);
        const confidence = Math.min(
          keyBlock.Confidence || 0,
          valueBlock.Confidence || 0
        ) / 100;

        keyValueMap.set(keyText, { value: valueText, confidence });
      }
    }
  }

  return keyValueMap;
}

function getTextFromBlock(
  block: Block,
  blockTextMap: Map<string, string>
): string {
  const childIds =
    block.Relationships?.find((r) => r.Type === 'CHILD')?.Ids || [];
  return childIds
    .map((id) => blockTextMap.get(id) || '')
    .join(' ')
    .trim();
}

function isFieldMatch(key: string, fieldName: string): boolean {
  // Simple matching - can be enhanced with fuzzy matching
  const keyWords = key.split(/\s+/);
  const fieldWords = fieldName.split(/\s+/);

  return fieldWords.some((fw) =>
    keyWords.some((kw) => kw.includes(fw) || fw.includes(kw))
  );
}

function validateExtractedData(
  fields: ExtractedField[],
  documentType: string
): {
  isComplete: boolean;
  missingFields: string[];
  lowConfidenceFields: string[];
  averageConfidence: number;
} {
  const expectedFields = FIELD_MAPPINGS[documentType] || [];
  const extractedFieldNames = fields.map((f) => f.fieldName);

  const missingFields = expectedFields.filter(
    (f) => !extractedFieldNames.includes(f)
  );

  const lowConfidenceFields = fields
    .filter((f) => f.confidence < CONFIDENCE_THRESHOLD)
    .map((f) => f.fieldName);

  const averageConfidence =
    fields.length > 0
      ? fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length
      : 0;

  return {
    isComplete: missingFields.length === 0,
    missingFields,
    lowConfidenceFields,
    averageConfidence,
  };
}

function calculatePriority(validationResult: {
  isComplete: boolean;
  missingFields: string[];
  lowConfidenceFields: string[];
  averageConfidence: number;
}): number {
  // Priority: 1 (lowest) to 5 (highest)
  let priority = 3;

  if (!validationResult.isComplete) {
    priority += 1;
  }

  if (validationResult.lowConfidenceFields.length > 3) {
    priority += 1;
  }

  if (validationResult.averageConfidence < 0.7) {
    priority += 1;
  }

  return Math.min(priority, 5);
}

async function encryptFields(
  fields: ExtractedField[]
): Promise<Array<{ fieldName: string; encryptedValue: string; confidence: number }>> {
  const encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-for-dev';

  return fields.map((field) => ({
    fieldName: field.fieldName,
    encryptedValue: encrypt(field.value, encryptionKey),
    confidence: field.confidence,
  }));
}

function encrypt(text: string, key: string): string {
  const algorithm = 'aes-256-gcm';
  const iv = crypto.randomBytes(16);
  const keyBuffer = crypto.scryptSync(key, 'salt', 32);
  const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);

  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Combine iv + authTag + encrypted
  return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'base64')]).toString(
    'base64'
  );
}

async function queueForReview(message: object): Promise<void> {
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: REVIEW_QUEUE_URL,
      MessageBody: JSON.stringify(message),
      MessageAttributes: {
        MessageType: {
          DataType: 'String',
          StringValue: 'ReviewRequest',
        },
      },
    })
  );
}

async function publishStatusUpdate(message: object): Promise<void> {
  if (!STATUS_TOPIC_ARN) {
    console.warn('STATUS_TOPIC_ARN not configured');
    return;
  }

  await snsClient.send(
    new PublishCommand({
      TopicArn: STATUS_TOPIC_ARN,
      Message: JSON.stringify(message),
      Subject: 'KYCStatusUpdate',
    })
  );
}
