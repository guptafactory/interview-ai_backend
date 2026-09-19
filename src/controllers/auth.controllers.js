import userModel from "./../models/user.model.js";

async function registerUser(req, res) {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({
      message: "All fields are required among username, email, password",
    });
  }
  const isUserAlreadyExists = await userModel.findOne({
    $or: [{ username, email }],
  });

  if (!isUserAlreadyExists) {
    return res.status(400).json({
      message: "Account already exists with this email address or username",
    });
  }
}

export { registerUser };
