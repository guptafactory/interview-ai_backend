import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import blacklistTokenModel from "../models/blacklistToken.model.js";
import { AppError } from "../utils/AppError.js";

async function authUser(req, _res, next) {
  const token = req.cookies?.token;

  if (!token) {
    throw new AppError("Authorisation Token not found", 401, "TOKEN_MISSING");
  }

  const decoded = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
  });

  const revoked = await blacklistTokenModel.exists({ token });
  if (revoked) {
    throw new AppError("Session has been revoked", 401, "SESSION_REVOKED");
  }

  req.user = { id: decoded.id };
  return next();
}

export default authUser;
