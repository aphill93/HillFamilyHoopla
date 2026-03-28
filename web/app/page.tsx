import { redirect } from "next/navigation";
import { cookies } from "next/headers";

/**
 * Root page — redirect to the calendar if the user has a token,
 * otherwise redirect to the login page.
 *
 * Note: actual auth protection is handled by middleware.ts.
 * This just provides the initial redirect destination.
 */
export default async function RootPage() {
  const cookieStore = cookies();
  const hasToken =
    cookieStore.get("hfh_access_token") ??
    cookieStore.get("hfh_refresh_token");

  if (hasToken) {
    redirect("/calendar");
  } else {
    redirect("/login");
  }
}
