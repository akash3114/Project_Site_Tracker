import type { DefaultSession, NextAuthConfig } from "next-auth";

declare module "next-auth" {
  interface User {
    isAdmin?: boolean;
  }
  interface Session {
    user: {
      id: string;
      isAdmin?: boolean;
    } & DefaultSession["user"];
  }
}

type TokenShape = {
  id?: string;
  sub?: string;
  isAdmin?: boolean;
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
      const u = user as unknown as { id?: string; isAdmin?: boolean } | undefined;
      if (u?.id !== undefined) {
        (token as unknown as TokenShape).id = u.id;
        (token as unknown as TokenShape).isAdmin = u.isAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as unknown as TokenShape;
      if (session.user) {
        session.user.id = t.id ?? t.sub ?? "";
        session.user.isAdmin = t.isAdmin;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
