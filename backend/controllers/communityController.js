const prisma = require('../utils/prisma');

/**
 * GET /api/community
 * Fetch community feed posts with search, filters, group by and sorting
 */
exports.getPosts = async (req, res) => {
  try {
    const { search, region, category, sortBy } = req.query;

    const where = {};

    // Search query (title, content, author, location)
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } },
        { authorName: { contains: q, mode: 'insensitive' } },
        { location: { contains: q, mode: 'insensitive' } },
      ];
    }

    // Region filter
    if (region && region.trim() && region !== 'all') {
      where.region = { equals: region.trim(), mode: 'insensitive' };
    }

    // Category filter
    if (category && category.trim() && category !== 'all') {
      where.category = { equals: category.trim(), mode: 'insensitive' };
    }

    // Sorting
    let orderBy = [{ createdAt: 'desc' }];
    if (sortBy === 'popular') {
      orderBy = [{ likesCount: 'desc' }, { createdAt: 'desc' }];
    } else if (sortBy === 'title') {
      orderBy = [{ title: 'asc' }];
    }

    const posts = await prisma.communityPost.findMany({
      where,
      orderBy,
      include: {
        comments: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return res.json({ posts });
  } catch (error) {
    console.error('Error fetching community posts:', error);
    return res.status(500).json({ error: 'Failed to fetch community posts.' });
  }
};

/**
 * GET /api/community/:id
 * Get post details by ID
 */
exports.getPostById = async (req, res) => {
  try {
    const { id } = req.params;
    const post = await prisma.communityPost.findUnique({
      where: { id },
      include: {
        comments: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!post) {
      return res.status(404).json({ error: 'Community post not found.' });
    }

    return res.json({ post });
  } catch (error) {
    console.error('Error fetching post:', error);
    return res.status(500).json({ error: 'Failed to fetch post.' });
  }
};

/**
 * POST /api/community
 * Create a new community post
 */
exports.createPost = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { title, content, location, region, category, image } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required.' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const authorName = user ? `${user.firstName} ${user.lastName}`.trim() : 'Anonymous Traveler';

    const post = await prisma.communityPost.create({
      data: {
        userId,
        authorName,
        authorAvatar: user?.photoUrl || null,
        title: title.trim(),
        content: content.trim(),
        location: location ? location.trim() : 'Global',
        region: region || 'Europe',
        category: category || 'Travel Story',
        image: image || null,
      },
      include: {
        comments: true,
      },
    });

    return res.status(201).json({ message: 'Post published to community!', post });
  } catch (error) {
    console.error('Error creating post:', error);
    return res.status(500).json({ error: 'Failed to publish post.' });
  }
};

/**
 * POST /api/community/:id/like
 * Upvote / Like a post
 */
exports.likePost = async (req, res) => {
  try {
    const { id } = req.params;
    const post = await prisma.communityPost.update({
      where: { id },
      data: {
        likesCount: { increment: 1 },
      },
    });

    return res.json({ message: 'Post liked', likesCount: post.likesCount });
  } catch (error) {
    console.error('Error liking post:', error);
    return res.status(500).json({ error: 'Failed to like post.' });
  }
};

/**
 * POST /api/community/:id/comment
 * Add a comment to a post
 */
exports.addComment = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id: postId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment content is required.' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const authorName = user ? `${user.firstName} ${user.lastName}`.trim() : 'Traveler';

    const comment = await prisma.postComment.create({
      data: {
        postId,
        authorName,
        content: content.trim(),
      },
    });

    return res.status(201).json({ message: 'Comment added', comment });
  } catch (error) {
    console.error('Error adding comment:', error);
    return res.status(500).json({ error: 'Failed to add comment.' });
  }
};

/**
 * DELETE /api/community/:id
 * Delete a post by ID (Author or Admin)
 */
exports.deletePost = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.params;

    const post = await prisma.communityPost.findUnique({ where: { id } });
    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }

    // Verify ownership or Admin role
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (post.userId && post.userId !== userId && user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized to delete this post.' });
    }

    // Delete post comments first
    await prisma.postComment.deleteMany({ where: { postId: id } });

    // Delete post
    await prisma.communityPost.delete({ where: { id } });

    return res.json({ message: 'Post deleted successfully', id });
  } catch (error) {
    console.error('Error deleting post:', error);
    return res.status(500).json({ error: 'Failed to delete post.' });
  }
};
