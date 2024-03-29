const asyncHandler = require('express-async-handler')
const User = require('../models/User')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const Token = require('../models/Token')
const crypto = require('crypto')
const sendEmail = require("../utils/sendEmail");

const generateToken = (id) => {
    return jwt.sign({id}, process.env.JWT_SECRET, {expiresIn: '1d'})
}

// Register User
const registerUser = asyncHandler( async (req,res) => {
   const {name, email, password} = req.body
   // Check that all fields filled out.
   if (!name) {
    res.status(400)
    throw new Error('Please provide a name.')
   }
   if (!email) {
        res.status(400)
        throw new Error('Please provide an email address.')
   }
   if (!password) {
        res.status(400)
        throw new Error('Please provide a password.')
   }
   // Check password minimum length.
   if (password.length < 6) {
    res.status(400)
    throw new Error('Password must be at least 6 characters.')
   }
   // Check if user email already exists.
   const userExists = await User.findOne({email})
   if (userExists) {
    res.status(400)
    throw new Error('This email address has already been registered. Please choose a different one.')
   }
 
   // Create new user with provided name, email, and password
   const user = await User.create({
       // In ES6, if the property name matches the variable name, you can simply use the variable name
       name, email, password,
   });

   // Generate Token
   const token = generateToken(user._id)

   // Send HTTP-only cookie
   res.cookie('token', token, {
    path: '/',
    httpOnly: true,
    expires:  new Date(Date.now() + 1000 * 86400), // Expires in 1 day
    sameSite: 'none',
    secure: true,
   })
   
   if (user) {
    console.log('User Created!')
    const {id, name, photo, role} = user
    res.status(201).json({
        id, name, photo, role, token
    })
   } else {
    res.status(400)
    throw new Error('Invalid user data.')
   }
})

// Login User
const loginUser = asyncHandler(async (req,res) => {
    const {email , password } = req.body
    // Validate Request
    if (!email) {
        res.status(400)
        throw new Error('Please provide email.')
    }
    if (!password) {
        res.status(400)
        throw new Error('Please provide password.')
    }
    // Check if user exists.
    const user = await User.findOne({email})
    if (!user) {
        res.status(400)
        throw new Error('Email address not found. Please register or try a different email.')
    }

    // User exists, check if supplied password matches password in database
    const passwordIsCorrect = await bcrypt.compare(password, user.password)

    // Generate Token
   const token = generateToken(user._id)

   // Send HTTP-only cookie
   if(passwordIsCorrect){
    // Send HTTP-only cookie
   res.cookie("token", token, {
     path: "/",
     httpOnly: true,
     expires: new Date(Date.now() + 1000 * 86400), // 1 day
     sameSite: "none",
     secure: true,
   })
 }

    if (user && passwordIsCorrect) {
        const {id, name, photo, role} = user
        res.status(200).json({
            id, name, photo, role, token
        })
    } else {
        res.status(400)
        throw new Error('Invalid credentials.')
    }
})

// Logout user
const logout = asyncHandler(async (req, res) => {
    res.cookie("token", "", {
        path: "/",
        httpOnly: true,
        expires: new Date(0),
        sameSite: "none",
        secure: true,
      })
      return res.status(200).json({
        message: 'Successfully Logged Out'
      })
})

// Get User Profile
const getUser = asyncHandler(async (req,res) => {
    
    const user = await User.findById(req.user._id)
    
    if (user) {
        const {_id, name, photo, role, email} = user
        res.status(200).json({
            _id, name, photo, role, email
        })
       } else {
        res.status(400)
        throw new Error('User not found.')
       }
})

// Get login status
const loginStatus = asyncHandler(async (req,res) => {
    const token = req.cookies.token
    if (!token) {
        return res.json(false)
    }
    // Verify Token
    const verified = jwt.verify(token, process.env.JWT_SECRET)
    if (verified) {
        return res.json(true)
    }
    return res.json(false)
})

// Update User
const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    const {name, photo, role, email} = user
    user.email = email
    user.name = req.body.name || name
    user.photo = req.body.photo || photo
    user.role = req.body.role || role

    const updatedUser = await user.save();
    res.status(200).json({
      _id: updatedUser._id,
      name: updatedUser.name,
      photo: updatedUser.photo,
      role: updatedUser.role,
    });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// Change Pasword
const changePassword = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id)
    const {oldPassword, password} = req.body
    // Verify user
    if (!user) {
        res.status(400)
        throw new Error('User not found, please sign up.')
    }

    // Validate
    if (!oldPassword) {
        res.status(400)
        throw new Error('Please add old password.')
    }

    if (!password) {
        res.status(400)
        throw new Error('Please add new password')
    }

    // Check if old password matches password in DB
    const passwordIsCorrect = await bcrypt.compare(oldPassword, user.password)

    if (passwordIsCorrect && password === oldPassword) {
        res.status(400)
        throw new Error('The new password cannot be the same as the old password. Please choose a different password.')
    }

    // Save new password
    if (user && passwordIsCorrect) {
        user.password = password
        await user.save()
        res.status(200).send('Password change successfull')
    } else {
        res.status(400)
        throw new Error('Old password is incorrect.')
    }
})

const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
  
    if (!user) {
      res.status(404);
      throw new Error("User does not exist");
    }
  
    // Delete token if it exists in DB (user has requested reset in the past)
    let token = await Token.findOne({ userId: user._id });
    if (token) {
      await token.deleteOne();
    }
  
    // Create reset token
    let resetToken = crypto.randomBytes(32).toString("hex") + user._id;
    console.log(resetToken) // Remove this in production
  
    // Hash token before saving to DB
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
  
    // Save token to DB
    await new Token({
      userId: user._id,
      token: hashedToken,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * (60 * 1000), // 30 mins
    }).save();
  
    // Construct Reset Url
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`
  
    // Reset Email
    const message = `
      <h2>Reset your Count password</h2>
      <a href="${resetUrl}" clicktracking="off"> Click here to reset your password. </a>

      <p style="color: #999;">If you didn't request a reset, don't worry. You can safely ignore this email.</p>
            
      <p>Thank you,</p>
      <p>The Count Team</p>`

    const subject = "Your Password Reset Request"
    const send_to = user.email
    const sent_from = process.env.EMAIL_USER
  
    try {
      await sendEmail(subject, message, send_to, sent_from)
      res.status(200).json({ success: true, message: "Reset Email Sent" })
    } catch (error) {
      res.status(500)
      throw new Error("Email not sent, please try again")
    }
  });
  
  // Reset Password
  const resetPassword = asyncHandler(async (req, res) => {
    const { password } = req.body
    const { resetToken } = req.params
  
    // Hash token, then compare to Token in DB
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex")
  
    // Find Token in DB
    const userToken = await Token.findOne({
      token: hashedToken,
      expiresAt: { $gt: Date.now() },
    });
  
    if (!userToken) {
      res.status(404);
      throw new Error("Invalid or Expired Token")
    }
  
    // Find user
    const user = await User.findOne({ _id: userToken.userId })
    user.password = password;
    await user.save();
    res.status(200).json({
      message: "Password Reset Successful, Please Login",
    })
  })

module.exports = {
    registerUser,
    loginUser,
    logout,
    getUser,
    loginStatus, 
    updateUser,
    changePassword,
    forgotPassword,
    resetPassword
}