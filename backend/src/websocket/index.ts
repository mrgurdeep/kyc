import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { verifyToken, JWTPayload } from '../api/middleware/auth';
import { sessionStore } from '../services/redis';
import { logger } from '../utils/logger';

interface AuthenticatedWebSocket extends WebSocket {
  id: string;
  user?: JWTPayload;
  isAlive: boolean;
}

interface WebSocketMessage {
  type: string;
  payload?: unknown;
}

const clients = new Map<string, AuthenticatedWebSocket>();

export function setupWebSocket(wss: WebSocketServer): void {
  // Heartbeat interval
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = ws as AuthenticatedWebSocket;
      if (!client.isAlive) {
        logger.debug('Terminating inactive WebSocket', { id: client.id });
        return client.terminate();
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', (ws: WebSocket, req) => {
    const client = ws as AuthenticatedWebSocket;
    client.id = uuidv4();
    client.isAlive = true;

    logger.info('WebSocket connection established', { id: client.id });

    // Handle pong for heartbeat
    client.on('pong', () => {
      client.isAlive = true;
    });

    // Handle incoming messages
    client.on('message', async (data) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'authenticate':
            await handleAuthentication(client, message.payload as { token: string });
            break;

          case 'ping':
            sendMessage(client, { type: 'pong', payload: { timestamp: Date.now() } });
            break;

          case 'subscribe':
            handleSubscribe(client, message.payload as { channel: string });
            break;

          case 'unsubscribe':
            handleUnsubscribe(client, message.payload as { channel: string });
            break;

          default:
            logger.warn('Unknown WebSocket message type', {
              id: client.id,
              type: message.type,
            });
        }
      } catch (error) {
        logger.error('Error processing WebSocket message', {
          id: client.id,
          error,
        });
        sendMessage(client, {
          type: 'error',
          payload: { message: 'Invalid message format' },
        });
      }
    });

    // Handle close
    client.on('close', async () => {
      logger.info('WebSocket connection closed', {
        id: client.id,
        userId: client.user?.userId,
      });

      clients.delete(client.id);

      if (client.user) {
        await sessionStore.removeConnection(client.id);
      }
    });

    // Handle errors
    client.on('error', (error) => {
      logger.error('WebSocket error', { id: client.id, error });
    });

    // Send connection acknowledgment
    sendMessage(client, {
      type: 'connected',
      payload: { connectionId: client.id },
    });
  });
}

async function handleAuthentication(
  client: AuthenticatedWebSocket,
  payload: { token: string }
): Promise<void> {
  try {
    if (!payload?.token) {
      sendMessage(client, {
        type: 'auth_error',
        payload: { message: 'Token required' },
      });
      return;
    }

    const decoded = verifyToken(payload.token);
    client.user = decoded;

    // Store connection in Redis
    await sessionStore.setUserConnection(decoded.userId, client.id);
    clients.set(client.id, client);

    logger.info('WebSocket authenticated', {
      id: client.id,
      userId: decoded.userId,
    });

    sendMessage(client, {
      type: 'authenticated',
      payload: {
        userId: decoded.userId,
        email: decoded.email,
      },
    });
  } catch (error) {
    logger.error('WebSocket authentication failed', {
      id: client.id,
      error,
    });
    sendMessage(client, {
      type: 'auth_error',
      payload: { message: 'Invalid token' },
    });
  }
}

function handleSubscribe(
  client: AuthenticatedWebSocket,
  payload: { channel: string }
): void {
  if (!client.user) {
    sendMessage(client, {
      type: 'error',
      payload: { message: 'Authentication required' },
    });
    return;
  }

  // For now, just acknowledge subscription
  // In production, you'd track subscriptions in Redis
  logger.debug('WebSocket subscribed to channel', {
    id: client.id,
    channel: payload.channel,
  });

  sendMessage(client, {
    type: 'subscribed',
    payload: { channel: payload.channel },
  });
}

function handleUnsubscribe(
  client: AuthenticatedWebSocket,
  payload: { channel: string }
): void {
  logger.debug('WebSocket unsubscribed from channel', {
    id: client.id,
    channel: payload.channel,
  });

  sendMessage(client, {
    type: 'unsubscribed',
    payload: { channel: payload.channel },
  });
}

function sendMessage(client: WebSocket, message: WebSocketMessage): void {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
}

/**
 * Broadcast message to a specific user
 */
export async function sendToUser(
  userId: string,
  message: WebSocketMessage
): Promise<boolean> {
  const connectionId = await sessionStore.getUserConnection(userId);

  if (!connectionId) {
    logger.debug('No WebSocket connection for user', { userId });
    return false;
  }

  const client = clients.get(connectionId);

  if (!client || client.readyState !== WebSocket.OPEN) {
    logger.debug('WebSocket client not found or closed', { userId, connectionId });
    return false;
  }

  sendMessage(client, message);
  return true;
}

/**
 * Broadcast message to all authenticated clients
 */
export function broadcastToAll(message: WebSocketMessage): void {
  clients.forEach((client) => {
    if (client.user && client.readyState === WebSocket.OPEN) {
      sendMessage(client, message);
    }
  });
}

/**
 * Broadcast KYC status update to user
 */
export async function broadcastKycStatusUpdate(
  userId: string,
  submissionId: string,
  status: string,
  details?: object
): Promise<void> {
  await sendToUser(userId, {
    type: 'kyc_status_update',
    payload: {
      submissionId,
      status,
      timestamp: new Date().toISOString(),
      ...details,
    },
  });
}

export { clients };
