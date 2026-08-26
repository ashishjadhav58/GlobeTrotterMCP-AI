const express = require('express');
const router = express.Router();
const communityController = require('../controllers/communityController');
const authMiddleware = require('../middleware/auth');

// All community routes require authentication
router.use(authMiddleware);

router.get('/', communityController.getPosts);
router.get('/:id', communityController.getPostById);
router.post('/', communityController.createPost);
router.post('/:id/like', communityController.likePost);
router.post('/:id/comment', communityController.addComment);
router.delete('/:id', communityController.deletePost);

module.exports = router;
