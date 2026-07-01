import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isSignInPage = createRouteMatcher(["/login", "/signup"]);
// Everything not explicitly public is protected. Home ("/") is the placeholder.
const isProtectedRoute = createRouteMatcher(["/"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  // Signed-in users never see the auth pages.
  if (isSignInPage(request) && (await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/");
  }
  // Signed-out users can't reach protected routes.
  if (isProtectedRoute(request) && !(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/login");
  }
});

export const config = {
  // Run on all routes except static files and Next internals.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
