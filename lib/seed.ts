import { prisma } from "./prisma";
import { hashPassword } from "./auth";

export async function seedDatabase() {
  // Create superadmin if not exists
  const existing = await prisma.user.findUnique({ where: { username: "Borgescley" } });
  if (!existing) {
    const hashed = await hashPassword("borges123");
    await prisma.user.create({
      data: {
        name: "Borgescley",
        username: "Borgescley",
        password: hashed,
        role: "superadmin",
      },
    });
  }

  // Create WhatsApp session record if not exists
  const session = await prisma.whatsAppSession.findUnique({ where: { id: "default" } });
  if (!session) {
    await prisma.whatsAppSession.create({ data: { id: "default" } });
  }
}
