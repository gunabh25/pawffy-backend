const prisma = require("../config/prisma");
const AppError = require("../middleware/errors");

async function getOrCreateConversation(user1Id, user2Id) {
  const [a, b] = [user1Id, user2Id].sort();
  let conv = await prisma.conversation.findUnique({
    where: { user1Id_user2Id: { user1Id: a, user2Id: b } },
  });
  if (!conv) {
    conv = await prisma.conversation.create({ data: { user1Id: a, user2Id: b } });
  }
  return conv;
}

function formatConversation(conv, myId) {
  const other = conv.user1Id === myId ? conv.user2 : conv.user1;
  return {
    id: conv.id,
    otherUser: other,
    lastMessage: conv.lastMessage || "",
    updatedAt: conv.updatedAt,
    unreadCount: conv._count?.messages ?? 0,
  };
}

function getDateLabel(date) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";

  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

async function assertConversationAccess(userId, conversationId) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw new AppError("Conversation not found", 404);
  if (conversation.user1Id !== userId && conversation.user2Id !== userId) {
    throw new AppError("Access denied", 403);
  }
  return conversation;
}

async function getConversations(userId, search) {
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
    include: {
      user1: { select: { id: true, name: true, profileImage: true } },
      user2: { select: { id: true, name: true, profileImage: true } },
      _count: {
        select: {
          messages: { where: { senderId: { not: userId }, isRead: false } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  let result = conversations.map((conv) => formatConversation(conv, userId));

  if (search) {
    const q = search.toLowerCase();
    result = result.filter((c) => c.otherUser?.name?.toLowerCase().includes(q));
  }

  return result;
}

async function getOrStartConversation(userId, otherUserId) {
  if (otherUserId === userId) {
    throw new AppError("Cannot start a conversation with yourself", 400);
  }

  const otherUser = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { id: true, name: true, profileImage: true },
  });
  if (!otherUser) throw new AppError("User not found", 404);

  const conv = await getOrCreateConversation(userId, otherUserId);
  return { conversationId: conv.id, otherUser };
}

async function getMessages(userId, conversationId, { page = 1, limit = 50 } = {}) {
  await assertConversationAccess(userId, conversationId);

  const messages = await prisma.message.findMany({
    where: { conversationId },
    include: { sender: { select: { id: true, name: true, profileImage: true } } },
    orderBy: { createdAt: "asc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  await prisma.message.updateMany({
    where: { conversationId, senderId: { not: userId }, isRead: false },
    data: { isRead: true },
  });

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

  return {
    data: grouped,
    meta: { total, page, pages: Math.ceil(total / limit) },
  };
}

async function sendMessage(senderId, { receiverId, content }) {
  if (receiverId === senderId) {
    throw new AppError("Cannot send a message to yourself", 400);
  }

  const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
  if (!receiver) throw new AppError("Receiver not found", 404);

  const conversation = await getOrCreateConversation(senderId, receiverId);
  const trimmed = content.trim();

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId,
      content: trimmed,
    },
    include: { sender: { select: { id: true, name: true, profileImage: true } } },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessage: trimmed },
  });

  return {
    id: message.id,
    conversationId: conversation.id,
    content: message.content,
    senderId: message.senderId,
    sender: message.sender,
    isRead: message.isRead,
    isMine: true,
    createdAt: message.createdAt,
    time: new Date(message.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
  };
}

async function markConversationRead(userId, conversationId) {
  await assertConversationAccess(userId, conversationId);

  const { count } = await prisma.message.updateMany({
    where: { conversationId, senderId: { not: userId }, isRead: false },
    data: { isRead: true },
  });

  return count;
}

module.exports = {
  getConversations,
  getOrStartConversation,
  getMessages,
  sendMessage,
  markConversationRead,
};
