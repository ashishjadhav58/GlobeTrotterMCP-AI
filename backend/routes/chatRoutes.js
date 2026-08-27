const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

function aiBase() {
  return (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
}

async function proxyJson(req, res, path, options = {}) {
  const authHeader = req.headers.authorization || '';
  let response;
  try {
    response = await fetch(`${aiBase()}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(Number(process.env.AI_SERVICE_TIMEOUT_MS || 180000)),
    });
  } catch (err) {
    console.error('Chat AI service unreachable:', err.message);
    return res.status(502).json({
      error: `AI service unreachable at ${aiBase()}${path}. Is ai-service running?`,
    });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return res.status(response.status).json({
      error: data.detail || data.error || 'Chat request failed',
    });
  }
  return res.json(data);
}

/**
 * GET /api/chat/sessions
 */
router.get('/sessions', async (req, res) => {
  try {
    return await proxyJson(req, res, '/chat/sessions');
  } catch (error) {
    console.error('List chat sessions Error:', error);
    return res.status(500).json({ error: 'Failed to list chat sessions.' });
  }
});

/**
 * GET /api/chat/sessions/:id
 */
router.get('/sessions/:id', async (req, res) => {
  try {
    return await proxyJson(req, res, `/chat/sessions/${encodeURIComponent(req.params.id)}`);
  } catch (error) {
    console.error('Get chat session Error:', error);
    return res.status(500).json({ error: 'Failed to load chat session.' });
  }
});

/**
 * DELETE /api/chat/sessions/:id
 */
router.delete('/sessions/:id', async (req, res) => {
  try {
    return await proxyJson(req, res, `/chat/sessions/${encodeURIComponent(req.params.id)}`, {
      method: 'DELETE',
    });
  } catch (error) {
    console.error('Delete chat session Error:', error);
    return res.status(500).json({ error: 'Failed to delete chat session.' });
  }
});

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

    return await proxyJson(req, res, '/chat/plan-trip', {
      method: 'POST',
      body: JSON.stringify({
        message: message.trim(),
        sessionId: sessionId || null,
        maxRounds: maxRounds || 8,
        coverImageUrl: req.body?.coverImageUrl || null,
      }),
    });
  } catch (error) {
    console.error('User plan chat Error:', error);
    return res.status(500).json({ error: 'Failed to run planning chat.' });
  }
});

module.exports = router;
