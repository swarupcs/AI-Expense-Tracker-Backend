/**
 * scripts/fix-converted-amounts.js
 * Run with: node --env-file=.env scripts/fix-converted-amounts.js
 * Or:       node -r dotenv/config scripts/fix-converted-amounts.js
 */

const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient({ log: ['warn', 'error'] });

async function main() {
  console.log('🔍  Scanning for expenses with convertedAmount = 0 ...');

  const rows = await prisma.expense.findMany({
    where: { convertedAmount: 0 },
    select: { id: true, amount: true, exchangeRate: true },
  });

  console.log(`   Found ${rows.length} rows to repair.`);

  if (rows.length === 0) {
    console.log('✅  Nothing to fix.');
    return;
  }

  let fixed = 0;
  for (const row of rows) {
    const rate =
      row.exchangeRate != null && row.exchangeRate > 0 ? row.exchangeRate : 1.0;
    const corrected = Math.round(row.amount * rate * 100) / 100;

    await prisma.expense.update({
      where: { id: row.id },
      data: { convertedAmount: corrected, exchangeRate: rate },
    });

    fixed++;
    if (fixed % 100 === 0) console.log(`   ... ${fixed} / ${rows.length}`);
  }

  console.log(`✅  Done. Repaired ${fixed} expense rows.`);
}

main()
  .catch((err) => {
    console.error('❌  Script failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
