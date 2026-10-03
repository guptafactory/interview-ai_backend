import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import userModel from "../models/user.model.js";
import blacklistTokenModel from "../models/blacklistToken.model.js";
import { AppError } from "../utils/AppError.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import {
  TOKEN_COOKIE,
  tokenCookieOptions,
  clearTokenCookieOptions,
} from "../config/cookies.js";

const JWT_TTL = "1d";

function issueToken(user) {
  return jwt.sign({ id: user._id, username: user.username }, env.JWT_SECRET, {
    expiresIn: JWT_TTL,
  });
}

async function registerUser(req, res) {
  const email = req.body.email?.trim().toLowerCase();
  const username = req.body.username?.trim();
  const { password } = req.body;

  if (!username || !email || !password) {
    throw new AppError(
      "All fields are required among username, email, password",
      400,
      "MISSING_FIELDS",
    );
  }

  const isUserAlreadyExists = await userModel.findOne({
    $or: [{ username }, { email }],
  });

  if (isUserAlreadyExists) {
    throw new AppError(
      "Account already exists with this email address or username",
      400,
      "ACCOUNT_EXISTS",
    );
  }

  const passHash = await hashPassword(password);
  const user = await userModel.create({
    username,
    email,
    password: passHash,
  });

  res.cookie(TOKEN_COOKIE, issueToken(user), tokenCookieOptions);

  return res.status(201).json({
    message: "User registered successfully",
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
    },
  });
}

async function loginUser(req, res) {
  const email = req.body.email?.trim().toLowerCase();
  const { password } = req.body;

  if (!email || !password) {
    throw new AppError(
      "Email and password are required",
      400,
      "MISSING_FIELDS",
    );
  }

  const user = await userModel.findOne({ email }).select("+password");

  if (!user) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  const isValidPassword = await verifyPassword(user.password, password);

  if (!isValidPassword) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  res.cookie(TOKEN_COOKIE, issueToken(user), tokenCookieOptions);

  return res.status(200).json({
    message: "Login successful",
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
    },
  });
}

async function logoutUser(req, res) {
  const token = req.cookies?.token;

  if (!token) {
    throw new AppError("User already logged out", 400, "ALREADY_LOGGED_OUT");
  }

  await blacklistTokenModel.create({ token });
  res.clearCookie(TOKEN_COOKIE, clearTokenCookieOptions);

  return res.status(200).json({
    message: "Logout successful",
  });
}

async function getMe(req, res) {
  const user = await userModel.findById(req.user.id);
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");

  return res.status(200).json({
    user: { id: user._id, username: user.username, email: user.email },
  });
}

export { registerUser, loginUser, logoutUser, getMe };
