import { redirect } from "next/navigation";

/** League Setup is the entry point: nothing else works until it is right. */
export default function Index() {
  redirect("/league-setup");
}
