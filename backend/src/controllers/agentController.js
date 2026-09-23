import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/User.js';
import Driver from '../models/Driver.js';
import DriverKyc from '../models/DriverKyc.js';
import VehicleType from '../models/VehicleType.js';
import Agent from '../models/Agent.js';
import AgentTarget from '../models/AgentTarget.js';
import { generateTokenPair } from '../utils/jwt.js';
import { createSession } from '../services/sessionService.js';
import { generateOTP, storeOTP, verifyOTP, deleteOTP, wasOtpIssuedRecently } from '../utils/otp.js';
import { AuthenticationError, AuthorizationError, ValidationError, ConflictError, NotFoundError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import notificationService from '../services/notificationService.js';
import logger from '../utils/logger.js';
import { findUserByIdentifier, parseLoginIdentifier } from '../utils/loginIdentifier.js';
import { uploadToCloudinary, getFileUrl } from '../services/fileUploadService.js';
import { getOrCreateWallet } from '../services/walletService.js';
import {
  ensureAgentReferralCode,
  syncReferredDriversForAgents,
  mergeInviteStats,
  loadInvitedUsersForAgent,
} from '../services/agentReferralService.js';
import {
  statsForAgent,
  statsForAgentIds,
  recentlyActiveDriverIds,
  formatReferredDriver,
  loadReferredDrivers,
  ratesFromStats,
} from '../services/agentStatsService.js';

const { sendEmail, sendSMS } = notificationService;

const termiiOtpSmsBody = (otp) =>
  `Your Keke App Verification code is: ${otp}. Valid for 10 minutes.`;

function logOtpToTerminal(otp, target) {
  if (process.env.NODE_ENV === 'production') return;
  const line = '════════════════════════════════════════';
  console.log(`\n${line}`);
  console.log('  🔐 OTP (agent login):', otp);
  console.log('  For:', target);
  console.log(`${line}\n`);
}

async function issueAgentSession(user, req) {
  const deviceId = req.body.device_id || req.headers['x-device-id'] || 'agent-web';
  const ipAddress = req.ip || req.connection?.remoteAddress;
  const tokens = generateTokenPair({ id: user._id, role: user.role });
  await createSession({
    userId: user._id,
    deviceId,
    refreshToken: tokens.refreshToken,
    ipAddress,
  });
  return tokens;
}

function formatAgent(agent, user) {
  const u = user || agent.user || {};
  return {
    agent_id: agent._id.toString(),
    name: agent.name || u.name || null,
    phone: u.phone || null,
    email: u.email || null,
    zone: agent.zone,
    park: agent.park,
    start_date: agent.startDate,
    status: agent.status,
    bounty_rate: agent.bountyRate,
    bank_account: agent.bankAccount || {},
    referral_code: agent.referralCode || null,
  };
}

function daysRemaining(deadline) {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

async function persistAgentUpload(file) {
  const provider = process.env.UPLOAD_PROVIDER || 'local';
  if (provider === 'cloudinary' && file.buffer) {
    const result = await uploadToCloudinary(file.buffer, 'agent-driver-documents', {
      resource_type: file.mimetype === 'application/pdf' ? 'raw' : 'auto',
    });
    return result.url;
  }
  if (file.buffer) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const destDir = path.join(__dirname, '../../uploads/agent-drivers');
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    const ext = path.extname(file.originalname || '') || '.jpg';
    const fullPath = path.join(destDir, `${uuidv4()}${ext}`);
    await writeFile(fullPath, file.buffer);
    return getFileUrl({ path: fullPath });
  }
  return null;
}

async function collectAgentUploads(files) {
  const uploadResults = await Promise.all(
    (files || []).map(async (file) => {
      try {
        const url = await persistAgentUpload(file);
        return { file, url, ok: true };
      } catch (err) {
        logger.warn(`Agent driver upload failed (${file.fieldname}): ${err.message}`);
        return { file, url: null, ok: false };
      }
    })
  );

  let selfieUrl = null;
  let idImageUrl = null;
  let licenseImageUrl = null;
  const vehicleImages = [];

  for (const result of uploadResults) {
    if (!result.ok || !result.url) continue;
    const field = String(result.file.fieldname || '').toLowerCase();
    if (field.includes('selfie')) selfieUrl = result.url;
    else if (field.includes('vehicle')) vehicleImages.push({ type: 'front', url: result.url, createdAt: new Date() });
    else if (field.includes('licence') || field.includes('license')) licenseImageUrl = result.url;
    else idImageUrl = result.url;
  }

  return { selfieUrl, idImageUrl, licenseImageUrl, vehicleImages };
}

async function applyAgentDriverUploads({ driver, user, files, licenseNumber }) {
  const { selfieUrl, idImageUrl, licenseImageUrl, vehicleImages } = await collectAgentUploads(files);

  if (vehicleImages.length) {
    driver.vehicleImages = vehicleImages;
    await driver.save();
  }

  if (selfieUrl || idImageUrl || licenseImageUrl) {
    await DriverKyc.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          ...(idImageUrl ? { idImageUrl } : {}),
          ...(licenseImageUrl ? { licenseImageUrl } : {}),
          ...(selfieUrl ? { selfieUrl } : {}),
        },
        $setOnInsert: {
          userId: user._id,
          idType: 'drivers_license',
          idNumber: licenseNumber || 'pending',
          ...(!idImageUrl ? { idImageUrl: 'pending' } : {}),
          ...(!selfieUrl ? { selfieUrl: 'pending' } : {}),
          verificationStatus: 'pending',
        },
      },
      { upsert: true, new: true }
    );
  }

  if (selfieUrl && user && !user.profileImage) {
    user.profileImage = selfieUrl;
    await user.save({ validateBeforeSave: false });
  }

  return { selfieUrl, idImageUrl, licenseImageUrl, vehicleImages };
}

async function serializeAgentDriver(driver) {
  const userId = driver.user?._id || driver.user;
  const [activeSet, kyc] = await Promise.all([
    recentlyActiveDriverIds([driver._id]),
    DriverKyc.findOne({ userId }).lean(),
  ]);
  return {
    ...formatReferredDriver(driver, activeSet.has(String(driver._id)), kyc),
    license_number: driver.licenseNumber,
    vehicle_details: driver.vehicleDetails,
    kyc_status: kyc?.verificationStatus || null,
    kyc_rejection: kyc?.rejectionReason || null,
  };
}

function vehicleDefaults(vehicleType) {
  const label = `${vehicleType?.name || ''} ${vehicleType?.displayName || ''}`.toLowerCase();
  if (label.includes('okada') || label.includes('bike') || label.includes('motor')) {
    return { make: 'Okada', model: 'Motorcycle' };
  }
  return { make: 'Keke', model: 'Tricycle' };
}

function hasUpload(files, part) {
  return (files || []).some((file) => String(file.fieldname || '').toLowerCase().includes(part));
}

function applyAgentAttribution(user, req, body) {
  const agentUserId = req.agent.user || req.user?._id;
  if (!user.referredBy && agentUserId && String(agentUserId) !== String(user._id)) {
    user.referredBy = agentUserId;
  }
  if (!user.referredByAgentId) user.referredByAgentId = req.agent._id;
  const gender = String(body.gender || '').trim().toLowerCase();
  if (['male', 'female', 'other'].includes(gender)) user.gender = gender;
  const city = String(body.city || '').trim();
  const state = String(body.state || '').trim();
  if (city) user.city = city;
  if (state) user.state = state;
}

/**
 * POST /api/agents/auth/request-otp
 * Existing Keke accounts that are linked as agents get an OTP. No Firebase, no password.
 */
export const requestAgentOtp = asyncHandler(async (req, res) => {
  const { email_phone_number } = req.body;
  const { user, parsed } = await findUserByIdentifier(User, email_phone_number);

  if (!user) {
    throw new NotFoundError(
      'No Keke account found with this email or phone. Sign up in the Keke app first.'
    );
  }
  if (!user.isActive) {
    throw new AuthenticationError('This account has been deactivated.');
  }

  const agent = await Agent.findOne({ user: user._id });
  if (!agent) {
    return res.json({
      status: 'success',
      data: { otp_queued: false, application_status: 'none' },
    });
  }
  if (agent.status === 'pending') {
    return res.json({
      status: 'success',
      data: { otp_queued: false, application_status: 'pending' },
    });
  }
  if (agent.status !== 'active') {
    throw new AuthorizationError('This agent account is not active.');
  }

  const identifier = parsed.email || parsed.phone || user.email || user.phone;
  if (identifier && (await wasOtpIssuedRecently(identifier, 'verification'))) {
    throw new ValidationError('A login code was just sent. Please wait about a minute before requesting another.');
  }

  const otp = generateOTP();
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`🔐 [DEV] Agent login OTP for ${identifier}: ${otp}`);
    logOtpToTerminal(otp, identifier);
  }
  await storeOTP(identifier, otp, 'verification');
  if (user.phone && identifier !== user.phone) await storeOTP(user.phone, otp, 'verification');
  if (user.email && identifier !== user.email) await storeOTP(String(user.email).toLowerCase(), otp, 'verification');

  res.json({
    status: 'success',
    message: 'Login code sent',
    data: {
      otp_queued: true,
      masked: user.phone || user.email,
    },
  });

  setImmediate(() => {
    if (user.phone) {
      sendSMS(user.phone, termiiOtpSmsBody(otp)).catch((err) => {
        logger.error(`Agent login OTP SMS failed: ${err.message}`);
      });
    }
    if (user.email) {
      sendEmail(
        user.email,
        'Your Keke agent login code',
        `<p>Your login code is: <strong>${otp}</strong>. Valid for 10 minutes.</p>`
      ).catch((err) => {
        logger.error(`Agent login OTP email failed: ${err.message}`);
      });
    }
  });
});

/**
 * POST /api/agents/auth/verify
 */
export const verifyAgentOtp = asyncHandler(async (req, res) => {
  const { email_phone_number, otp } = req.body;
  const { user, parsed } = await findUserByIdentifier(User, email_phone_number);
  if (!user) throw new NotFoundError('User');

  const identifier = parsed.email || parsed.phone || user.email || user.phone;
  const result = await verifyOTP(identifier, otp, 'verification');
  if (!result.valid) {
    throw new ValidationError(result.message);
  }

  const agent = await Agent.findOne({ user: user._id });
  if (!agent || agent.status !== 'active') {
    throw new AuthorizationError('This account is not an active agent.');
  }

  if (parsed.phone) await deleteOTP(parsed.phone, 'verification');
  if (parsed.email) await deleteOTP(parsed.email, 'verification');
  if (user.phone) await deleteOTP(user.phone, 'verification');
  if (user.email) await deleteOTP(String(user.email).toLowerCase(), 'verification');

  await User.findByIdAndUpdate(user._id, { $set: { isVerified: true } }, { runValidators: false });
  const tokens = await issueAgentSession(user, req);

  res.json({
    status: 'success',
    message: 'Login successful',
    authorisation: {
      token: tokens.token,
      refresh_token: tokens.refreshToken,
      type: 'bearer',
    },
    data: {
      agent: formatAgent(agent, user),
    },
  });
});

/**
 * POST /api/agents/apply
 * Existing Keke account, not yet an agent → pending Agent row for admin review.
 */
export const applyAsAgent = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const zone = String(req.body.zone || req.body.park || '').trim();
  const reason = String(req.body.reason || '').trim();
  const identifier = String(req.body.email_phone_number || req.body.phone || req.body.email || '').trim();

  if (!identifier) throw new ValidationError('Email or phone number is required');
  if (!name) throw new ValidationError('Name is required');
  if (!zone) throw new ValidationError('Park or zone is required');
  if (!reason) throw new ValidationError('A short reason is required');

  const { user } = await findUserByIdentifier(User, identifier);
  if (!user) {
    throw new NotFoundError(
      'No Keke account found with this email or phone. Sign up in the Keke app first.'
    );
  }
  if (!user.isActive) {
    throw new AuthenticationError('This account has been deactivated.');
  }

  const existing = await Agent.findOne({ user: user._id });
  if (existing) {
    if (existing.status === 'pending') {
      return res.json({
        status: 'success',
        message: 'Your application is still pending review.',
        data: { application_status: 'pending' },
      });
    }
    throw new ConflictError('This account is already an agent.');
  }

  if (!user.name) {
    user.name = name;
    await user.save();
  }

  await Agent.create({
    user: user._id,
    name,
    zone,
    park: null,
    notes: reason,
    status: 'pending',
  });

  res.status(201).json({
    status: 'success',
    message: 'Your application has been submitted and is pending review.',
    data: { application_status: 'pending' },
  });
});

export const getAgentMe = asyncHandler(async (req, res) => {
  await ensureAgentReferralCode(req.agent);
  await req.agent.populate('user', 'name email phone referralCode');
  res.json({
    status: 'success',
    data: { agent: formatAgent(req.agent, req.agent.user) },
  });
});

export const updateAgentMe = asyncHandler(async (req, res) => {
  const { bankAccount, zone, park } = req.body;
  if (bankAccount && typeof bankAccount === 'object') {
    req.agent.bankAccount = {
      accountName: bankAccount.accountName ?? req.agent.bankAccount?.accountName,
      accountNumber: bankAccount.accountNumber ?? req.agent.bankAccount?.accountNumber,
      bankName: bankAccount.bankName ?? req.agent.bankAccount?.bankName,
      bankCode: bankAccount.bankCode ?? req.agent.bankAccount?.bankCode,
    };
  }
  if (zone !== undefined) req.agent.zone = zone;
  if (park !== undefined) req.agent.park = park;
  await req.agent.save();
  await req.agent.populate('user', 'name email phone referralCode');
  res.json({
    status: 'success',
    data: { agent: formatAgent(req.agent, req.agent.user) },
  });
});

export const getAgentOverview = asyncHandler(async (req, res) => {
  await syncReferredDriversForAgents([req.agent]);
  const statsMap = await mergeInviteStats([req.agent], await statsForAgentIds([req.agent._id]));
  const stats = statsMap.get(String(req.agent._id)) || await statsForAgent(req.agent._id);
  const target = await AgentTarget.findOne({ agent: req.agent._id, status: 'active' }).sort({ deadline: 1 });
  const days = daysRemaining(target?.deadline);
  const paceNeeded =
    target && days > 0 ? Math.max(0, Math.ceil((target.targetCount - stats.verified) / days)) : null;

  res.json({
    status: 'success',
    data: {
      stats,
      cycle: target
        ? {
            cycle_name: target.cycleName,
            target_count: target.targetCount,
            deadline: target.deadline,
            days_remaining: days,
            pace_needed: paceNeeded,
            bounty_rate: target.bountyRate || req.agent.bountyRate || 0,
          }
        : null,
      earnings: {
        bounty_rate: req.agent.bountyRate || 0,
        projected_owed: (req.agent.bountyRate || 0) * stats.active,
        paid: 0,
        note: 'Payouts are tracked in the next phase. Overview shows projected bounty for currently active drivers.',
      },
    },
  });
});

export const listMyDrivers = asyncHandler(async (req, res) => {
  await ensureAgentReferralCode(req.agent);
  await syncReferredDriversForAgents([req.agent]);
  const [rows, rawStats, invites] = await Promise.all([
    loadReferredDrivers(req.agent._id),
    statsForAgent(req.agent._id),
    loadInvitedUsersForAgent(req.agent),
  ]);
  const statsMap = await mergeInviteStats([req.agent], new Map([[String(req.agent._id), rawStats]]));
  res.json({
    status: 'success',
    data: {
      stats: ratesFromStats(statsMap.get(String(req.agent._id))),
      drivers: rows,
      invites,
      count: rows.length,
      referral_code: req.agent.referralCode || null,
    },
  });
});

export const listAgentDrivers = asyncHandler(async (req, res) => {
  await syncReferredDriversForAgents([req.agent]);
  const { status, search } = req.query;
  let rows = await loadReferredDrivers(req.agent._id);

  if (status) {
    rows = rows.filter((row) => row.status === status);
  }
  if (search) {
    const q = String(search).toLowerCase();
    rows = rows.filter(
      (row) =>
        (row.name && row.name.toLowerCase().includes(q)) ||
        (row.phone && row.phone.includes(q)) ||
        (row.email && row.email.toLowerCase().includes(q)) ||
        (row.plate_number && row.plate_number.toLowerCase().includes(q))
    );
  }

  res.json({
    status: 'success',
    data: { drivers: rows, count: rows.length },
  });
});

export const getAgentDriver = asyncHandler(async (req, res) => {
  const driver = await Driver.findOne({ _id: req.params.id, referredByAgentId: req.agent._id })
    .populate('user', 'name phone email profileImage')
    .populate('vehicleDetails.vehicleType', 'name displayName');
  if (!driver) throw new NotFoundError('Driver');

  res.json({
    status: 'success',
    data: { driver: await serializeAgentDriver(driver) },
  });
});

/**
 * PATCH /api/agents/drivers/:id/documents
 * Resume KYC photos for a driver already tagged to this agent.
 */
export const updateAgentDriverDocuments = asyncHandler(async (req, res) => {
  const driver = await Driver.findOne({ _id: req.params.id, referredByAgentId: req.agent._id })
    .populate('user')
    .populate('vehicleDetails.vehicleType', 'name displayName');
  if (!driver) throw new NotFoundError('Driver');

  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) throw new ValidationError('Upload at least one document photo');

  const user = driver.user;
  if (!user) throw new NotFoundError('Driver');

  await applyAgentDriverUploads({
    driver,
    user,
    files,
    licenseNumber: driver.licenseNumber,
  });

  res.json({
    status: 'success',
    message: 'Documents saved',
    data: { driver: await serializeAgentDriver(driver) },
  });
});

/**
 * POST /api/agents/drivers
 * Field agent registers a driver against the existing Driver + User models.
 */
export const registerAgentDriver = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const rawPhone = String(body.phone || body.email_phone_number || '').trim();
  const licenseNumber = String(body.licenseNumber || body.union_number || body.license_number || '').trim();
  const plateNumber = String(body.plateNumber || body.plate_number || '').trim().toUpperCase();
  const vehicleTypeId = body.vehicleType || body.vehicle_type;
  const color = String(body.color || '').trim();
  const year = parseInt(String(body.year || ''), 10) || new Date().getFullYear();
  const gender = String(body.gender || '').trim().toLowerCase();
  const city = String(body.city || '').trim();
  const state = String(body.state || '').trim();
  const files = Array.isArray(req.files) ? req.files : [];

  if (!name) throw new ValidationError('Driver name is required');
  if (!rawPhone) throw new ValidationError('Driver phone is required');
  if (!licenseNumber) throw new ValidationError('Union / licence number is required');
  if (!plateNumber) throw new ValidationError('Plate number is required');
  if (!vehicleTypeId) throw new ValidationError('Vehicle type is required');
  if (!color) throw new ValidationError('Vehicle colour is required');
  if (!['male', 'female', 'other'].includes(gender)) throw new ValidationError('Gender is required');
  if (!state) throw new ValidationError('State is required');
  if (!city) throw new ValidationError('Town or city is required');

  const parsed = parseLoginIdentifier(rawPhone);
  if (parsed.isEmail || !parsed.phone) {
    throw new ValidationError('A valid Nigerian phone number is required');
  }

  const vehicleType = await VehicleType.findById(vehicleTypeId);
  if (!vehicleType || !vehicleType.isActive) {
    throw new NotFoundError('Vehicle type');
  }

  const defaults = vehicleDefaults(vehicleType);
  const make = String(body.make || defaults.make).trim();
  const model = String(body.model || defaults.model).trim();
  const licenseExpiry = body.licenseExpiry
    ? new Date(body.licenseExpiry)
    : new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000);

  const { user: existingUser } = await findUserByIdentifier(User, rawPhone);
  let user = existingUser;
  if (!user) {
    user = new User({
      name,
      phone: parsed.phone,
      role: 'driver',
      isActive: true,
      isVerified: false,
      isRegCompleted: true,
      onboardingStage: 'driver_stage3',
      kycStatus: 'pending',
    });
    applyAgentAttribution(user, req, body);
    await user.save();
  } else {
    if (!user.name) user.name = name;
    user.role = 'driver';
    user.isRegCompleted = true;
    if (!user.onboardingStage) user.onboardingStage = 'driver_stage3';
    if (!user.kycStatus) user.kycStatus = 'pending';
    applyAgentAttribution(user, req, body);
    await user.save();
  }

  let driver = await Driver.findOne({ user: user._id });
  if (driver) {
    if (driver.referredByAgentId && String(driver.referredByAgentId) !== String(req.agent._id)) {
      throw new ConflictError('This driver is already registered by another agent.');
    }
    if (!driver.referredByAgentId) {
      driver.referredByAgentId = req.agent._id;
      await driver.save();
    }
    await driver.populate('user', 'name phone email');
    await driver.populate('vehicleDetails.vehicleType', 'name displayName');
    return res.status(200).json({
      status: 'success',
      message: 'Driver already exists — tagged to you',
      data: { driver: formatReferredDriver(driver, false), existing: true },
    });
  }

  if (
    !hasUpload(files, 'selfie')
    || !hasUpload(files, 'vehicle')
    || !(hasUpload(files, 'license') || hasUpload(files, 'licence'))
    || !hasUpload(files, 'id_image')
  ) {
    throw new ValidationError('Driver photo, licence photo, ID photo, and vehicle photo are required');
  }

  try {
    driver = await Driver.create({
      user: user._id,
      referredByAgentId: req.agent._id,
      licenseNumber,
      licenseExpiry,
      vehicleDetails: {
        make,
        model,
        year,
        plateNumber,
        color,
        vehicleType: vehicleType._id,
      },
      documentsVerified: false,
      verificationStatus: 'pending',
      isOnline: false,
      isAvailable: false,
    });
  } catch (err) {
    if (err.code === 11000) {
      const field = err.message?.includes('licenseNumber')
        ? 'Union / licence number'
        : err.message?.includes('plateNumber')
          ? 'Plate number'
          : 'Driver';
      throw new ConflictError(`${field} is already registered.`);
    }
    throw err;
  }

  try {
    await getOrCreateWallet(driver._id, 'NGN');
  } catch (err) {
    logger.warn(`Wallet create failed for agent-registered driver ${driver._id}: ${err.message}`);
  }

  await applyAgentDriverUploads({ driver, user, files, licenseNumber });

  await driver.populate('user', 'name phone email');
  await driver.populate('vehicleDetails.vehicleType', 'name displayName');

  logger.info(`Agent ${req.agent._id} registered driver ${driver._id} for user ${user._id}`);

  res.status(201).json({
    status: 'success',
    message: 'Driver registered',
    data: { driver: formatReferredDriver(driver, false), existing: false },
  });
});
