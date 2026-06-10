import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Returns the signed-in user's id, or null. */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as any)?.id ?? null;
}

/**
 * Ensures the current user is a member of the group.
 * Returns the membership (with role) or null if not a member / not signed in.
 */
export async function getMembership(groupId: string) {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  return prisma.membership.findUnique({
    where: { userId_groupId: { userId, groupId } },
  });
}
