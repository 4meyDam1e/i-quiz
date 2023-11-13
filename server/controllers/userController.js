import asyncHandler from "express-async-handler";
import { compare, genSalt, hash } from "bcrypt";
import User from "../models/User.js";
import formatMessage from "../utils/utils.js";
import sendEmailVerificationLink from "../utils/emailVerificationUtils.js";
import sendPasswordResetCode from "../utils/passwordResetUtils.js";
import crypto from "crypto";
import mongoose from "mongoose";

const saltRounds = 10;

//@route  POST api/users
//@desc   Registers a new iQuiz user
//@access Public
const registerUser = asyncHandler(async (req, res) => {
  const { type, firstName, lastName, email, password } = req.body;

  //Verify all fields exist.
  if (!firstName || !lastName || !email || !password || !type) {
    return res.status(400).json(formatMessage(false, "Missing fields"));
  }

  //Check valid type
  if (type !== "student" && type !== "instructor") {
    return res.status(400).json(formatMessage(false, "Invalid type"));
  }

  //Checks if there is a pre-existing user.
  const existsUser = await User.findOne({ email });
  if (existsUser) {
    return res
      .status(400)
      .json(formatMessage(false, "Email is already registered"));
  }

  //Salting password.
  genSalt(saltRounds, async function (err, salt) {
    hash(password, salt, async function (err, hashedPassword) {
      if (err) return res.status(500).end(err);

      //Creating user
      const user = await User.create({
        type: type,
        firstName: firstName,
        lastName: lastName,
        email: email,
        password: hashedPassword,
        emailVerificationCode: crypto.randomUUID().slice(0, 8),
        passwordReset: {} //Use all default values
      });

      //Return user object
      if (user) {
        await sendEmailVerificationLink(user);
        return res.status(200).json(formatMessage(true, "Registered Successfully"));
      }
    });
  });
});

//@route  GET api/users
//@desc   [DESCRIPTION OF WHAT ROUTE DOES]
//@access Private
const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find({});
  return res
    .status(200)
    .json(formatMessage(true, "User retrieved successfully", users));
});

//@route  POST api/users/login
//@desc   Logs in user, given a valid email and password.
//@access Public
const loginUser = asyncHandler(async (req, res) => {
  if (req.session.email) {
    return res.status(400).json(formatMessage(false, "User already logged in"));
  }
  
  const { email, password } = req.body;

  //Verify all fields exist.
  if (!email || !password) {
    return res.status(400).json(formatMessage(false, "Missing fields"));
  }

  //Verify valid user
  const user = await User.findOne({ email });
  if (!user) {
    return res
      .status(400)
      .json(formatMessage(false, "Email is not registered"));
  }

  //Checks if user's account is verified
  if (!user.verified) {
    return res
      .status(400)
      .json(
        formatMessage(
          false,
          "Please verify your account first before you log in!"
        )
      );
  }

  compare(password, user.password, function (err, result) {
    if (!result) {
      return res.status(401).json(formatMessage(false, "Incorrect password"));
    }

    //Store email
    req.session.email = email;
    req.session.cookie.httpOnly = true;
    req.session.cookie.sameSite = true;

    //Setting cookie
    res.cookie("user", email, {
      path: "/",
      maxAge: 60 * 60 * 1000, // 1 hr in number of seconds
      httpOnly: false,
      secure: true,
      sameSite: true,
    });
    res.cookie("user_type", user.type, {
      path: "/",
      maxAge: 60 * 60 * 1000, // 1 hr in number of seconds
      httpOnly: false,
      secure: true,
      sameSite: true,
    });

    return res.json(formatMessage(true, "Login Successfully"));
  });
});

//@route  GET api/users/logout
//@desc   Logs out user, if the user is logged in.
//@access Public
const logoutUser = asyncHandler(async (req, res) => {
  res.clearCookie("connect.sid");
  res.clearCookie("user");
  res.clearCookie("user_type");

  if (!req.session.email) {
    return res.status(400).json(formatMessage(false, "User is not logged in"));
  }
  
  req.session.destroy(function (err) {
    if (err)
      return res
        .status(500)
        .json(formatMessage(false, "Deleting session error"));
    return res.json(formatMessage(true, "User has successfully logged out"));
  });
});

//@route  POST api/users/verifyemail/:userID/:emailVerificationCode
//@desc   Takes a code and verifies user's email if the code matches the generated verification code for that user.
//@access Public
const verifyUserEmail = asyncHandler(async (req, res) => {
  const { userId, emailVerificationCode } = req.params;

  if (!userId || !emailVerificationCode) {
    return res.status(400).json(formatMessage(false, "Missing arguments"));
  }

  if (!mongoose.isValidObjectId(userId)) {
    return res.status(400).json(formatMessage(false, "Bad user id"));
  }

  const user = await User.findOne({ _id: userId });
  if (!user) {
    return res.status(400).json(formatMessage(false, "User is not registered"));
  }

  if (user.verified) {
    return res
      .status(400)
      .json(formatMessage(false, "User is already verified"));
  }

  if (user.emailVerificationCode === emailVerificationCode) {
    user.verified = true;
    const updateUser = await User.updateOne({ _id: userId }, user);

    if (updateUser.modifiedCount === 1) {
      return res.json(formatMessage(true, "User has been verified!"));
    }
    return res
      .status(500)
      .json(formatMessage(false, "Failed to update Users database"));
  }
  return res
    .status(400)
    .json(formatMessage(false, "Invalid verification code"));
});

//@route  POST api/users/resetpasswordcode
//@desc   Takes an email address and sends password reset code if valid.
//@access Public
const getPasswordResetCode = asyncHandler(async (req, res) => {
  const { email } = req.body;

  //Verify all fields exist.
  if (!email) {
    return res.status(400).json(formatMessage(false, "Missing fields"));
  }

  //Verify valid email
  const user = await User.findOne({ email });
  if (!user || !user.verified) {
    return res.status(400).json(formatMessage(false, "Invalid email"));
  }

  //Generate, send and store password reset code
  user.passwordReset.code = crypto.randomUUID().slice(0, 8);
  await sendPasswordResetCode(user);
  await user.save();

  return res.status(200).json(formatMessage(true, "Password reset code sent successfully"));
});

//@route  POST api/users/verifyresetpasswordcode
//@desc   Takes a email address and sends password reset code if valid.
//@access Public
const verifyPasswordResetCode = asyncHandler(async (req, res) => {});

export {
  registerUser,
  getUsers,
  loginUser,
  logoutUser,
  verifyUserEmail,
  getPasswordResetCode
};
