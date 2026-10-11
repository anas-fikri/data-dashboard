import { redirect } from "next/navigation";

/** Profil lengkap belum ada di v1; arahkan ke pengaturan keamanan. */
export default function AccountPage() {
  redirect("/akun/keamanan");
}
