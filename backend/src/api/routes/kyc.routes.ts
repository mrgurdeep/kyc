import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authenticate, authorize } from '../middleware/auth';
import { prisma } from '../../services/database';
import { NotFoundError } from '../../utils/errors';
import { decrypt, maskData } from '../../utils/encryption';
import { logger } from '../../utils/logger';

const router = Router();

// Query params schema
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.enum(['pending', 'processing', 'review', 'approved', 'rejected']).optional(),
});

/**
 * @route GET /api/v1/kyc/submissions
 * @desc Get all KYC submissions for the current user
 */
router.get('/submissions', authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { page, limit, status } = listQuerySchema.parse(req.query);
    const skip = (page - 1) * limit;

    const where = {
      userId,
      ...(status && { status }),
    };

    const [submissions, total] = await Promise.all([
      prisma.kycSubmission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
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
      }),
      prisma.kycSubmission.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        submissions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/kyc/submissions/:id
 * @desc Get a specific KYC submission with extracted data
 */
router.get('/submissions/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'reviewer';

    const submission = await prisma.kycSubmission.findFirst({
      where: {
        id,
        ...(isAdmin ? {} : { userId }),
      },
      include: {
        extractedData: {
          select: {
            id: true,
            fieldName: true,
            encryptedValue: true,
            confidenceScore: true,
            createdAt: true,
          },
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            action: true,
            details: true,
            createdAt: true,
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundError('KYC Submission');
    }

    // Decrypt and mask extracted data for non-admin users
    const extractedData = submission.extractedData.map((data) => {
      const decryptedValue = decrypt(data.encryptedValue);
      return {
        id: data.id,
        fieldName: data.fieldName,
        value: isAdmin ? decryptedValue : maskData(decryptedValue),
        confidenceScore: data.confidenceScore,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        ...submission,
        extractedData,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/kyc/status
 * @desc Get overall KYC status for the current user
 */
router.get('/status', authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.userId;

    // Get latest submission for each document type
    const submissions = await prisma.kycSubmission.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        documentType: true,
        createdAt: true,
        reviewedAt: true,
      },
    });

    // Group by document type (latest only)
    const byDocumentType = submissions.reduce((acc, sub) => {
      if (!acc[sub.documentType]) {
        acc[sub.documentType] = sub;
      }
      return acc;
    }, {} as Record<string, typeof submissions[0]>);

    // Calculate overall status
    const statuses = Object.values(byDocumentType).map((s) => s.status);
    let overallStatus: string;

    if (statuses.some((s) => s === 'rejected')) {
      overallStatus = 'requires_resubmission';
    } else if (statuses.every((s) => s === 'approved')) {
      overallStatus = 'completed';
    } else if (statuses.some((s) => s === 'review')) {
      overallStatus = 'in_review';
    } else if (statuses.some((s) => s === 'processing')) {
      overallStatus = 'processing';
    } else {
      overallStatus = 'pending';
    }

    res.status(200).json({
      success: true,
      data: {
        overallStatus,
        documents: byDocumentType,
        requiredDocuments: ['passport', 'national_id'],
        completedDocuments: Object.values(byDocumentType)
          .filter((s) => s.status === 'approved')
          .map((s) => s.documentType),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/kyc/analytics
 * @desc Get KYC analytics (admin only)
 */
router.get(
  '/analytics',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get counts by status
      const statusCounts = await prisma.kycSubmission.groupBy({
        by: ['status'],
        _count: { id: true },
      });

      // Get counts for last 30 days
      const recentSubmissions = await prisma.kycSubmission.count({
        where: {
          createdAt: { gte: thirtyDaysAgo },
        },
      });

      // Get approval rate
      const approvedCount = await prisma.kycSubmission.count({
        where: {
          status: 'approved',
          reviewedAt: { gte: thirtyDaysAgo },
        },
      });

      const reviewedCount = await prisma.kycSubmission.count({
        where: {
          status: { in: ['approved', 'rejected'] },
          reviewedAt: { gte: thirtyDaysAgo },
        },
      });

      // Average processing time
      const avgProcessingTime = await prisma.$queryRaw<
        { avg_hours: number }[]
      >`
        SELECT AVG(EXTRACT(EPOCH FROM (processed_at - uploaded_at)) / 3600) as avg_hours
        FROM kyc_submissions
        WHERE processed_at IS NOT NULL
          AND uploaded_at IS NOT NULL
          AND processed_at > ${thirtyDaysAgo}
      `;

      res.status(200).json({
        success: true,
        data: {
          statusDistribution: statusCounts.reduce(
            (acc, { status, _count }) => {
              acc[status] = _count.id;
              return acc;
            },
            {} as Record<string, number>
          ),
          last30Days: {
            submissions: recentSubmissions,
            approved: approvedCount,
            approvalRate:
              reviewedCount > 0
                ? Math.round((approvedCount / reviewedCount) * 100)
                : 0,
            avgProcessingTimeHours: avgProcessingTime[0]?.avg_hours || 0,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
