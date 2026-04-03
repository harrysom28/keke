import User from '../models/User.js';
import Ride from '../models/Ride.js';
import Promocode from '../models/Promocode.js';
import Review from '../models/Review.js';
import Driver from '../models/Driver.js';
import AdminSettings from '../models/AdminSettings.js';
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
  const { sendSMS, sendPushNotification, buildStandardPushData } = await import('../services/notificationService.js');
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
      const pushData = buildStandardPushData({
        type: 'system',
        subType: 'emergency',
        rideId: rideId || '',
        screen: rideId ? 'ride_tracking' : 'home',
        priority: 'high',
      });
      const pushResult = await sendPushNotification(
        user.deviceToken,
        'Emergency Alert Sent',
        `Emergency message sent to ${smsSent} contact(s)`,
        pushData,
        user._id?.toString?.()
      );
      if (pushResult?.success) {
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
  const { limit = 6 } = req.query;

  const user = await User.findById(userId).select('addresses');
  if (!user) {
    throw new NotFoundError('User');
  }

  // Recent places: distinct per normalisedLabel, sorted by lastUsed desc, limit to 6
  const max = Math.min(6, Math.max(1, parseInt(limit)));
  const seen = new Set();
  const sorted = (user.addresses || []).slice().sort((a, b) => {
    const aTs = new Date(a.lastUsed || a.createdAt || 0).getTime();
    const bTs = new Date(b.lastUsed || b.createdAt || 0).getTime();
    return bTs - aTs;
  });
  const recentPlaces = [];
  for (const addr of sorted) {
    const key = (addr.normalisedLabel || '').toString();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    recentPlaces.push({
      place_id: addr._id?.toString(),
      name: addr.name || addr.address,
      address: addr.address,
      normalisedLabel: addr.normalisedLabel || null,
      location: {
        latitude: addr.location.coordinates[1],
        longitude: addr.location.coordinates[0],
      },
      is_default: addr.isDefault || false,
      last_used: addr.lastUsed || addr.createdAt,
      use_count: addr.useCount || 1,
      created_at: addr.createdAt,
    });
    if (recentPlaces.length >= max) break;
  }

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

  const normalisedLabel = String(name).toLowerCase().trim().replace(/\s+/g, ' ');

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  if (!user.addresses) {
    user.addresses = [];
  }

  // Upsert by normalisedLabel (prevents duplicates by case/spacing)
  const existingIndex = user.addresses.findIndex(
    (addr) => (addr.normalisedLabel || '').toString() === normalisedLabel
  );

  if (existingIndex !== -1) {
    // Update existing place
    user.addresses[existingIndex].name = name;
    user.addresses[existingIndex].normalisedLabel = normalisedLabel;
    user.addresses[existingIndex].address = address;
    user.addresses[existingIndex].location.coordinates = [longitude, latitude];
    user.addresses[existingIndex].lastUsed = new Date();
    user.addresses[existingIndex].useCount = (user.addresses[existingIndex].useCount || 0) + 1;
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
      normalisedLabel,
      address,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
      isDefault: isDefault || false,
      lastUsed: new Date(),
      useCount: 1,
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
        normalisedLabel,
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

// Milestone: 10 rides → ₦1000 free ride (wallet credit)
const MILESTONE_TARGET_RIDES = 10;
const MILESTONE_REWARD_AMOUNT = 1000;

/**
 * Get milestone offer status - GET /api/special/offers/milestone
 */
export const getMilestoneOffer = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const user = await User.findById(userId).select('tenRideFreeClaimed role');
  if (!user) throw new NotFoundError('User');
  if (user.role !== 'passenger') {
    return res.json({
      status: 'success',
      data: {
        available: false,
        completed_rides: 0,
        target_rides: MILESTONE_TARGET_RIDES,
        reward_amount: MILESTONE_REWARD_AMOUNT,
        claimed: false,
        rides_remaining: MILESTONE_TARGET_RIDES,
        message: 'Milestone offer is for passengers only.',
      },
    });
  }

  const completedRides = await Ride.countDocuments({ rider: userId, status: 'completed' });
  const claimed = !!user.tenRideFreeClaimed;
  const ridesRemaining = Math.max(0, MILESTONE_TARGET_RIDES - completedRides);
  const canClaim = completedRides >= MILESTONE_TARGET_RIDES && !claimed;

  let message = '';
  if (claimed) {
    message = "You've already claimed your free ₦1000 ride!";
  } else if (canClaim) {
    message = 'Claim your ₦1,000 free ride credit now!';
  } else if (ridesRemaining === 1) {
    message = '1 more successful ride to unlock ₦1,000 free ride!';
  } else if (ridesRemaining > 0) {
    message = `${ridesRemaining} more successful rides to unlock ₦1,000 free ride!`;
  } else {
    message = `Complete ${MILESTONE_TARGET_RIDES} successful rides to unlock ₦1,000 free ride!`;
  }

  res.json({
    status: 'success',
    data: {
      available: true,
      completed_rides: completedRides,
      target_rides: MILESTONE_TARGET_RIDES,
      reward_amount: MILESTONE_REWARD_AMOUNT,
      claimed,
      rides_remaining: ridesRemaining,
      can_claim: canClaim,
      message,
    },
  });
});

/**
 * Claim milestone reward - POST /api/special/offers/milestone/claim
 */
export const claimMilestoneOffer = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User');
  if (user.role !== 'passenger') {
    throw new ValidationError('Milestone offer is for passengers only');
  }

  const completedRides = await Ride.countDocuments({ rider: userId, status: 'completed' });
  if (completedRides < MILESTONE_TARGET_RIDES) {
    throw new ValidationError(`Complete ${MILESTONE_TARGET_RIDES} successful rides first. You have ${completedRides}.`);
  }
  if (user.tenRideFreeClaimed) {
    throw new ValidationError('You have already claimed this reward.');
  }

  user.tenRideFreeClaimed = true;
  user.balance = (Number(user.balance) || 0) + MILESTONE_REWARD_AMOUNT;
  await user.save();

  logger.info(`Milestone reward claimed: user ${userId}, +₦${MILESTONE_REWARD_AMOUNT} wallet`);

  res.json({
    status: 'success',
    data: {
      claimed: true,
      reward_amount: MILESTONE_REWARD_AMOUNT,
      new_balance: user.balance,
      message: `₦${MILESTONE_REWARD_AMOUNT.toLocaleString()} has been added to your wallet. Use it on your next ride!`,
    },
  });
});

/**
 * Count successful referrals: referred users who completed registration and at least 1 ride
 */
async function countSuccessfulReferrals(referrerId) {
  const referredUserIds = await User.find({ referredBy: referrerId, isRegCompleted: true }).distinct('_id');
  if (referredUserIds.length === 0) return 0;
  const userIdsWithCompletedRide = await Ride.distinct('rider', {
    rider: { $in: referredUserIds },
    status: 'completed',
  });
  return userIdsWithCompletedRide.length;
}

/**
 * Get referral program status - GET /api/special/offers/referral
 */
export const getReferralProgram = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const user = await User.findById(userId).select('role referralCode referralRewardsClaimedCount');
  if (!user) throw new NotFoundError('User');

  const settings = await AdminSettings.findOne({ key: 'default' });
  const refConfig = settings?.referral || {};
  const enabled = refConfig.enabled !== false;
  const rewardType = refConfig.rewardType || 'free_ride';
  const required = refConfig.successfulInvitesRequired ?? 3;
  const cashAmount = refConfig.cashAmount ?? 500;
  const freeRideAmount = refConfig.freeRideAmount ?? 1000;
  const rewardAmount = rewardType === 'cash' ? cashAmount : freeRideAmount;

  if (!enabled || user.role !== 'passenger') {
    return res.json({
      status: 'success',
      data: {
        available: false,
        enabled,
        reward_type: rewardType,
        reward_amount: rewardAmount,
        successful_invites_required: required,
        successful_invites: 0,
        claimed_count: 0,
        can_claim: false,
        claimed: false,
        message: !enabled ? 'Referral program is not active.' : 'Referral program is for passengers only.',
      },
    });
  }

  const successfulInvites = await countSuccessfulReferrals(userId);
  const claimedCount = user.referralRewardsClaimedCount || 0;
  const availableToClaim = Math.floor(successfulInvites / required) - claimedCount;
  const canClaim = availableToClaim >= 1;

  let message = '';
  if (canClaim) {
    message = `Claim your ${rewardType === 'cash' ? `₦${rewardAmount}` : `₦${rewardAmount} free ride credit`} now!`;
  } else {
    const needed = required - (successfulInvites % required);
    if (needed === required && successfulInvites === 0) {
      message = `Invite ${required} friends who complete signup and their first ride to earn ${rewardType === 'cash' ? `₦${rewardAmount} cash` : `₦${rewardAmount} free ride credit`}!`;
    } else {
      message = `${needed} more successful invite${needed > 1 ? 's' : ''} to unlock your reward!`;
    }
  }

  res.json({
    status: 'success',
    data: {
      available: true,
      enabled: true,
      referral_code: user.referralCode,
      reward_type: rewardType,
      reward_amount: rewardAmount,
      successful_invites_required: required,
      successful_invites: successfulInvites,
      claimed_count: claimedCount,
      can_claim: canClaim,
      claimed: claimedCount > 0,
      message,
      description: refConfig.description || 'Invite friends! When they complete signup and their first ride, you get a reward.',
    },
  });
});

/**
 * Claim referral reward - POST /api/special/offers/referral/claim
 */
export const claimReferralReward = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User');
  if (user.role !== 'passenger') {
    throw new ValidationError('Referral program is for passengers only');
  }

  const settings = await AdminSettings.findOne({ key: 'default' });
  const refConfig = settings?.referral || {};
  const enabled = refConfig.enabled !== false;
  if (!enabled) throw new ValidationError('Referral program is not active');

  const rewardType = refConfig.rewardType || 'free_ride';
  const required = refConfig.successfulInvitesRequired ?? 3;
  const cashAmount = refConfig.cashAmount ?? 500;
  const freeRideAmount = refConfig.freeRideAmount ?? 1000;
  const rewardAmount = rewardType === 'cash' ? cashAmount : freeRideAmount;

  const successfulInvites = await countSuccessfulReferrals(userId);
  const claimedCount = user.referralRewardsClaimedCount || 0;
  const availableToClaim = Math.floor(successfulInvites / required) - claimedCount;

  if (availableToClaim < 1) {
    throw new ValidationError(`You need ${required} successful invites (registration + first ride completed) to claim. You have ${successfulInvites} successful invites.`);
  }

  user.referralRewardsClaimedCount = (user.referralRewardsClaimedCount || 0) + 1;
  user.balance = (Number(user.balance) || 0) + rewardAmount;
  await user.save();

  const rewardLabel = rewardType === 'cash' ? `₦${rewardAmount} cash` : `₦${rewardAmount} free ride credit`;
  logger.info(`Referral reward claimed: user ${userId}, +₦${rewardAmount} (${rewardType})`);

  res.json({
    status: 'success',
    data: {
      claimed: true,
      reward_amount: rewardAmount,
      reward_type: rewardType,
      new_balance: user.balance,
      message: `₦${rewardAmount.toLocaleString()} has been added to your wallet. ${rewardType === 'free_ride' ? 'Use it on your next ride!' : ''}`,
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
