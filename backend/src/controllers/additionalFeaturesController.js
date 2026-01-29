import User from '../models/User.js';
import Ride from '../models/Ride.js';
import Promocode from '../models/Promocode.js';
import Review from '../models/Review.js';
import Driver from '../models/Driver.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Create emergency contact - POST /api/emergency/contact/create
 */
export const createEmergencyContact = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { name, phone, relationship } = req.body;

  if (!name || !phone) {
    throw new ValidationError('Name and phone are required');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Store in user's emergency contacts array (add if not exists)
  if (!user.emergencyContacts) {
    user.emergencyContacts = [];
  }

  // Check if contact already exists
  const existingContact = user.emergencyContacts.find(
    (contact) => contact.phone === phone
  );

  if (existingContact) {
    throw new ConflictError('Emergency contact with this phone already exists');
  }

  user.emergencyContacts.push({
    name,
    phone,
    relationship: relationship || 'emergency',
    createdAt: new Date(),
  });

  await user.save();

  logger.info(`Emergency contact created for user ${userId}`);

  res.status(201).json({
    status: 'success',
    message: 'Emergency contact created successfully',
    data: {
      emergency_contact: {
        name,
        phone,
        relationship: relationship || 'emergency',
      },
    },
  });
});

/**
 * Get emergency contact - GET /api/emergency/contact
 */
export const getEmergencyContact = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId).select('emergencyContacts policeEmergencyContact');
  if (!user) {
    throw new NotFoundError('User');
  }

  const emergencyContacts = user.emergencyContacts || [];
  const policeContact = user.policeEmergencyContact || null;

  res.json({
    status: 'success',
    data: {
      emergency_contacts: emergencyContacts.map((contact, index) => ({
        contact_id: contact._id?.toString() || index.toString(),
        name: contact.name,
        phone: contact.phone,
        relationship: contact.relationship,
        created_at: contact.createdAt,
      })),
      police_emergency_contact: policeContact,
    },
  });
});

/**
 * Update emergency contact - PATCH /api/emergency/contact/update/:id
 */
export const updateEmergencyContact = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;
  const { name, phone, relationship } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  if (!user.emergencyContacts || user.emergencyContacts.length === 0) {
    throw new NotFoundError('Emergency contact');
  }

  const contactIndex = user.emergencyContacts.findIndex(
    (contact) => contact._id?.toString() === id || contact.id === id
  );

  if (contactIndex === -1) {
    throw new NotFoundError('Emergency contact');
  }

  // Update contact
  if (name) user.emergencyContacts[contactIndex].name = name;
  if (phone) user.emergencyContacts[contactIndex].phone = phone;
  if (relationship) user.emergencyContacts[contactIndex].relationship = relationship;

  await user.save();

  logger.info(`Emergency contact updated for user ${userId}`);

  res.json({
    status: 'success',
    message: 'Emergency contact updated successfully',
    data: {
      emergency_contact: {
        contact_id: id,
        name: user.emergencyContacts[contactIndex].name,
        phone: user.emergencyContacts[contactIndex].phone,
        relationship: user.emergencyContacts[contactIndex].relationship,
      },
    },
  });
});

/**
 * Delete emergency contact - DELETE /api/emergency/contact/delete/:id
 */
export const deleteEmergencyContact = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  if (!user.emergencyContacts || user.emergencyContacts.length === 0) {
    throw new NotFoundError('Emergency contact');
  }

  const contactIndex = user.emergencyContacts.findIndex(
    (contact) => contact._id?.toString() === id || contact.id === id
  );

  if (contactIndex === -1) {
    throw new NotFoundError('Emergency contact');
  }

  user.emergencyContacts.splice(contactIndex, 1);
  await user.save();

  logger.info(`Emergency contact deleted for user ${userId}`);

  res.json({
    status: 'success',
    message: 'Emergency contact deleted successfully',
  });
});

/**
 * Send emergency message - POST /api/emergency/contact/send-message
 */
export const sendEmergencyMessage = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { message, rideId } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Get emergency contacts
  const emergencyContacts = user.emergencyContacts || [];
  if (emergencyContacts.length === 0 && !user.policeEmergencyContact) {
    throw new ValidationError('No emergency contacts found');
  }

  // Get ride info if rideId provided
  let rideInfo = null;
  if (rideId) {
    const ride = await Ride.findById(rideId)
      .populate('driver.user', 'name phone')
      .populate('rider', 'name phone');
    
    if (ride) {
      rideInfo = {
        ride_id: ride._id.toString(),
        pickup: ride.pickupLocation.address,
        dropoff: ride.dropoffLocation.address,
        driver: ride.driver ? {
          name: ride.driver.user?.name,
          phone: ride.driver.user?.phone,
        } : null,
      };
    }
  }

  // Send SMS to emergency contacts
  const { sendSMS, sendPushNotification } = await import('../services/notificationService.js');
  let smsSent = 0;
  let pushSent = 0;

  // Prepare emergency message
  const locationInfo = user.currentLocation
    ? `Location: ${user.currentLocation.address || `Lat: ${user.currentLocation.coordinates[1]}, Lng: ${user.currentLocation.coordinates[0]}`}`
    : 'Location: Not available';
  
  const emergencyMessage = `🚨 EMERGENCY ALERT 🚨\n\n${message || 'I need help!'}\n\n${locationInfo}${rideInfo ? `\n\nRide Info:\nPickup: ${rideInfo.pickup}\nDropoff: ${rideInfo.dropoff}${rideInfo.driver ? `\nDriver: ${rideInfo.driver.name} (${rideInfo.driver.phone})` : ''}` : ''}\n\nSent from Keke Ride App`;

  // Send SMS to emergency contacts
  for (const contact of emergencyContacts) {
    if (contact.phone) {
      try {
        const smsResult = await sendSMS(contact.phone, emergencyMessage);
        if (smsResult) {
          smsSent++;
          logger.info(`Emergency SMS sent to ${contact.phone}`);
        }
      } catch (error) {
        logger.error(`Failed to send SMS to ${contact.phone}: ${error.message}`);
      }
    }
  }

  // Send SMS to police emergency contact
  if (user.policeEmergencyContact && user.policeEmergencyContact.phone) {
    try {
      const policeMessage = `🚨 POLICE EMERGENCY ALERT 🚨\n\nUser: ${user.name || 'Unknown'} (${user.phone || 'N/A'})\n${emergencyMessage}`;
      const smsResult = await sendSMS(user.policeEmergencyContact.phone, policeMessage);
      if (smsResult) {
        smsSent++;
        logger.info(`Emergency SMS sent to police: ${user.policeEmergencyContact.phone}`);
      }
    } catch (error) {
      logger.error(`Failed to send SMS to police: ${error.message}`);
    }
  }

  // Send push notification to emergency contacts (if they have device tokens)
  // Note: This would require storing device tokens for emergency contacts
  // For now, we'll send push to the user's own device
  if (user.deviceToken) {
    try {
      const pushResult = await sendPushNotification(
        user.deviceToken,
        'Emergency Alert Sent',
        `Emergency message sent to ${smsSent} contact(s)`,
        {
          type: 'emergency',
          rideId: rideId || null,
        }
      );
      if (pushResult) {
        pushSent++;
      }
    } catch (error) {
      logger.error(`Failed to send push notification: ${error.message}`);
    }
  }

  logger.info(`Emergency message sent for user ${userId}: ${smsSent} SMS, ${pushSent} push notifications`);

  res.json({
    status: 'success',
    message: 'Emergency message sent successfully',
    data: {
      sent_to: emergencyContacts.length,
      police_notified: !!user.policeEmergencyContact,
    },
  });
});

/**
 * Get recent places - GET /api/recent-places
 */
export const getRecentPlaces = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { limit = 10 } = req.query;

  const user = await User.findById(userId).select('addresses');
  if (!user) {
    throw new NotFoundError('User');
  }

  // Get recent places from user's addresses (sorted by creation date)
  const recentPlaces = (user.addresses || [])
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, parseInt(limit))
    .map((address) => ({
      place_id: address._id?.toString(),
      name: address.name || address.address,
      address: address.address,
      location: {
        latitude: address.location.coordinates[1],
        longitude: address.location.coordinates[0],
      },
      is_default: address.isDefault || false,
      created_at: address.createdAt,
    }));

  res.json({
    status: 'success',
    data: {
      recent_places: recentPlaces,
    },
  });
});

/**
 * Save recent place - POST /api/recent-places
 */
export const saveRecentPlace = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { name, address, latitude, longitude, isDefault } = req.body;

  if (!name || !address || !latitude || !longitude) {
    throw new ValidationError('Name, address, latitude, and longitude are required');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  if (!user.addresses) {
    user.addresses = [];
  }

  // Check if place already exists (by coordinates)
  const existingIndex = user.addresses.findIndex((addr) => {
    if (!addr.location || !addr.location.coordinates) return false;
    const [lng, lat] = addr.location.coordinates;
    const distance = Math.sqrt(
      Math.pow(lng - longitude, 2) + Math.pow(lat - latitude, 2)
    );
    return distance < 0.0001; // Very close (approximately 11 meters)
  });

  if (existingIndex !== -1) {
    // Update existing place
    user.addresses[existingIndex].name = name;
    user.addresses[existingIndex].address = address;
    user.addresses[existingIndex].location.coordinates = [longitude, latitude];
    user.addresses[existingIndex].createdAt = new Date();
    if (isDefault !== undefined) {
      user.addresses[existingIndex].isDefault = isDefault;
    }
  } else {
    // Add new place
    if (isDefault) {
      // Remove default from other places
      user.addresses.forEach((addr) => {
        addr.isDefault = false;
      });
    }

    user.addresses.push({
      name,
      address,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
      isDefault: isDefault || false,
      createdAt: new Date(),
    });
  }

  await user.save();

  logger.info(`Recent place saved for user ${userId}`);

  res.status(201).json({
    status: 'success',
    message: 'Recent place saved successfully',
    data: {
      recent_place: {
        name,
        address,
        location: {
          latitude,
          longitude,
        },
        is_default: isDefault || false,
      },
    },
  });
});

/**
 * Clear recent places - DELETE /api/recent-places
 */
export const clearRecentPlaces = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  user.addresses = [];
  await user.save();

  logger.info(`Recent places cleared for user ${userId}`);

  res.json({
    status: 'success',
    message: 'Recent places cleared successfully',
  });
});

/**
 * Get special offers - GET /api/special/offers
 */
export const getSpecialOffers = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const now = new Date();

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Get active promocodes
  const promocodes = await Promocode.find({
    isActive: true,
    validFrom: { $lte: now },
    validTo: { $gte: now },
    $or: [
      { applicableUserTypes: 'all' },
      { applicableUserTypes: user.role },
    ],
  })
    .populate('applicableVehicleTypes', 'name displayName')
    .sort({ order: 1, createdAt: -1 })
    .limit(20);

  res.json({
    status: 'success',
    data: {
      offers: promocodes.map((promo) => ({
        promo_id: promo._id.toString(),
        code: promo.code,
        description: promo.description,
        discount_type: promo.discountType,
        discount_value: promo.discountValue,
        max_discount: promo.maxDiscount,
        min_amount: promo.minAmount,
        valid_from: promo.validFrom,
        valid_to: promo.validTo,
        applicable_vehicle_types: promo.applicableVehicleTypes.map((vt) => ({
          vehicle_id: vt._id.toString(),
          name: vt.name,
          display_name: vt.displayName,
        })),
      })),
    },
  });
});

/**
 * Validate promocode - POST /api/special/offers/validate
 */
export const validatePromocode = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { code, rideAmount, vehicleTypeId } = req.body;

  if (!code) {
    throw new ValidationError('Promo code is required');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  const promocode = await Promocode.findOne({ code: code.toUpperCase() });
  if (!promocode) {
    return res.json({
      status: 'success',
      data: {
        valid: false,
        message: 'Invalid promo code',
      },
    });
  }

  // Validate promocode
  const validation = promocode.isValid(user, rideAmount || 0, vehicleTypeId);

  if (!validation.valid) {
    return res.json({
      status: 'success',
      data: {
        valid: false,
        message: validation.message,
      },
    });
  }

  // Calculate discount
  const discountAmount = promocode.calculateDiscount(rideAmount || 0);

  res.json({
    status: 'success',
    data: {
      valid: true,
      message: validation.message,
      promo_id: promocode._id.toString(),
      code: promocode.code,
      discount_type: promocode.discountType,
      discount_value: promocode.discountValue,
      discount_amount: discountAmount,
      max_discount: promocode.maxDiscount,
      final_amount: (rideAmount || 0) - discountAmount,
    },
  });
});

/**
 * Get re-bookings - GET /api/booking/all/re-bookings
 */
export const getReBookings = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;

  const skip = (page - 1) * limit;

  // Get completed rides for re-booking
  const rides = await Ride.find({
    rider: userId,
    status: 'completed',
  })
    .populate('driver.user', 'name phone profileImage rating')
    .populate('vehicleType')
    .sort({ completedAt: -1, createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Ride.countDocuments({
    rider: userId,
    status: 'completed',
  });

  res.json({
    status: 'success',
    data: {
      re_bookings: rides.map((ride) => ({
        ride_id: ride._id.toString(),
        driver: ride.driver ? {
          driver_id: ride.driver._id.toString(),
          name: ride.driver.user?.name,
          phone: ride.driver.user?.phone,
          image: ride.driver.user?.profileImage,
          rating: ride.driver.rating?.average || 0,
        } : null,
        vehicle_type: ride.vehicleType ? {
          vehicle_id: ride.vehicleType._id.toString(),
          name: ride.vehicleType.name,
          display_name: ride.vehicleType.displayName,
        } : null,
        pickup: {
          address: ride.pickupLocation.address,
          location: {
            latitude: ride.pickupLocation.coordinates[1],
            longitude: ride.pickupLocation.coordinates[0],
          },
        },
        dropoff: {
          address: ride.dropoffLocation.address,
          name: ride.dropoffLocation.name || ride.dropoffLocation.address,
          location: {
            latitude: ride.dropoffLocation.coordinates[1],
            longitude: ride.dropoffLocation.coordinates[0],
          },
        },
        destination: {
          name: ride.dropoffLocation.name || ride.dropoffLocation.address,
          address: ride.dropoffLocation.address,
        },
        fare: ride.fare?.totalFare || 0,
        cost: ride.fare?.totalFare?.toString() || '0',
        status: ride.status,
        completed_at: ride.completedAt,
        created_at: ride.createdAt,
      })),
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
 * Rebook ride - POST /api/booking/rebook-ride
 */
export const rebookRide = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { previousRideId, pickupLocation, dropoffLocation, vehicleTypeId, paymentMethod, promoCode } = req.body;

  // Get previous ride
  const previousRide = await Ride.findById(previousRideId);
  if (!previousRide) {
    throw new NotFoundError('Previous ride');
  }

  if (previousRide.rider.toString() !== userId.toString()) {
    throw new ValidationError('You can only rebook your own rides');
  }

  // Use previous ride details as defaults if not provided
  const finalPickupLocation = pickupLocation || {
    lat: previousRide.pickupLocation.coordinates[1],
    lng: previousRide.pickupLocation.coordinates[0],
    address: previousRide.pickupLocation.address,
    name: previousRide.pickupLocation.name,
  };

  const finalDropoffLocation = dropoffLocation || {
    lat: previousRide.dropoffLocation.coordinates[1],
    lng: previousRide.dropoffLocation.coordinates[0],
    address: previousRide.dropoffLocation.address,
    name: previousRide.dropoffLocation.name,
  };

  const finalVehicleTypeId = vehicleTypeId || previousRide.vehicleType.toString();
  const finalPaymentMethod = paymentMethod || previousRide.paymentMethod;

  // Create new ride request (reuse logic from rideController)
  // This will call the existing requestRide logic
  // For now, return success with instructions to use request-ride endpoint
  res.json({
    status: 'success',
    message: 'Use /api/booking/request-ride with previous ride details to rebook',
    data: {
      previous_ride_id: previousRideId,
      suggested_pickup: finalPickupLocation,
      suggested_dropoff: finalDropoffLocation,
      suggested_vehicle_type: finalVehicleTypeId,
      suggested_payment_method: finalPaymentMethod,
    },
  });
});

/**
 * Create review - POST /api/user/review/create
 */
export const createReview = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId, rating, review, tags } = req.body;

  if (!rideId || !rating) {
    throw new ValidationError('Ride ID and rating are required');
  }

  if (rating < 1 || rating > 5) {
    throw new ValidationError('Rating must be between 1 and 5');
  }

  const ride = await Ride.findById(rideId)
    .populate('rider')
    .populate('driver');

  if (!ride) {
    throw new NotFoundError('Ride');
  }

  if (ride.status !== 'completed') {
    throw new ValidationError('Can only review completed rides');
  }

  const user = await User.findById(userId);
  const isRider = ride.rider._id.toString() === userId.toString();
  const isDriver = ride.driver?.user?.toString() === userId.toString();

  if (!isRider && !isDriver) {
    throw new ValidationError('You can only review rides you participated in');
  }

  // Find or create review
  let reviewDoc = await Review.findOne({ ride: rideId });

  if (!reviewDoc) {
    reviewDoc = await Review.create({
      ride: rideId,
      rider: ride.rider._id,
      driver: ride.driver?._id || null,
    });
  }

  // Add review based on role
  if (isRider) {
    await reviewDoc.addRiderReview(rating, review, tags || []);
    
    // Update driver rating
    if (ride.driver) {
      const driver = await Driver.findById(ride.driver._id);
      if (driver) {
        // Recalculate average rating
        const ratingStats = await Review.calculateAverageRating(driver._id, 'driver');
        driver.rating = {
          average: ratingStats.averageRating,
          count: ratingStats.totalReviews,
        };
        await driver.save();
      }
    }
  } else if (isDriver) {
    await reviewDoc.addDriverReview(rating, review);
    
    // Update rider rating
    const riderUser = await User.findById(ride.rider._id);
    if (riderUser) {
      const ratingStats = await Review.calculateAverageRating(riderUser._id, 'passenger');
      riderUser.rating = ratingStats.averageRating;
      await riderUser.save();
    }
  }

  await reviewDoc.populate('rider', 'name phone profileImage');
  await reviewDoc.populate('driver.user', 'name phone profileImage');

  logger.info(`Review created for ride ${rideId} by ${isRider ? 'rider' : 'driver'}`);

  res.status(201).json({
    status: 'success',
    message: 'Review created successfully',
    data: {
      review: {
        review_id: reviewDoc._id.toString(),
        ride_id: rideId,
        rider_rating: reviewDoc.riderRating,
        rider_review: reviewDoc.riderReview,
        driver_rating: reviewDoc.driverRating,
        driver_review: reviewDoc.driverReview,
        tags: reviewDoc.tags,
        is_rider_reviewed: reviewDoc.isRiderReviewed,
        is_driver_reviewed: reviewDoc.isDriverReviewed,
      },
    },
  });
});
