// backend/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const User = require('../models/User');

// ============================================
// Save user profile
// Protected: always updates the logged-in user (req.user.id), never a
// client-supplied userId, so nobody can overwrite someone else's profile.
// ============================================
router.post('/profile', protect, async (req, res) => {
  try {
    const { healthConditions } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (healthConditions !== undefined) {
      user.healthConditions = healthConditions;
    }
    await user.save();

    res.json({
      success: true,
      message: 'Profile saved successfully',
      profile: {
        email: user.email,
        healthConditions: user.healthConditions,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Error saving profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Get user profile
// Protected: :userId in the URL must match the logged-in user.
// ============================================
router.get('/profile/:userId', protect, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user.id.toString()) {
      return res.status(403).json({ error: 'Not authorized to view this profile' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      profile: {
        email: user.email,
        healthConditions: user.healthConditions,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Update health conditions
// Protected: :userId in the URL must match the logged-in user.
// ============================================
router.put('/profile/:userId/conditions', protect, async (req, res) => {
  try {
    const { userId } = req.params;
    const { healthConditions } = req.body;

    if (userId !== req.user.id.toString()) {
      return res.status(403).json({ error: 'Not authorized to update this profile' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.healthConditions = healthConditions || [];
    await user.save();

    res.json({
      success: true,
      message: 'Health conditions updated',
      healthConditions: user.healthConditions
    });
  } catch (error) {
    console.error('Error updating conditions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;