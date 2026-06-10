const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");
const { registerSchema, loginSchema } = require("../models/authModel");
const { signToken, sanitizeUser } = require("../utils/auth");

const SALT_ROUNDS = 12;

exports.register = asyncHandler(async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
    });
  }

  const { email, phoneNumber, password, name } = value;

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        ...(email ? [{ email }] : []),
        ...(phoneNumber ? [{ phone: phoneNumber }] : []),
      ],
    },
  });

  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: "User already exists with this email or phone number",
    });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: email || null,
      phone: phoneNumber || null,
      passwordHash,
      name: name || null,
    },
  });

  const token = signToken(user);

  res.status(201).json({
    success: true,
    message: "User registered successfully",
    data: {
      user: sanitizeUser(user),
      token,
    },
  });
});

exports.login = asyncHandler(async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
    });
  }

  const { email, phoneNumber, password } = value;

  const user = await prisma.user.findFirst({
    where: email ? { email } : { phone: phoneNumber },
  });

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Invalid email/phone or password",
    });
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    return res.status(401).json({
      success: false,
      message: "Invalid email/phone or password",
    });
  }

  const token = signToken(user);

  res.status(200).json({
    success: true,
    message: "Login successful",
    data: {
      user: sanitizeUser(user),
      token,
    },
  });
});

exports.getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: sanitizeUser(req.user),
  });
});
