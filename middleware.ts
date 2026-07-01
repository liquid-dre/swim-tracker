import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isSignInPage = createRouteMatcher(["/login", "/signup"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const authenticated = await convexAuth.isAuthenticated();
  // Signed-in users never see the auth pages; send them into the app shell.
  if (isSignInPage(request) && authenticated) {
    return nextjsMiddlewareRedirect(request, "/dashboard");
  }
  // Everything outside the auth pages is protected (the whole app shell).
  if (!isSignInPage(request) && !authenticated) {
    return nextjsMiddlewareRedirect(request, "/login");
  }
});

export const config = {
  // Run on all routes except static files and Next internals.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
