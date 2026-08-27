class PrismaClientKnownRequestError extends Error {
  constructor(msg, opts = {}) { super(msg); this.code = opts.code; }
}
export const Prisma = {
  PrismaClientKnownRequestError,
  PrismaClientValidationError: class extends Error {},
  PrismaClientInitializationError: class extends Error {},
};
export class PrismaClient {}
export default { Prisma, PrismaClient };
