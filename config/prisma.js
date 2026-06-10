require("dotenv").config();
const { PrismaClient } = require("../generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");

const connectionString = process.env.DATABASE_URL;

// Render's internal Postgres URL doesn't need SSL.
// External / production URLs with ?sslmode=require need rejectUnauthorized: false.
const ssl = connectionString && connectionString.includes("sslmode=require")
  ? { rejectUnauthorized: false }
  : undefined;

const adapter = new PrismaPg({ connectionString, ssl });

const prisma = new PrismaClient({ adapter });

module.exports = prisma;
