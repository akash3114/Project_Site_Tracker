import type { DefaultSession, NextAuthConfig } from "next-auth";

declare module "next-auth" {
  interface User {
    role?: string;
  }
  interface Session {
    user: {
      id: string;
      role?: string;
    } & DefaultSession["user"];
  }
}

type TokenShape = {
  id?: string;
  sub?: string;
  role?: string;
};

/**
 * Edge-safe Auth.js config (no db/bcrypt imports) shared by the
 * Node `auth()` handler and the Edge `middleware()` gate.
 */
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      const u = user as unknown as { id?: string; role?: string } | undefined;
      if (u?.role !== undefined) {
        (token as unknown as TokenShape).id = u.id;
        (token as unknown as TokenShape).role = u.role;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as unknown as TokenShape;
      if (session.user) {
        session.user.id = t.id ?? t.sub ?? "";
        session.user.role = t.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
