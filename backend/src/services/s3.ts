import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { logger } from '../utils/logger';

// Lazy initialization to ensure environment variables are loaded
let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    const isLocalStack = process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT;
    const localStackEndpoint = process.env.AWS_ENDPOINT_URL || process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';

    _s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      ...(isLocalStack && {
        endpoint: localStackEndpoint,
        forcePathStyle: true, // Required for LocalStack
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
        },
      }),
    });

    logger.info('S3 client initialized', { 
      isLocalStack: !!isLocalStack, 
      endpoint: isLocalStack ? localStackEndpoint : 'AWS' 
    });
  }
  return _s3Client;
}

// Lazy getters for config
function getRawBucket() {
  return process.env.S3_RAW_BUCKET || 'kyc-raw-documents';
}

function getProcessedBucket() {
  return process.env.S3_PROCESSED_BUCKET || 'kyc-processed-documents';
}

function getPresignedUrlExpiry() {
  return parseInt(process.env.S3_PRESIGNED_URL_EXPIRY || '300');
}

export const s3Service = {
  /**
   * Generate a presigned POST URL for direct client uploads
   */
  async generatePresignedPost(
    key: string,
    contentType: string,
    maxSize: number
  ): Promise<{ uploadUrl: string; fields: Record<string, string> }> {
    try {
      const { url, fields } = await createPresignedPost(getS3Client(), {
        Bucket: getRawBucket(),
        Key: key,
        Conditions: [
          ['content-length-range', 0, maxSize],
          ['starts-with', '$Content-Type', contentType.split('/')[0]],
        ],
        Fields: {
          'Content-Type': contentType,
        },
        Expires: getPresignedUrlExpiry(),
      });

      logger.debug('Generated presigned POST URL', { key, bucket: getRawBucket() });

      return { uploadUrl: url, fields };
    } catch (error) {
      logger.error('Failed to generate presigned POST URL', { key, error });
      throw error;
    }
  },

  /**
   * Generate a presigned GET URL for downloading files
   */
  async generatePresignedGetUrl(
    key: string,
    bucket?: string
  ): Promise<string> {
    const targetBucket = bucket || getRawBucket();
    try {
      const command = new GetObjectCommand({
        Bucket: targetBucket,
        Key: key,
      });

      const url = await getSignedUrl(getS3Client(), command, {
        expiresIn: getPresignedUrlExpiry(),
      });

      return url;
    } catch (error) {
      logger.error('Failed to generate presigned GET URL', { key, bucket: targetBucket, error });
      throw error;
    }
  },

  /**
   * Check if an object exists in S3
   */
  async objectExists(key: string, bucket?: string): Promise<boolean> {
    const targetBucket = bucket || getRawBucket();
    try {
      await getS3Client().send(
        new HeadObjectCommand({
          Bucket: targetBucket,
          Key: key,
        })
      );
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      logger.error('Error checking object existence', { key, bucket: targetBucket, error });
      throw error;
    }
  },

  /**
   * Get object from S3
   */
  async getObject(key: string, bucket?: string): Promise<Buffer> {
    const targetBucket = bucket || getRawBucket();
    try {
      const response = await getS3Client().send(
        new GetObjectCommand({
          Bucket: targetBucket,
          Key: key,
        })
      );

      const stream = response.Body as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (error) {
      logger.error('Failed to get object', { key, bucket: targetBucket, error });
      throw error;
    }
  },

  /**
   * Put object to S3
   */
  async putObject(
    key: string,
    body: Buffer | string,
    contentType: string,
    bucket?: string
  ): Promise<void> {
    const targetBucket = bucket || getProcessedBucket();
    try {
      await getS3Client().send(
        new PutObjectCommand({
          Bucket: targetBucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ServerSideEncryption: 'aws:kms',
        })
      );

      logger.debug('Object uploaded', { key, bucket: targetBucket });
    } catch (error) {
      logger.error('Failed to put object', { key, bucket: targetBucket, error });
      throw error;
    }
  },

  /**
   * Delete object from S3
   */
  async deleteObject(key: string, bucket?: string): Promise<void> {
    const targetBucket = bucket || getRawBucket();
    try {
      await getS3Client().send(
        new DeleteObjectCommand({
          Bucket: targetBucket,
          Key: key,
        })
      );

      logger.debug('Object deleted', { key, bucket: targetBucket });
    } catch (error) {
      logger.error('Failed to delete object', { key, bucket: targetBucket, error });
      throw error;
    }
  },

  /**
   * Copy object between buckets or keys
   */
  async copyObject(
    sourceKey: string,
    destinationKey: string,
    sourceBucket?: string,
    destinationBucket?: string
  ): Promise<void> {
    const srcBucket = sourceBucket || getRawBucket();
    const destBucket = destinationBucket || getProcessedBucket();
    try {
      const { CopyObjectCommand } = await import('@aws-sdk/client-s3');
      
      await getS3Client().send(
        new CopyObjectCommand({
          Bucket: destBucket,
          Key: destinationKey,
          CopySource: `${srcBucket}/${sourceKey}`,
          ServerSideEncryption: 'aws:kms',
        })
      );

      logger.debug('Object copied', {
        sourceKey,
        destinationKey,
        sourceBucket: srcBucket,
        destinationBucket: destBucket,
      });
    } catch (error) {
      logger.error('Failed to copy object', { sourceKey, destinationKey, error });
      throw error;
    }
  },

  /**
   * Get object metadata
   */
  async getObjectMetadata(
    key: string,
    bucket?: string
  ): Promise<{
    contentLength: number;
    contentType: string;
    lastModified: Date;
  }> {
    const targetBucket = bucket || getRawBucket();
    try {
      const response = await getS3Client().send(
        new HeadObjectCommand({
          Bucket: targetBucket,
          Key: key,
        })
      );

      return {
        contentLength: response.ContentLength || 0,
        contentType: response.ContentType || 'application/octet-stream',
        lastModified: response.LastModified || new Date(),
      };
    } catch (error) {
      logger.error('Failed to get object metadata', { key, bucket: targetBucket, error });
      throw error;
    }
  },
};

// Export the lazy client getter for direct use if needed
export { getS3Client as s3Client };
