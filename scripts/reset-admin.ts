import bcrypt from "bcryptjs";

import { db } from "../lib/db";

async function main(): Promise<void> {
  const email = (process.argv[2] ?? process.env.SEED_ADMIN_EMAIL ?? "admin@tracker.local").toLowerCase();
  const password = process.argv[3] ?? process.env.SEED_ADMIN_PASSWORD ?? "Admin@123";

  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await db.user.upsert({
    where: { email },
    update: { passwordHash, active: true, role: "ADMIN" },
    create: {
      email,
      name: "Admin",
      passwordHash,
      role: "ADMIN",
      active: true,
    },
  });

  console.log(`reset-admin: ${user.email} (id=${user.id}, role=${user.role})`);
  console.log(`hash: ${passwordHash}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
