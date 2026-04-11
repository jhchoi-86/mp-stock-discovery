import { PrismaClient } from "@prisma/client"; 
const prisma = new PrismaClient(); 
async function main() { 
  const stocks = await prisma.dailyStockSnapshot.findMany({ 
    where: { code: { in: ['015750'] } }, 
    select: { code: true, name: true },
    distinct: ['code']
  }); 
  console.log(JSON.stringify(stocks)); 
  await prisma.$disconnect(); 
} 
main();
