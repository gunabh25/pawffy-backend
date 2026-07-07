const prisma = require("../config/prisma");

async function createTicket(userId, data) {
  return prisma.supportTicket.create({
    data: {
      userId,
      subject: data.subject,
      category: data.category,
      description: data.description,
    },
  });
}

module.exports = {
  createTicket,
};
