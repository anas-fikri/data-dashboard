"use client";

import { createContext, use, useCallback, useState, type ReactNode } from "react";
import { FocusNotice } from "@/components/ui/focus-notice";

export interface AdminNotice {
  tone: "success" | "error";
  content: ReactNode;
}

const NotifyContext = createContext<(notice: AdminNotice) => void>(() => {});

/**
 * Satu tempat untuk hasil aksi baris di atas tabel: diumumkan (role status/alert) dan menerima
 * fokus. Pemanggil memberi key per halaman/pencarian agar pemberitahuan lama tidak terbawa.
 */
export function AdminFeedback({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<(AdminNotice & { id: number }) | null>(null);
  const notify = useCallback(
    (next: AdminNotice) => setNotice((prev) => ({ ...next, id: (prev?.id ?? 0) + 1 })),
    [],
  );
  return (
    <NotifyContext value={notify}>
      {notice ? (
        <div data-testid="admin-result" data-tone={notice.tone}>
          {/* key baru = mount ulang = fokus lagi, juga untuk hasil berturut-turut. */}
          <FocusNotice key={notice.id} tone={notice.tone}>
            {notice.content}
          </FocusNotice>
        </div>
      ) : null}
      {children}
    </NotifyContext>
  );
}

export function useAdminNotify() {
  return use(NotifyContext);
}
