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

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const RAW_BUCKET = process.env.S3_RAW_BUCKET || 'kyc-raw-documents';
const PROCESSED_BUCKET = process.env.S3_PROCESSED_BUCKET || 'kyc-processed-documents';
const PRESIGNED_URL_EXPIRY = parseInt(process.env.S3_PRESIGNED_URL_EXPIRY || '300');

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
      const { url, fields } = await createPresignedPost(s3Client, {
        Bucket: RAW_BUCKET,
        Key: key,
        Conditions: [
          ['content-length-range', 0, maxSize],
          ['starts-with', '$Content-Type', contentType.split('/')[0]],
        ],
        Fields: {
          'Content-Type': contentType,
        },
        Expires: PRESIGNED_URL_EXPIRY,
      });

      logger.debug('Generated presigned POST URL', { key, bucket: RAW_BUCKET });

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
    bucket: string = RAW_BUCKET
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const url = await getSignedUrl(s3Client, command, {
        expiresIn: PRESIGNED_URL_EXPIRY,
      });

      return url;
    } catch (error) {
      logger.error('Failed to generate presigned GET URL', { key, bucket, error });
      throw error;
    }
  },

  /**
   * Check if an object exists in S3
   */
  async objectExists(key: string, bucket: string = RAW_BUCKET): Promise<boolean> {
    try {
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      logger.error('Error checking object existence', { key, bucket, error });
      throw error;
    }
  },

  /**
   * Get object from S3
   */
  async getObject(key: string, bucket: string = RAW_BUCKET): Promise<Buffer> {
    try {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucket,
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
      logger.error('Failed to get object', { key, bucket, error });
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
    bucket: string = PROCESSED_BUCKET
  ): Promise<void> {
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ServerSideEncryption: 'aws:kms',
        })
      );

      logger.debug('Object uploaded', { key, bucket });
    } catch (error) {
      logger.error('Failed to put object', { key, bucket, error });
      throw error;
    }
  },

  /**
   * Delete object from S3
   */
  async deleteObject(key: string, bucket: string = RAW_BUCKET): Promise<void> {
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );

      logger.debug('Object deleted', { key, bucket });
    } catch (error) {
      logger.error('Failed to delete object', { key, bucket, error });
      throw error;
    }
  },

  /**
   * Copy object between buckets or keys
   */
  async copyObject(
    sourceKey: string,
    destinationKey: string,
    sourceBucket: string = RAW_BUCKET,
    destinationBucket: string = PROCESSED_BUCKET
  ): Promise<void> {
    try {
      const { CopyObjectCommand } = await import('@aws-sdk/client-s3');
      
      await s3Client.send(
        new CopyObjectCommand({
          Bucket: destinationBucket,
          Key: destinationKey,
          CopySource: `${sourceBucket}/${sourceKey}`,
          ServerSideEncryption: 'aws:kms',
        })
      );

      logger.debug('Object copied', {
        sourceKey,
        destinationKey,
        sourceBucket,
        destinationBucket,
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
    bucket: string = RAW_BUCKET
  ): Promise<{
    contentLength: number;
    contentType: string;
    lastModified: Date;
  }> {
    try {
      const response = await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );

      return {
        contentLength: response.ContentLength || 0,
        contentType: response.ContentType || 'application/octet-stream',
        lastModified: response.LastModified || new Date(),
      };
    } catch (error) {
      logger.error('Failed to get object metadata', { key, bucket, error });
      throw error;
    }
  },
};

export { s3Client };
