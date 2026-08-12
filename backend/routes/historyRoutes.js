// backend/routes/historyRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const History = require('../models/History');

// ============================================
// Save scan result
// Protected: the history entry is always saved against the logged-in
// user (req.user.id), never a client-supplied userId, so nobody can
// write into someone else's history.
// ============================================
router.post('/save', protect, async (req, res) => {
  try {
    const { scanData } = req.body;

    if (!scanData) {
      return res.status(400).json({ error: 'Scan data required' });
    }

    if (!scanData.timestamp) {
      scanData.timestamp = new Date().toISOString();
    }

    await History.create({
      user: req.user.id,
      scanData: scanData
    });

    // Keep only the latest 50 entries per user (same cap as before)
    const count = await History.countDocuments({ user: req.user.id });
    if (count > 50) {
      const excess = await History.find({ user: req.user.id })
        .sort({ createdAt: 1 })
        .limit(count - 50)
        .select('_id');
      await History.deleteMany({ _id: { $in: excess.map(e => e._id) } });
    }

    res.json({
      success: true,
      message: 'Scan saved to history'
    });
  } catch (error) {
    console.error('Error saving history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Get user scan history
// Protected: :userId in the URL must match the logged-in user, so one
// account can't read another account's history.
// ============================================
router.get('/:userId', protect, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.user.id.toString()) {
      return res.status(403).json({ error: 'Not authorized to view this history' });
    }

    const entries = await History.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);

    const history = entries.map(entry => entry.scanData);

    res.json({ success: true, history: history });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;