import { withAuth } from "next-auth/middleware";

// Protect everything except the auth pages, the invite landing page, and the
// auth/register API endpoints. Unauthenticated users are redirected to /login.
export default withAuth({
  pages: { signIn: "/login" },
});

export const config = {
  matcher: [
    "/((?!login|register|invite|api/auth|api/register|_next/static|_next/image|favicon.ico).*)",
  ],
};
