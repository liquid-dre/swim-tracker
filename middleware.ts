import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

// Public front door: the marketing landing (/) and the auth pages. Everything
// else is the protected app shell.
const isPublicPage = createRouteMatcher(["/", "/login", "/signup"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const authenticated = await convexAuth.isAuthenticated();
  // Signed-in users never see the landing / auth pages; send them into the app.
  if (isPublicPage(request) && authenticated) {
    return nextjsMiddlewareRedirect(request, "/dashboard");
  }
  // Everything outside the public pages is protected (the whole app shell).
  if (!isPublicPage(request) && !authenticated) {
    return nextjsMiddlewareRedirect(request, "/login");
  }
});

export const config = {
  // Run on all routes except static files and Next internals.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
