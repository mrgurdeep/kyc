import { SQSEvent, SQSRecord, Context } from 'aws-lambda';
import {
  TextractClient,
  StartDocumentAnalysisCommand,
  FeatureType,
} from '@aws-sdk/client-textract';
import {
  RekognitionClient,
  DetectFacesCommand,
  DetectTextCommand,
  Attribute,
} from '@aws-sdk/client-rekognition';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

// Initialize clients
const textractClient = new TextractClient({});
const rekognitionClient = new RekognitionClient({});
const sqsClient = new SQSClient({});
const s3Client = new S3Client({});

// Environment variables
const RAW_BUCKET = process.env.RAW_BUCKET || '';
const TEXTRACT_OUTPUT_BUCKET = process.env.TEXTRACT_OUTPUT_BUCKET || '';
const TEXTRACT_SNS_TOPIC_ARN = process.env.TEXTRACT_SNS_TOPIC_ARN || '';
const TEXTRACT_ROLE_ARN = process.env.TEXTRACT_ROLE_ARN || '';
const PROCESSING_QUEUE_URL = process.env.PROCESSING_QUEUE_URL || '';

interface DocumentMessage {
  submissionId: string;
  userId: string;
  documentType: string;
  s3Key: string;
  timestamp: string;
}

interface S3EventRecord {
  s3: {
    bucket: { name: string };
    object: { key: string };
  };
}

export const handler = async (event: SQSEvent, context: Context): Promise<void> => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  const results = await Promise.allSettled(
    event.Records.map((record) => processRecord(record))
  );

  // Log results
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`Failed to process record ${index}:`, result.reason);
    }
  });

  // Throw if all failed
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length === results.length) {
    throw new Error('All records failed to process');
  }
};

async function processRecord(record: SQSRecord): Promise<void> {
  const body = JSON.parse(record.body);

  // Handle both direct messages and S3 event notifications
  let message: DocumentMessage;

  if (body.Records && body.Records[0]?.s3) {
    // S3 Event notification
    const s3Event = body.Records[0] as S3EventRecord;
    const s3Key = decodeURIComponent(s3Event.s3.object.key.replace(/\+/g, ' '));

    // Extract submissionId from key (format: raw/year/month/submissionId/filename)
    const keyParts = s3Key.split('/');
    const submissionId = keyParts[3];

    message = {
      submissionId,
      userId: '', // Will be fetched from DB if needed
      documentType: keyParts[4]?.split('.')[0] || 'unknown',
      s3Key,
      timestamp: new Date().toISOString(),
    };
  } else {
    // Direct message
    message = body as DocumentMessage;
  }

  console.log('Processing document:', message);

  // Verify file exists
  await verifyFileExists(message.s3Key);

  // Determine if document is image or PDF
  const fileExtension = message.s3Key.split('.').pop()?.toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg'].includes(fileExtension || '');
  const isPdf = fileExtension === 'pdf';

  // Start processing based on document type
  const [textractResult, rekognitionResult] = await Promise.all([
    startTextractAnalysis(message.submissionId, message.s3Key),
    isImage ? runRekognitionAnalysis(message.s3Key) : Promise.resolve(null),
  ]);

  // Send to processing queue for next step
  await sendToProcessingQueue({
    submissionId: message.submissionId,
    userId: message.userId,
    documentType: message.documentType,
    s3Key: message.s3Key,
    textractJobId: textractResult.jobId,
    rekognitionResults: rekognitionResult,
    timestamp: new Date().toISOString(),
  });

  console.log('Document processing initiated:', {
    submissionId: message.submissionId,
    textractJobId: textractResult.jobId,
  });
}

async function verifyFileExists(s3Key: string): Promise<void> {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: RAW_BUCKET,
        Key: s3Key,
      })
    );
  } catch (error) {
    console.error('File not found in S3:', s3Key);
    throw new Error(`File not found: ${s3Key}`);
  }
}

async function startTextractAnalysis(
  submissionId: string,
  s3Key: string
): Promise<{ jobId: string }> {
  const command = new StartDocumentAnalysisCommand({
    DocumentLocation: {
      S3Object: {
        Bucket: RAW_BUCKET,
        Name: s3Key,
      },
    },
    FeatureTypes: [FeatureType.FORMS, FeatureType.TABLES],
    NotificationChannel: {
      SNSTopicArn: TEXTRACT_SNS_TOPIC_ARN,
      RoleArn: TEXTRACT_ROLE_ARN,
    },
    OutputConfig: {
      S3Bucket: TEXTRACT_OUTPUT_BUCKET,
      S3Prefix: `${submissionId}/`,
    },
    ClientRequestToken: submissionId,
  });

  const response = await textractClient.send(command);

  if (!response.JobId) {
    throw new Error('Failed to start Textract analysis');
  }

  console.log('Textract job started:', response.JobId);

  return { jobId: response.JobId };
}

async function runRekognitionAnalysis(s3Key: string): Promise<{
  faces: object[];
  text: object[];
}> {
  const [facesResponse, textResponse] = await Promise.all([
    rekognitionClient.send(
      new DetectFacesCommand({
        Image: {
          S3Object: {
            Bucket: RAW_BUCKET,
            Name: s3Key,
          },
        },
        Attributes: [Attribute.ALL],
      })
    ),
    rekognitionClient.send(
      new DetectTextCommand({
        Image: {
          S3Object: {
            Bucket: RAW_BUCKET,
            Name: s3Key,
          },
        },
      })
    ),
  ]);

  console.log('Rekognition analysis complete:', {
    facesCount: facesResponse.FaceDetails?.length || 0,
    textDetections: textResponse.TextDetections?.length || 0,
  });

  return {
    faces: facesResponse.FaceDetails || [],
    text: textResponse.TextDetections || [],
  };
}

async function sendToProcessingQueue(message: object): Promise<void> {
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: PROCESSING_QUEUE_URL,
      MessageBody: JSON.stringify(message),
      MessageAttributes: {
        MessageType: {
          DataType: 'String',
          StringValue: 'DocumentProcessing',
        },
      },
    })
  );
}
