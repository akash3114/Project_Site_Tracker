import bcrypt from "bcryptjs";

import { db } from "../lib/db";

/**
 * Rotate the password for every active non-admin (field / Head Office) login
 * in one pass.
 *
 * Usage:
 *   npm.cmd exec -- tsx scripts/rotate-manager-passwords.ts -- '<new-password>'
 *   # on the VM: docker exec tracker-app npx tsx scripts/rotate-manager-passwords.ts -- '<new-password>'
 *
 * Admin accounts are left untouched — reset those from the Admin → Users
 * console or with `npm run reset-admin`.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const password = args[0] ?? process.env.MANAGER_PASSWORD ?? "";

  if (password.length < 6) {
    throw new Error(
      "Usage: tsx scripts/rotate-manager-passwords.ts -- <password> (min 6 chars)",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await db.user.updateMany({
    where: { isAdmin: false, active: true },
    data: { passwordHash },
  });

  console.log(
    `rotate-manager-passwords: updated ${result.count} active non-admin login(s)`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
