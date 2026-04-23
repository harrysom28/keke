import Message from '../models/Message.js';
import Ride from '../models/Ride.js';
import User from '../models/User.js';
import Driver from '../models/Driver.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { getSocketService } from '../services/socketService.js';

/**
 * Get chat messages - GET /api/message/passenger/driver/:rideId
 */
export const getChatMessages = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const skip = (page - 1) * limit;

  const ride = await Ride.findById(rideId)
    .populate('rider')
    .populate({
      path: 'driver',
      populate: {
        path: 'user',
        select: 'name phone profileImage'
      }
    });

  if (!ride) {
    throw new NotFoundError('Ride');
  }

  // Check if user is part of this ride
  const isRider = ride.rider._id.toString() === userId.toString();
  const isDriver = ride.driver?.user?._id?.toString() === userId.toString();

  if (!isRider && !isDriver) {
    throw new ValidationError('You are not authorized to view messages for this ride');
  }

  // Get messages for this ride
  const messages = await Message.find({ ride: rideId })
    .populate('sender', 'name phone profileImage')
    .populate('receiver', 'name phone profileImage')
    .sort({ createdAt: -1 }) // Most recent first
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Message.countDocuments({ ride: rideId });
  const unreadCount = await Message.getUnreadCount(userId, rideId);

  // Mark messages as read when fetching
  if (messages.length > 0) {
    await Message.markAllAsRead(userId, rideId);
  }

  // Reverse to show oldest first (for chat UI)
  const reversedMessages = messages.reverse();

  res.json({
    status: 'success',
    data: {
      messages: reversedMessages.map((message) => formatMessageResponse(message, userId)),
      unread_count: unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * Send message - POST /api/message/passenger/driver/create
 */
export const sendMessage = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId, message, messageType, attachments } = req.body;

  const withTimeout = async (promise, ms, label) => {
    let t;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
        }),
      ]);
    } finally {
      if (t) clearTimeout(t);
    }
  };

  if (!rideId) {
    throw new ValidationError('Ride ID is required');
  }

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    throw new ValidationError('Message cannot be empty');
  }

  if (message.length > 1000) {
    throw new ValidationError('Message cannot exceed 1000 characters');
  }

  const ride = await Ride.findById(rideId)
    .populate('rider')
    .populate({
      path: 'driver',
      populate: {
        path: 'user',
        select: 'name phone profileImage'
      }
    });

  if (!ride) {
    throw new NotFoundError('Ride');
  }

  // Debug logging
  logger.info(`Message send attempt for ride ${rideId}: status=${ride.status}, driver=${ride.driver}, driver.user=${ride.driver?.user?._id}`);

  // Check if user is part of this ride
  const isRider = ride.rider._id.toString() === userId.toString();
  const isDriver = ride.driver?.user?._id?.toString() === userId.toString();

  if (!isRider && !isDriver) {
    throw new ValidationError('You are not authorized to send messages for this ride');
  }

  // Determine receiver
  let receiverId;
  if (isRider) {
    // Rider can only send to driver if driver is assigned
    if (!ride.driver || !ride.driver.user) {
      logger.error(`Rider ${userId} trying to send message but no driver assigned to ride ${rideId} (status: ${ride.status})`);
      throw new ValidationError('Cannot send message: No driver assigned to this ride yet');
    }
    receiverId = ride.driver.user._id;
    logger.info(`Rider ${userId} sending to driver: ${receiverId}`);
  } else {
    receiverId = ride.rider._id;
    logger.info(`Driver ${userId} sending to rider: ${receiverId}`);
  }

  if (!receiverId) {
    const errorMsg = `No receiver found for ride ${rideId}`;
    logger.error(errorMsg);
    throw new ValidationError('No receiver found for this ride');
  }

  // Create message
  const messageData = {
    ride: rideId,
    sender: userId,
    receiver: receiverId,
    message: message.trim(),
    messageType: messageType || 'text',
    isRead: false,
  };

  if (attachments && Array.isArray(attachments)) {
    messageData.attachments = attachments.map((att) => ({
      url: att.url,
      type: att.type,
      name: att.name,
      size: att.size || 0,
      uploadedAt: new Date(),
    }));
  }

  const newMessage = await Message.create(messageData);
  await newMessage.populate('sender', 'name phone profileImage');
  await newMessage.populate('receiver', 'name phone profileImage');

  // Send real-time notification via Socket.io
  const socketService = getSocketService();
  if (socketService) {
    // Emit to receiver
    socketService.io.to(`user:${receiverId.toString()}`).emit('new-message', {
      message: formatMessageResponse(newMessage, userId),
      ride_id: rideId,
    });

    // Emit to ride-specific room
    socketService.io.to(`ride:${rideId}`).emit('new-message', {
      message: formatMessageResponse(newMessage, userId),
      ride_id: rideId,
    });
  }

  logger.info(`Message sent for ride ${rideId} from user ${userId} to user ${receiverId}`);

  res.status(201).json({
    status: 'success',
    message: 'Message sent successfully',
    data: {
      message: formatMessageResponse(newMessage, userId),
    },
  });

  // Fire-and-forget: these should never block the API response (Railway can be slow / cold).
  // If they hang, it causes client timeouts and "Message not sent" even though it saved.
  setImmediate(async () => {
    try {
      const { getPusherService } = await import('../services/pusherService.js');
      const ps = getPusherService();
      if (ps?.pusher) {
        await withTimeout(
          ps.pusher.trigger(`private.ride.${rideId}`, 'new-message', {
            message: formatMessageResponse(newMessage, receiverId.toString()),
            ride_id: rideId.toString(),
          }),
          2500,
          'pusher.trigger(new-message)'
        );
      }
    } catch (err) {
      logger.warn(`Pusher new-message failed: ${err.message}`);
    }

    const preview =
      message.trim().length > 90 ? `${message.trim().slice(0, 87)}…` : message.trim();
    const senderFirst = newMessage.sender?.name?.trim?.()?.split(/\s+/)?.[0] || 'Your contact';
    try {
      const { sendToUser } = await import('../services/notificationService.js');
      const receiverRole = isRider ? 'driver' : 'rider';
      await withTimeout(
        sendToUser(receiverId, receiverRole, {
          title: `Message from ${senderFirst}`,
          message: preview,
          type: 'alert',
          priority: 'high',
          screen: 'RideChat',
          ride_id: rideId,
          action_type: 'navigate',
          action_payload: { screen: 'RideChat', rideId: rideId.toString() },
          event_key: 'chat_message',
          data: { subType: 'chat_message', rideId: rideId.toString() },
        }),
        3500,
        'notification.sendToUser(chat_message)'
      );
    } catch (err) {
      logger.error(`Chat push notification failed: ${err.message}`);
    }
  });
});

/**
 * Format message response
 */
const formatMessageResponse = (message, currentUserId) => {
  const isSender = message.sender._id.toString() === currentUserId.toString();

  return {
    message_id: message._id.toString(),
    ride_id: message.ride._id?.toString() || message.ride.toString(),
    sender: {
      user_id: message.sender._id.toString(),
      name: message.sender.name,
      phone: message.sender.phone,
      image: message.sender.profileImage,
    },
    receiver: {
      user_id: message.receiver._id.toString(),
      name: message.receiver.name,
      phone: message.receiver.phone,
      image: message.receiver.profileImage,
    },
    message: message.message,
    message_type: message.messageType,
    is_sender: isSender,
    is_read: message.isRead,
    read_at: message.readAt,
    attachments: message.attachments || [],
    created_at: message.createdAt,
  };
};
