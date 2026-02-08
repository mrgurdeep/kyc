import { Router, Request, Response } from 'express';
import { prisma } from '../../services/database';
import { redis } from '../../services/redis';
import { logger } from '../../utils/logger';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: { status: string; latency?: number };
    redis: { status: string; latency?: number };
  };
}

/**
 * @route GET /api/v1/health
 * @desc Basic health check
 */
router.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

/**
 * @route GET /api/v1/health/detailed
 * @desc Detailed health check with dependency status
 */
router.get('/detailed', async (req: Request, res: Response) => {
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    checks: {
      database: { status: 'unknown' },
      redis: { status: 'unknown' },
    },
  };

  // Check database
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database = {
      status: 'healthy',
      latency: Date.now() - dbStart,
    };
  } catch (error) {
    logger.error('Database health check failed', { error });
    health.checks.database = { status: 'unhealthy' };
    health.status = 'degraded';
  }

  // Check Redis
  try {
    const redisStart = Date.now();
    await redis.ping();
    health.checks.redis = {
      status: 'healthy',
      latency: Date.now() - redisStart,
    };
  } catch (error) {
    logger.error('Redis health check failed', { error });
    health.checks.redis = { status: 'unhealthy' };
    health.status = 'degraded';
  }

  // If all checks failed, mark as unhealthy
  if (
    health.checks.database.status === 'unhealthy' &&
    health.checks.redis.status === 'unhealthy'
  ) {
    health.status = 'unhealthy';
  }

  const statusCode = health.status === 'unhealthy' ? 503 : 200;
  res.status(statusCode).json(health);
});

/**
 * @route GET /api/v1/health/ready
 * @desc Readiness probe for Kubernetes/ECS
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Check critical dependencies
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    
    res.status(200).json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false });
  }
});

/**
 * @route GET /api/v1/health/live
 * @desc Liveness probe for Kubernetes/ECS
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ alive: true });
});

export default router;
