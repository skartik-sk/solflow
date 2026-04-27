const client = require("./client.js");
const prismaClient = require("@prisma/client");

Object.assign(exports, prismaClient);
exports.prisma = client.prisma;
exports.default = client.default;
