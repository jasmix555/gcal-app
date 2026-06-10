/**
 * Seeds a demo account + sample team so visitors can explore without signing up.
 *
 * Demo login:  demo@demo.com  /  demodemo
 *
 * Run with:  npx prisma db seed
 */
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Build a Date at a given hour offset from "today at 00:00".
function at(dayOffset: number, hour: number, minute = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  const passwordHash = await bcrypt.hash("demodemo", 10);

  // Demo users
  const demo = await prisma.user.upsert({
    where: { email: "demo@demo.com" },
    update: {},
    create: { email: "demo@demo.com", name: "Demo User", passwordHash },
  });
  const alex = await prisma.user.upsert({
    where: { email: "alex@demo.com" },
    update: {},
    create: { email: "alex@demo.com", name: "Alex Rivera", passwordHash },
  });
  const sam = await prisma.user.upsert({
    where: { email: "sam@demo.com" },
    update: {},
    create: { email: "sam@demo.com", name: "Sam Tan", passwordHash },
  });

  // A demo group with all three as members
  const group = await prisma.group.create({
    data: {
      name: "Demo Team",
      memberships: {
        create: [
          { userId: demo.id, role: Role.OWNER },
          { userId: alex.id, role: Role.ADMIN },
          { userId: sam.id, role: Role.MEMBER },
        ],
      },
    },
  });

  // Sample events, attributed to different members
  const events = [
    { title: "Team standup", start: at(0, 9, 30), end: at(0, 10), by: demo.id },
    { title: "Design review", start: at(0, 14), end: at(0, 15), by: alex.id },
    { title: "1:1 with Sam", start: at(1, 11), end: at(1, 11, 30), by: demo.id },
    { title: "Sprint planning", start: at(2, 10), end: at(2, 12), by: alex.id },
    { title: "Client call", start: at(3, 16), end: at(3, 17), by: sam.id },
    { title: "Lunch & learn", start: at(4, 12), end: at(4, 13), by: sam.id },
  ];

  for (const e of events) {
    await prisma.event.create({
      data: {
        groupId: group.id,
        title: e.title,
        start: e.start,
        end: e.end,
        createdById: e.by,
        activities: { create: { userId: e.by, action: "created" } },
      },
    });
  }

  console.log("Seeded demo data. Login: demo@demo.com / demodemo");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
