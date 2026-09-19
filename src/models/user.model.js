import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: [true, "username already exist"],
    required: true,
  },
  email: {
    type: String,
    unique: [true, "account already exist with this email"],
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
});

const userModel = mongoose.model("users", user);

export default userModel;
