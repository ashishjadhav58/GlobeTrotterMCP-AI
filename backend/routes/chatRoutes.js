const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

/**
 * POST /api/chat/plan-trip
 * Proxy to Python user planning chat agent.
 */
router.post('/plan-trip', async (req, res) => {
  try {
    const { message, sessionId, maxRounds } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required.' });
    }

    const base = (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
    const authHeader = req.headers.authorization || '';

    let response;
    try {
      response = await fetch(`${base}/chat/plan-trip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify({
          message: message.trim(),
          sessionId: sessionId || null,
          maxRounds: maxRounds || 8,
        }),
        signal: AbortSignal.timeout(Number(process.env.AI_SERVICE_TIMEOUT_MS || 180000)),
      });
    } catch (err) {
      console.error('User plan chat AI service unreachable:', err.message);
      return res.status(502).json({
        error: `AI service unreachable at ${base}/chat/plan-trip. Is ai-service running?`,
      });
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({
        error: data.detail || data.error || 'Plan chat failed',
      });
    }
    return res.json(data);
  } catch (error) {
    console.error('User plan chat Error:', error);
    return res.status(500).json({ error: 'Failed to run planning chat.' });
  }
});

module.exports = router;
