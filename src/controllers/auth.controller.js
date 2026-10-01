import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import userModel from "../models/user.model.js";
import blacklistTokenModel from "../models/blacklistToken.model.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

async function registerUser(req, res) {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const username = req.body.username?.trim();
    const { password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        message: "All fields are required among username, email, password",
      });
    }
    const isUserAlreadyExists = await userModel.findOne({
      $or: [{ username }, { email }],
    });

    if (isUserAlreadyExists) {
      return res.status(400).json({
        message: "Account already exists with this email address or username",
      });
    }

    const passHash = await hashPassword(password);
    const user = await userModel.create({
      username,
      email,
      password: passHash,
    });

    const token = jwt.sign(
      { id: user._id, username: user.username },
      env.JWT_SECRET,
      {
        expiresIn: "1d",
      },
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      message: "User registered successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res
        .status(409)
        .json({ message: "An account with these credentials already exists" });
    }

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

async function loginUser(req, res) {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const user = await userModel.findOne({ email }).select("+password");

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const isValidPassword = await verifyPassword(user.password, password);

    if (!isValidPassword) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username },
      env.JWT_SECRET,
      {
        expiresIn: "1d",
      },
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 1d
    });

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

async function logoutUser(req, res) {
  try {
    const token = req.cookies?.token;

    if (token) {
      await blacklistTokenModel.create({ token });

      res.clearCookie("token", {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
      });

      return res.status(200).json({
        message: "Logout successful",
      });
    }

    return res.status(400).json({
      message: "User already logged out",
    });
  } catch (error) {
    console.error("Logout error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
}

async function getMe(req, res) {
  const user = await userModel.findById(req.user.id);
  if (!user) return res.status(404).json({ message: "User not found" });

  return res.status(200).json({
    user: { id: user._id, username: user.username, email: user.email },
  });
}

export { registerUser, loginUser, logoutUser, getMe };
