import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: [true, 'Ride is required'],
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender is required'],
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Receiver is required'],
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'location', 'system'],
      default: 'text',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    attachments: [
      {
        url: String,
        type: String,
        name: String,
        size: Number,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
messageSchema.index({ ride: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, createdAt: -1 });
messageSchema.index({ isRead: 1 });
messageSchema.index({ createdAt: -1 });

// Virtual for message ID
messageSchema.virtual('message_id').get(function () {
  return this._id.toString();
});

// Method to mark as read
messageSchema.methods.markAsRead = async function () {
  this.isRead = true;
  this.readAt = new Date();
  await this.save();
};

// Static method to get unread count
messageSchema.statics.getUnreadCount = async function (userId, rideId) {
  return this.countDocuments({
    ride: rideId,
    receiver: userId,
    isRead: false,
  });
};

// Static method to mark all messages as read
messageSchema.statics.markAllAsRead = async function (userId, rideId) {
  return this.updateMany(
    { ride: rideId, receiver: userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );
};

const Message = mongoose.model('Message', messageSchema);

export default Message;
