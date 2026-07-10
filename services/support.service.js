const prisma = require("../config/prisma");

async function createTicket(userId, data, file) {
  let attachmentFileName = null;
  let attachmentMimeType = null;
  let attachmentData = null;

  if (file) {
    attachmentFileName = file.originalname;
    attachmentMimeType = file.mimetype;
    attachmentData = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  }

  return prisma.supportTicket.create({
    data: {
      userId,
      subject: data.subject,
      category: data.category,
      description: data.description,
      attachmentFileName,
      attachmentMimeType,
      attachmentData,
    },
    select: {
      id: true,
      subject: true,
      category: true,
      description: true,
      status: true,
      attachmentFileName: true,
      attachmentMimeType: true,
      createdAt: true,
    },
  });
}

async function listMyTickets(userId) {
  return prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      subject: true,
      category: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

module.exports = {
  createTicket,
  listMyTickets,
};
