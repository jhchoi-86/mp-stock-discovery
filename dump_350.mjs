import { PrismaClient } from "@prisma/client"; 
const prisma = new PrismaClient(); 
async function main() { 
  const stocks = await prisma.dailyStockSnapshot.findMany({ 
    select: { code: true, category: true },
    distinct: ['code'],
  }); 
  console.log(JSON.stringify(stocks)); 
  await prisma.$disconnect(); 
} 
main();
