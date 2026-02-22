import { PrismaClient } from '../generated/prisma';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    errorFormat: process.env.NODE_ENV === 'development' ? 'pretty' : 'minimal',
  });
}

// Singleton — prevents multiple Prisma instances during hot-reload in dev
export const prisma: PrismaClient = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

export async function connectDB(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('✅ Connected to NeonDB via Prisma');
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    process.exit(1);
  }
}

export async function disconnectDB(): Promise<void> {
  await prisma.$disconnect();
  console.log('🔌 Disconnected from database');
}
