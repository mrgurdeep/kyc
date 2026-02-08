import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { validate } from '../middleware/validate';
import { authenticate, authorize } from '../middleware/auth';
import { prisma } from '../../services/database';
import { snsService } from '../../services/sns';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { decrypt } from '../../utils/encryption';
import { logger } from '../../utils/logger';

const router = Router();

// All review routes require reviewer or admin role
router.use(authenticate, authorize('reviewer', 'admin'));

// Query params schema
const queueQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  priority: z.coerce.number().int().min(1).max(5).optional(),
  documentType: z.string().optional(),
  assignedToMe: z.coerce.boolean().optional(),
});

// Review action schema
const reviewActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * @route GET /api/v1/review/queue
 * @desc Get review queue with pagination
 */
router.get('/queue', async (req, res, next) => {
  try {
    const userId = req.user!.userId;
    const { page, limit, priority, documentType, assignedToMe } =
      queueQuerySchema.parse(req.query);
    const skip = (page - 1) * limit;

    const where: any = {
      ...(assignedToMe
        ? { assignedTo: userId }
        : { OR: [{ assignedTo: null }, { assignedTo: userId }] }),
      ...(priority && { priority }),
      submission: {
        status: 'review',
        ...(documentType && { documentType }),
      },
    };

    const [queueItems, total] = await Promise.all([
      prisma.reviewQueue.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { queuedAt: 'asc' }],
        skip,
        take: limit,
        include: {
          submission: {
            select: {
              id: true,
              documentType: true,
              status: true,
              createdAt: true,
              uploadedAt: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.reviewQueue.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        items: queueItems,
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
 * @route POST /api/v1/review/claim/:queueId
 * @desc Claim a review item
 */
router.post('/claim/:queueId', async (req, res, next) => {
  try {
    const { queueId } = req.params;
    const userId = req.user!.userId;

    const queueItem = await prisma.reviewQueue.findUnique({
      where: { id: queueId },
    });

    if (!queueItem) {
      throw new NotFoundError('Review item');
    }

    if (queueItem.assignedTo && queueItem.assignedTo !== userId) {
      throw new ValidationError('This item is already assigned to another reviewer');
    }

    // Claim the item
    const updated = await prisma.reviewQueue.update({
      where: { id: queueId },
      data: {
        assignedTo: userId,
        claimedAt: new Date(),
      },
      include: {
        submission: {
          include: {
            extractedData: true,
          },
        },
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        submissionId: updated.submissionId,
        actorId: userId,
        action: 'review_claimed',
        details: { queueId },
      },
    });

    logger.info('Review item claimed', {
      queueId,
      submissionId: updated.submissionId,
      reviewerId: userId,
    });

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/review/release/:queueId
 * @desc Release a claimed review item
 */
router.post('/release/:queueId', async (req, res, next) => {
  try {
    const { queueId } = req.params;
    const userId = req.user!.userId;

    const queueItem = await prisma.reviewQueue.findUnique({
      where: { id: queueId },
    });

    if (!queueItem) {
      throw new NotFoundError('Review item');
    }

    if (queueItem.assignedTo !== userId) {
      throw new ValidationError('You can only release items assigned to you');
    }

    // Release the item
    await prisma.reviewQueue.update({
      where: { id: queueId },
      data: {
        assignedTo: null,
        claimedAt: null,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        id: uuidv4(),
        submissionId: queueItem.submissionId,
        actorId: userId,
        action: 'review_released',
        details: { queueId },
      },
    });

    logger.info('Review item released', {
      queueId,
      submissionId: queueItem.submissionId,
      reviewerId: userId,
    });

    res.status(200).json({
      success: true,
      message: 'Review item released',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/review/:queueId
 * @desc Get review item details
 */
router.get('/:queueId', async (req, res, next) => {
  try {
    const { queueId } = req.params;

    const queueItem = await prisma.reviewQueue.findUnique({
      where: { id: queueId },
      include: {
        submission: {
          include: {
            extractedData: true,
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            auditLogs: {
              orderBy: { createdAt: 'desc' },
              take: 20,
            },
          },
        },
      },
    });

    if (!queueItem) {
      throw new NotFoundError('Review item');
    }

    // Decrypt extracted data
    const extractedData = queueItem.submission.extractedData.map((data) => ({
      id: data.id,
      fieldName: data.fieldName,
      value: decrypt(data.encryptedValue),
      confidenceScore: data.confidenceScore,
    }));

    res.status(200).json({
      success: true,
      data: {
        ...queueItem,
        submission: {
          ...queueItem.submission,
          extractedData,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/review/:queueId/decision
 * @desc Submit review decision (approve/reject)
 */
router.post(
  '/:queueId/decision',
  validate(reviewActionSchema),
  async (req, res, next) => {
    try {
      const { queueId } = req.params;
      const { action, reason, notes } = req.body;
      const userId = req.user!.userId;

      const queueItem = await prisma.reviewQueue.findUnique({
        where: { id: queueId },
        include: {
          submission: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!queueItem) {
        throw new NotFoundError('Review item');
      }

      if (queueItem.assignedTo !== userId) {
        throw new ValidationError('You must claim this item before reviewing');
      }

      if (action === 'reject' && !reason) {
        throw new ValidationError('Rejection reason is required');
      }

      const newStatus = action === 'approve' ? 'approved' : 'rejected';

      // Update submission status
      await prisma.$transaction([
        prisma.kycSubmission.update({
          where: { id: queueItem.submissionId },
          data: {
            status: newStatus,
            reviewedAt: new Date(),
            reviewedBy: userId,
            rejectionReason: action === 'reject' ? reason : null,
          },
        }),
        // Remove from review queue
        prisma.reviewQueue.delete({
          where: { id: queueId },
        }),
        // Create audit log
        prisma.auditLog.create({
          data: {
            id: uuidv4(),
            submissionId: queueItem.submissionId,
            actorId: userId,
            action: `review_${action}`,
            details: {
              reason,
              notes,
              queueId,
            },
          },
        }),
      ]);

      // Publish status update notification
      await snsService.publishStatusUpdate({
        submissionId: queueItem.submissionId,
        userId: queueItem.submission.userId,
        status: newStatus,
        timestamp: new Date().toISOString(),
        ...(action === 'reject' && { reason }),
      });

      logger.info('Review decision submitted', {
        queueId,
        submissionId: queueItem.submissionId,
        action,
        reviewerId: userId,
      });

      res.status(200).json({
        success: true,
        data: {
          submissionId: queueItem.submissionId,
          status: newStatus,
          reviewedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route GET /api/v1/review/stats/summary
 * @desc Get reviewer statistics
 */
router.get('/stats/summary', async (req, res, next) => {
  try {
    const userId = req.user!.userId;

    const [pendingCount, myClaimedCount, todayReviewed, totalReviewed] =
      await Promise.all([
        prisma.reviewQueue.count({
          where: { assignedTo: null },
        }),
        prisma.reviewQueue.count({
          where: { assignedTo: userId },
        }),
        prisma.kycSubmission.count({
          where: {
            reviewedBy: userId,
            reviewedAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        }),
        prisma.kycSubmission.count({
          where: { reviewedBy: userId },
        }),
      ]);

    res.status(200).json({
      success: true,
      data: {
        pendingReviews: pendingCount,
        myClaimedReviews: myClaimedCount,
        reviewedToday: todayReviewed,
        totalReviewed,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
