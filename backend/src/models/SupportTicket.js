import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
    },
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      default: null,
    },
    category: {
      type: String,
      enum: [
        'ride_issue',
        'payment_issue',
        'account_issue',
        'driver_complaint',
        'rider_complaint',
        'technical_issue',
        'general',
        'refund_request',
        'other',
      ],
      required: [true, 'Category is required'],
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null, // Admin user
    },
    responses: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        message: {
          type: String,
          required: true,
        },
        attachments: [
          {
            url: String,
            type: String,
            name: String,
          },
        ],
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    attachments: [
      {
        url: String,
        type: String,
        name: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    resolvedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    resolutionNote: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
supportTicketSchema.index({ user: 1, createdAt: -1 });
supportTicketSchema.index({ ride: 1 });
supportTicketSchema.index({ status: 1 });
supportTicketSchema.index({ priority: 1 });
supportTicketSchema.index({ assignedTo: 1 });
supportTicketSchema.index({ category: 1 });
supportTicketSchema.index({ createdAt: -1 });

// Virtual for ticket ID
supportTicketSchema.virtual('ticket_id').get(function () {
  return this._id.toString();
});

// Method to add response
supportTicketSchema.methods.addResponse = async function (user, message, attachments = []) {
  this.responses.push({
    user: user._id,
    message,
    attachments,
    createdAt: new Date(),
  });

  // Update status if it was closed
  if (this.status === 'closed') {
    this.status = 'open';
  } else if (this.status === 'open' && user.role === 'admin') {
    this.status = 'in_progress';
  }

  await this.save();
};

// Method to assign ticket
supportTicketSchema.methods.assign = async function (adminUser) {
  this.assignedTo = adminUser._id;
  this.status = 'in_progress';
  await this.save();
};

// Method to resolve ticket
supportTicketSchema.methods.resolve = async function (resolutionNote = null) {
  this.status = 'resolved';
  this.resolvedAt = new Date();
  if (resolutionNote) {
    this.resolutionNote = resolutionNote;
  }
  await this.save();
};

// Method to close ticket
supportTicketSchema.methods.close = async function () {
  this.status = 'closed';
  this.closedAt = new Date();
  await this.save();
};

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

export default SupportTicket;
