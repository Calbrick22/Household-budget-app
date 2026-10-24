import { redirect } from "next/navigation";

// Editing a month now happens in the check-in over This month; old links land there.
export default async function EditMonth({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/?month=${Number((await params).id)}&checkin=1`);
}
