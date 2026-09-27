import mongoose from "mongoose";

const blacklistTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
  },
  { timestamps: true },
);

const blacklistTokenModel = mongoose.model(
  "blacklistToken",
  blacklistTokenSchema,
);

export default blacklistTokenModel;
