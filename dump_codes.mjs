import { PrismaClient } from "@prisma/client"; 
const prisma = new PrismaClient(); 
async function main() { 
  const stocks = await prisma.dailyStockSnapshot.findMany({ select: { code: true }, distinct: ["code"] }); 
  console.log(JSON.stringify(stocks.map(s => s.code).sort())); 
  await prisma.$disconnect(); 
} 
main();
