import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { logger } from '../utils/logger';

const snsClient = new SNSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const TOPICS = {
  statusUpdates: process.env.SNS_STATUS_TOPIC_ARN || '',
  textractCompletion: process.env.SNS_TEXTRACT_TOPIC_ARN || '',
};

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
    return this.publish(TOPICS.statusUpdates, message, 'KYCStatusUpdate');
  },

  /**
   * Publish Textract completion notification
   */
  async publishTextractCompletion(
    message: TextractCompletionMessage
  ): Promise<string> {
    return this.publish(TOPICS.textractCompletion, message, 'TextractCompletion');
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

      const response = await snsClient.send(command);

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

export { snsClient, TOPICS };
