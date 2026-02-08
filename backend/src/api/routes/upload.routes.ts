import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { s3Service } from '../../services/s3';
import { prisma } from '../../services/database';
import { sqsService } from '../../services/sqs';
import { ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';

const router = Router();

// Allowed document types
const ALLOWED_DOCUMENT_TYPES = [
  'passport',
  'national_id',
  'drivers_license',
  'utility_bill',
  'bank_statement',
] as const;

// Allowed file types
const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/pdf',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Validation schemas
const presignedUrlSchema = z.object({
  documentType: z.enum(ALLOWED_DOCUMENT_TYPES, {
    errorMap: () => ({ message: `Document type must be one of: ${ALLOWED_DOCUMENT_TYPES.join(', ')}` }),
  }),
  fileName: z.string().min(1, 'File name is required'),
  fileType: z.string().refine(
    (type) => ALLOWED_MIME_TYPES.includes(type),
    { message: `File type must be one of: ${ALLOWED_MIME_TYPES.join(', ')}` }
  ),
  fileSize: z.number()
    .int()
    .positive()
    .max(MAX_FILE_SIZE, `File size must not exceed ${MAX_FILE_SIZE / 1024 / 1024}MB`),
});

const confirmUploadSchema = z.object({
  submissionId: z.string().uuid('Invalid submission ID'),
});

/**
 * @route POST /api/v1/upload/presigned-url
 * @desc Generate a presigned URL for direct S3 upload
 */
router.post(
  '/presigned-url',
  authenticate,
  validate(presignedUrlSchema),
  async (req, res, next) => {
    try {
      const { documentType, fileName, fileType, fileSize } = req.body;
      const userId = req.user!.userId;

      // Generate unique submission ID
      const submissionId = uuidv4();

      // Construct S3 key
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
      const s3Key = `raw/${year}/${month}/${submissionId}/${documentType}.${fileExtension}`;

      // Generate presigned URL
      const { uploadUrl, fields } = await s3Service.generatePresignedPost(
        s3Key,
        fileType,
        fileSize
      );

      // Create KYC submission record
      await prisma.kycSubmission.create({
        data: {
          id: submissionId,
          userId,
          status: 'pending_upload',
          documentType,
          s3Key,
          fileName,
          fileType,
          fileSize,
        },
      });

      logger.info('Presigned URL generated', {
        submissionId,
        userId,
        documentType,
        s3Key,
      });

      res.status(200).json({
        success: true,
        data: {
          submissionId,
          uploadUrl,
          fields,
          expiresIn: parseInt(process.env.S3_PRESIGNED_URL_EXPIRY || '300'),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route POST /api/v1/upload/confirm
 * @desc Confirm upload completion and trigger processing
 */
router.post(
  '/confirm',
  authenticate,
  validate(confirmUploadSchema),
  async (req, res, next) => {
    try {
      const { submissionId } = req.body;
      const userId = req.user!.userId;

      // Find submission
      const submission = await prisma.kycSubmission.findFirst({
        where: {
          id: submissionId,
          userId,
          status: 'pending_upload',
        },
      });

      if (!submission) {
        throw new ValidationError('Submission not found or already processed');
      }

      // Verify file exists in S3
      const fileExists = await s3Service.objectExists(submission.s3Key);
      if (!fileExists) {
        throw new ValidationError('File not found in storage. Please upload again.');
      }

      // Update status
      await prisma.kycSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'pending',
          uploadedAt: new Date(),
        },
      });

      // Send message to SQS for processing
      await sqsService.sendToIngestionQueue({
        submissionId,
        userId,
        documentType: submission.documentType,
        s3Key: submission.s3Key,
        timestamp: new Date().toISOString(),
      });

      logger.info('Upload confirmed and queued for processing', {
        submissionId,
        userId,
      });

      res.status(200).json({
        success: true,
        data: {
          submissionId,
          status: 'pending',
          message: 'Document uploaded successfully. Processing will begin shortly.',
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/upload/status/:submissionId
 * @desc Get upload/processing status
 */
router.get('/status/:submissionId', authenticate, async (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const userId = req.user!.userId;

    const submission = await prisma.kycSubmission.findFirst({
      where: {
        id: submissionId,
        userId,
      },
      select: {
        id: true,
        status: true,
        documentType: true,
        createdAt: true,
        uploadedAt: true,
        processedAt: true,
        reviewedAt: true,
        rejectionReason: true,
      },
    });

    if (!submission) {
      throw new ValidationError('Submission not found');
    }

    res.status(200).json({
      success: true,
      data: submission,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
