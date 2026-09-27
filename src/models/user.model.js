import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "username is required"],
      unique: true,
      trim: true,
      minlength: [3, "username must be at least 3 characters"],
      maxlength: [30, "username must be at most 30 characters"],
      match: [/^[a-zA-Z0-9_.]+$/, "username contains invalid characters"],
    },
    email: {
      type: String,
      required: [true, "email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    password: {
      type: String,
      required: [true, "password is required"],
      select: false, // never returned unless explicitly .select("+password")
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  },
);

const userModel = mongoose.model("user", userSchema);

export default userModel;
