const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const sessionSchema = new mongoose.Schema({
  sessionId:            { type: String, required: true },
  refreshTokenHash:     { type: String, required: true },
  prevRefreshTokenHash: { type: String, default: '' }, // For token reuse detection
  expiresAt:            { type: Date, required: true },
  ip:                   { type: String, default: '' },
  location:             { type: String, default: 'Local Network' },
  userAgent:            { type: String, default: '' },
  deviceName:           { type: String, default: 'Web Browser' },
  deviceType:           { type: String, default: 'desktop' }, // 'desktop' | 'mobile' | 'tablet'
  lastActive:           { type: Date, default: Date.now },
  createdAt:            { type: Date, default: Date.now }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  username:     { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role:         { type: String, enum: ['admin', 'manager', 'staff'], default: 'staff', index: true },
  email:        { type: String, trim: true, lowercase: true, unique: true, sparse: true },
  isActive:     { type: Boolean, default: true, index: true },
  mustChangePassword: { type: Boolean, default: false },
  resetOtp:         { type: String, default: '' },
  resetOtpExp:      { type: Date },
  refreshTokenHash: { type: String, default: '' },
  refreshTokenExp:  { type: Date },
  sessions:         [sessionSchema],
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Strip sensitive fields from JSON
userSchema.methods.toSafeJSON = function () {
  return {
    _id: this._id,
    id: this._id,
    name: this.name,
    username: this.username,
    role: this.role,
    email: this.email,
  };
};

module.exports = mongoose.model('User', userSchema);
