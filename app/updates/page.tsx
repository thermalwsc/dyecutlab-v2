import { redirect } from "next/navigation";

/* Landing page moved to / — keep /updates as a redirect
   so old shared links don't break. */
export default function UpdatesRedirect() {
  redirect("/");
}
