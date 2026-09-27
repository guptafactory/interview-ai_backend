import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import blacklistTokenModel from "../models/blacklistToken.model.js";

async function authUser(req, res, next) {
  try {
    const { token } = req.cookies;

    if (!token) {
      return res.status(401).json({
        message: "Authorisation Token not found",
      });
    }

    const decoded = jwt.verify(token, env.JWT_SECRET);
    const revoked = await blacklistTokenModel.exists({ token });
    if (revoked)
      return res.status(401).json({ message: "Session has been revoked" });

    req.user = { id: decoded.sub };
    return next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({
      message: "User authorisation failed",
    });
  }
}

export default authUser;
