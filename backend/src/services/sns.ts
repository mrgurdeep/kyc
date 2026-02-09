import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { logger } from '../utils/logger';

// Lazy initialization to ensure environment variables are loaded
let _snsClient: SNSClient | null = null;

function getSNSClient(): SNSClient {
  if (!_snsClient) {
    const isLocalStack = process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT;
    const localStackEndpoint = process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';

    _snsClient = new SNSClient({
      region: process.env.AWS_REGION || 'us-east-1',
      ...(isLocalStack && {
        endpoint: localStackEndpoint,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
        },
      }),
    });

    logger.info('SNS client initialized', { 
      isLocalStack: !!isLocalStack, 
      endpoint: isLocalStack ? localStackEndpoint : 'AWS' 
    });
  }
  return _snsClient;
}

// Lazy getter for topic ARNs
function getTopics() {
  return {
    statusUpdates: process.env.SNS_STATUS_TOPIC_ARN || '',
    textractCompletion: process.env.SNS_TEXTRACT_TOPIC_ARN || '',
  };
}

interface StatusUpdateMessage {
  submissionId: string;
  userId: string;
  status: string;
  timestamp: string;
  reason?: string;
}

interface TextractCompletionMessage {
  submissionId: string;
  jobId: string;
  status: 'SUCCEEDED' | 'FAILED';
  outputBucket: string;
  outputKey: string;
  timestamp: string;
}

export const snsService = {
  /**
   * Publish KYC status update
   */
  async publishStatusUpdate(message: StatusUpdateMessage): Promise<string> {
    return this.publish(getTopics().statusUpdates, message, 'KYCStatusUpdate');
  },

  /**
   * Publish Textract completion notification
   */
  async publishTextractCompletion(
    message: TextractCompletionMessage
  ): Promise<string> {
    return this.publish(getTopics().textractCompletion, message, 'TextractCompletion');
  },

  /**
   * Generic publish function
   */
  async publish(
    topicArn: string,
    message: object,
    subject: string
  ): Promise<string> {
    if (!topicArn) {
      logger.warn(`Topic ARN not configured for ${subject}`);
      return '';
    }

    try {
      const command = new PublishCommand({
        TopicArn: topicArn,
        Message: JSON.stringify(message),
        Subject: subject,
        MessageAttributes: {
          MessageType: {
            DataType: 'String',
            StringValue: subject,
          },
          Timestamp: {
            DataType: 'String',
            StringValue: new Date().toISOString(),
          },
        },
      });

      const response = await getSNSClient().send(command);

      logger.debug('Message published to SNS', {
        topicArn,
        subject,
        messageId: response.MessageId,
      });

      return response.MessageId || '';
    } catch (error) {
      logger.error('Failed to publish SNS message', {
        topicArn,
        subject,
        error,
      });
      throw error;
    }
  },

  /**
   * Publish message to multiple topics
   */
  async publishToMultiple(
    topicArns: string[],
    message: object,
    subject: string
  ): Promise<string[]> {
    const results = await Promise.allSettled(
      topicArns.map((arn) => this.publish(arn, message, subject))
    );

    return results.map((result) =>
      result.status === 'fulfilled' ? result.value : ''
    );
  },
};

export { getSNSClient as snsClient, getTopics as TOPICS };
