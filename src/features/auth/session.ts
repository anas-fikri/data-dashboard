/**
 * Pengguna sesi untuk shell. Implementasi nyata (JWT + sessionVersion) datang di T-002;
 * sampai saat itu tidak ada sesi, dan shell menampilkan tombol Masuk.
 */
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  return null;
}
