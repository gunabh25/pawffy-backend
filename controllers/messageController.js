const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");

// ─── Get or Create conversation between two users ─────────────────────────────
const findOrCreateConversation = async (user1Id, user2Id) => {
  // Always store with lower ID first to ensure uniqueness
  const [a, b] = [user1Id, user2Id].sort();

  let conversation = await prisma.conversation.findUnique({
    where: { user1Id_user2Id: { user1Id: a, user2Id: b } },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { user1Id: a, user2Id: b },
    });
  }

  return conversation;
};

// ─── GET /api/conversations — list all conversations for logged-in user ────────
exports.getConversations = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
    include: {
      user1: { select: { id: true, name: true, profileImage: true } },
      user2: { select: { id: true, name: true, profileImage: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const formatted = conversations.map((conv) => {
    const other = conv.user1Id === userId ? conv.user2 : conv.user1;
    return {
      id: conv.id,
      otherUser: other,
      lastMessage: conv.lastMessage,
      updatedAt: conv.updatedAt,
      unreadCount: 0, // can be enhanced later
    };
  });

  res.json({ success: true, data: formatted });
});

// ─── GET /api/messages/:conversationId — messages in a conversation ────────────
exports.getMessages = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { conversationId } = req.params;
  const { page = 1, limit = 50 } = req.query;

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });

  if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    include: { sender: { select: { id: true, name: true, profileImage: true } } },
    orderBy: { createdAt: "desc" },
    skip: (parseInt(page) - 1) * parseInt(limit),
    take: parseInt(limit),
  });

  // Mark messages as read
  await prisma.message.updateMany({
    where: { conversationId, isRead: false, senderId: { not: userId } },
    data: { isRead: true },
  });

  res.json({ success: true, data: messages.reverse() });
});

// ─── POST /api/messages — send a message ─────────────────────────────────────
exports.sendMessage = asyncHandler(async (req, res) => {
  const { receiverId, content } = req.body;

  if (!receiverId || !content) {
    return res.status(400).json({ success: false, message: "receiverId and content are required" });
  }
  if (receiverId === req.user.id) {
    return res.status(400).json({ success: false, message: "Cannot send a message to yourself" });
  }

  const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
  if (!receiver) return res.status(404).json({ success: false, message: "Receiver not found" });

  const conversation = await findOrCreateConversation(req.user.id, receiverId);

  const message = await prisma.message.create({
    data: { conversationId: conversation.id, senderId: req.user.id, content },
    include: { sender: { select: { id: true, name: true, profileImage: true } } },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessage: content },
  });

  res.status(201).json({ success: true, data: message });
});
