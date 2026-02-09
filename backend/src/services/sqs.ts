import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';
import { logger } from '../utils/logger';

// Lazy initialization to ensure environment variables are loaded
let _sqsClient: SQSClient | null = null;

function getSQSClient(): SQSClient {
  if (!_sqsClient) {
    const isLocalStack = process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT;
    const localStackEndpoint = process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';

    _sqsClient = new SQSClient({
      region: process.env.AWS_REGION || 'us-east-1',
      ...(isLocalStack && {
        endpoint: localStackEndpoint,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
        },
      }),
    });

    logger.info('SQS client initialized', { 
      isLocalStack: !!isLocalStack, 
      endpoint: isLocalStack ? localStackEndpoint : 'AWS' 
    });
  }
  return _sqsClient;
}

// Lazy getter for queue URLs
function getQueues() {
  return {
    ingestion: process.env.SQS_INGESTION_QUEUE_URL || '',
    processing: process.env.SQS_PROCESSING_QUEUE_URL || '',
    review: process.env.SQS_REVIEW_QUEUE_URL || '',
    notifications: process.env.SQS_NOTIFICATIONS_QUEUE_URL || '',
  };
}

interface DocumentIngestionMessage {
  submissionId: string;
  userId: string;
  documentType: string;
  s3Key: string;
  timestamp: string;
}

interface DocumentProcessingMessage {
  submissionId: string;
  textractJobId: string;
  rekognitionResults?: object;
  timestamp: string;
}

interface ReviewQueueMessage {
  submissionId: string;
  priority: number;
  extractedData: object;
  timestamp: string;
}

interface NotificationMessage {
  userId: string;
  type: 'status_update' | 'review_complete' | 'action_required';
  data: object;
  timestamp: string;
}

export const sqsService = {
  /**
   * Send message to document ingestion queue
   */
  async sendToIngestionQueue(message: DocumentIngestionMessage): Promise<string> {
    return this.sendMessage(getQueues().ingestion, message, 'ingestion');
  },

  /**
   * Send message to document processing queue
   */
  async sendToProcessingQueue(message: DocumentProcessingMessage): Promise<string> {
    return this.sendMessage(getQueues().processing, message, 'processing');
  },

  /**
   * Send message to human review queue
   */
  async sendToReviewQueue(message: ReviewQueueMessage): Promise<string> {
    return this.sendMessage(getQueues().review, message, 'review');
  },

  /**
   * Send message to notifications queue
   */
  async sendToNotificationsQueue(message: NotificationMessage): Promise<string> {
    return this.sendMessage(getQueues().notifications, message, 'notification');
  },

  /**
   * Generic send message function
   */
  async sendMessage(
    queueUrl: string,
    message: object,
    messageType: string
  ): Promise<string> {
    if (!queueUrl) {
      logger.warn(`Queue URL not configured for ${messageType}`);
      return '';
    }

    try {
      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          MessageType: {
            DataType: 'String',
            StringValue: messageType,
          },
          Timestamp: {
            DataType: 'String',
            StringValue: new Date().toISOString(),
          },
        },
      });

      const response = await getSQSClient().send(command);

      logger.debug('Message sent to SQS', {
        queueUrl,
        messageType,
        messageId: response.MessageId,
      });

      return response.MessageId || '';
    } catch (error) {
      logger.error('Failed to send SQS message', {
        queueUrl,
        messageType,
        error,
      });
      throw error;
    }
  },

  /**
   * Receive messages from a queue
   */
  async receiveMessages(
    queueUrl: string,
    maxMessages: number = 10,
    waitTimeSeconds: number = 20
  ): Promise<
    Array<{
      messageId: string;
      receiptHandle: string;
      body: object;
      attributes: Record<string, string>;
    }>
  > {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: waitTimeSeconds,
        MessageAttributeNames: ['All'],
        AttributeNames: ['All'],
      });

      const response = await getSQSClient().send(command);

      if (!response.Messages || response.Messages.length === 0) {
        return [];
      }

      return response.Messages.map((msg) => ({
        messageId: msg.MessageId || '',
        receiptHandle: msg.ReceiptHandle || '',
        body: JSON.parse(msg.Body || '{}'),
        attributes: Object.fromEntries(
          Object.entries(msg.MessageAttributes || {}).map(([key, value]) => [
            key,
            value.StringValue || '',
          ])
        ),
      }));
    } catch (error) {
      logger.error('Failed to receive SQS messages', { queueUrl, error });
      throw error;
    }
  },

  /**
   * Delete a message from the queue
   */
  async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    try {
      const command = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      });

      await getSQSClient().send(command);

      logger.debug('Message deleted from SQS', { queueUrl });
    } catch (error) {
      logger.error('Failed to delete SQS message', { queueUrl, error });
      throw error;
    }
  },

  /**
   * Get queue attributes (for monitoring)
   */
  async getQueueAttributes(queueUrl: string): Promise<{
    approximateNumberOfMessages: number;
    approximateNumberOfMessagesNotVisible: number;
  }> {
    try {
      const command = new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: [
          'ApproximateNumberOfMessages',
          'ApproximateNumberOfMessagesNotVisible',
        ],
      });

      const response = await getSQSClient().send(command);

      return {
        approximateNumberOfMessages: parseInt(
          response.Attributes?.ApproximateNumberOfMessages || '0'
        ),
        approximateNumberOfMessagesNotVisible: parseInt(
          response.Attributes?.ApproximateNumberOfMessagesNotVisible || '0'
        ),
      };
    } catch (error) {
      logger.error('Failed to get queue attributes', { queueUrl, error });
      throw error;
    }
  },
};

export { getSQSClient as sqsClient, getQueues as QUEUES };
