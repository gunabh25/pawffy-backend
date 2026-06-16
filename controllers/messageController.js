const prisma = require("../config/prisma");
const asyncHandler = require("../middleware/asyncHandler");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getOrCreateConversation = async (user1Id, user2Id) => {
  const [a, b] = [user1Id, user2Id].sort();
  let conv = await prisma.conversation.findUnique({
    where: { user1Id_user2Id: { user1Id: a, user2Id: b } },
  });
  if (!conv) {
    conv = await prisma.conversation.create({ data: { user1Id: a, user2Id: b } });
  }
  return conv;
};

const formatConversation = (conv, myId) => {
  const other = conv.user1Id === myId ? conv.user2 : conv.user1;
  return {
    id: conv.id,
    otherUser: other,
    lastMessage: conv.lastMessage || "",
    updatedAt: conv.updatedAt,
    unreadCount: conv._count?.messages ?? 0,
  };
};

const getDateLabel = (date) => {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";

  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
};

// ─── GET /api/messages/conversations ─────────────────────────────────────────
// Lists all conversations for the logged-in user, with unread count + optional name search
exports.getConversations = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { search } = req.query;

  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [{ user1Id: userId }, { user2Id: userId }],
    },
    include: {
      user1: { select: { id: true, name: true, profileImage: true } },
      user2: { select: { id: true, name: true, profileImage: true } },
      _count: {
        select: {
          messages: {
            where: { senderId: { not: userId }, isRead: false },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  let result = conversations.map((conv) => formatConversation(conv, userId));

  // Search by other user's name (client-side filter on DB result)
  if (search) {
    const q = search.toLowerCase();
    result = result.filter((c) => c.otherUser?.name?.toLowerCase().includes(q));
  }

  res.json({ success: true, data: result });
});

// ─── GET /api/messages/conversation/with/:userId ──────────────────────────────
// Start or resume a chat with a specific user (e.g., tap a vet profile → open chat)
exports.getOrStartConversation = asyncHandler(async (req, res) => {
  const myId = req.user.id;
  const { userId } = req.params;

  if (userId === myId) {
    return res.status(400).json({ success: false, message: "Cannot start a conversation with yourself" });
  }

  const otherUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, profileImage: true },
  });
  if (!otherUser) return res.status(404).json({ success: false, message: "User not found" });

  const conv = await getOrCreateConversation(myId, userId);

  res.json({
    success: true,
    data: {
      conversationId: conv.id,
      otherUser,
    },
  });
});

// ─── GET /api/messages/:conversationId ────────────────────────────────────────
// Fetch all messages in a conversation (paginated), grouped by date for UI
exports.getMessages = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { conversationId } = req.params;
  const page = parseInt(req.query.page || "1");
  const limit = parseInt(req.query.limit || "50");

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });

  if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    include: {
      sender: { select: { id: true, name: true, profileImage: true } },
    },
    orderBy: { createdAt: "asc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  // Mark incoming messages as read
  await prisma.message.updateMany({
    where: { conversationId, senderId: { not: userId }, isRead: false },
    data: { isRead: true },
  });

  // Group messages by date with a "Today / Yesterday / date" label
  const grouped = [];
  let currentLabel = null;

  for (const msg of messages) {
    const label = getDateLabel(msg.createdAt);
    if (label !== currentLabel) {
      grouped.push({ type: "date_separator", label });
      currentLabel = label;
    }
    grouped.push({
      type: "message",
      id: msg.id,
      content: msg.content,
      senderId: msg.senderId,
      sender: msg.sender,
      isRead: msg.isRead,
      isMine: msg.senderId === userId,
      createdAt: msg.createdAt,
      time: new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    });
  }

  const total = await prisma.message.count({ where: { conversationId } });

  res.json({
    success: true,
    data: grouped,
    meta: { total, page, pages: Math.ceil(total / limit) },
  });
});

// ─── POST /api/messages ───────────────────────────────────────────────────────
// Send a message to another user. Creates a conversation if one doesn't exist.
exports.sendMessage = asyncHandler(async (req, res) => {
  const { receiverId, content } = req.body;

  if (!receiverId || !content?.trim()) {
    return res.status(400).json({ success: false, message: "receiverId and content are required" });
  }
  if (receiverId === req.user.id) {
    return res.status(400).json({ success: false, message: "Cannot send a message to yourself" });
  }

  const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
  if (!receiver) return res.status(404).json({ success: false, message: "Receiver not found" });

  const conversation = await getOrCreateConversation(req.user.id, receiverId);

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: req.user.id,
      content: content.trim(),
    },
    include: {
      sender: { select: { id: true, name: true, profileImage: true } },
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessage: content.trim() },
  });

  res.status(201).json({
    success: true,
    data: {
      id: message.id,
      conversationId: conversation.id,
      content: message.content,
      senderId: message.senderId,
      sender: message.sender,
      isRead: message.isRead,
      isMine: true,
      createdAt: message.createdAt,
      time: new Date(message.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    },
  });
});

// ─── PATCH /api/messages/:conversationId/read ─────────────────────────────────
// Mark all messages in a conversation as read (call when user opens the chat)
exports.markConversationRead = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { conversationId } = req.params;

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });

  if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const { count } = await prisma.message.updateMany({
    where: { conversationId, senderId: { not: userId }, isRead: false },
    data: { isRead: true },
  });

  res.json({ success: true, message: `${count} messages marked as read` });
});
