"use client";

import { IconDeviceFloppy } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createGuideAction,
  updateGuideAction,
  type GuideActionResult,
} from "@/features/guides/actions";
import { GuideMarkdown } from "@/features/guides/markdown";
import {
  GUIDE_BODY_MAX,
  GUIDE_CONTEXTS,
  GUIDE_ROLES,
  GUIDE_SLUG_MAX,
  GUIDE_TITLE_MAX,
  slugify,
  type GuideContextValue,
  type GuideInput,
  type GuideRoleValue,
} from "@/features/guides/validation";
import { CONTEXT_LABEL, ROLE_LABEL } from "./labels";

const NONE = "none";
type Fields = Partial<Record<keyof GuideInput, string>>;

/**
 * Editor artikel panduan (T-020): judul, slug (mengikuti judul sampai disunting), peran, konteks
 * bantuan, isi markdown + pratinjau tersanitasi (komponen render yang sama dengan /panduan). Isian
 * dipertahankan saat gagal; fokus ke kolom pertama yang salah.
 */
export function GuideEditor({
  guide,
  origins,
}: {
  /** Artikel yang diubah; tanpa = artikel baru. */
  guide?: GuideInput & { id: string };
  origins: string[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<GuideInput>(
    guide ?? { title: "", slug: "", role: "ALL", contextKey: null, bodyMarkdown: "" },
  );
  const [slugTouched, setSlugTouched] = useState(!!guide);
  const [pending, setPending] = useState(false);
  const [fields, setFields] = useState<Fields>({});
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLButtonElement>(null);
  const contextRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const [focusKey, setFocusKey] = useState(0);

  useEffect(() => {
    if (!focusKey) return;
    // Urutan tampil kolom: fokus ke kolom pertama yang salah, selain itu ke pesan di atas form.
    const order: [keyof Fields, { current: HTMLElement | null }][] = [
      ["title", titleRef],
      ["slug", slugRef],
      ["role", roleRef],
      ["contextKey", contextRef],
      ["bodyMarkdown", bodyRef],
    ];
    const first = order.find(([k]) => fields[k]);
    (first ? first[1].current : alertRef.current)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hanya setelah simpan gagal.
  }, [focusKey]);

  const set = <K extends keyof GuideInput>(key: K, value: GuideInput[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setNotice(null);
    let r: GuideActionResult<{ id: string } | null>;
    try {
      r = guide ? await updateGuideAction(guide.id, draft) : await createGuideAction(draft);
    } catch {
      r = { ok: false, code: "BUSY", message: "Koneksi terputus. Coba lagi." };
    }
    setPending(false);
    if (r.ok) {
      setFields({});
      if (!guide && r.data) return router.push(`/admin/panduan/${r.data.id}?created=1`);
      setNotice({ tone: "success", text: "Perubahan tersimpan." });
      return;
    }
    setFields((r.fields ?? {}) as Fields);
    setNotice(r.fields ? null : { tone: "error", text: r.message });
    setFocusKey((k) => k + 1);
  }

  return (
    <form onSubmit={save} className="grid gap-6 lg:grid-cols-2 lg:items-start" noValidate>
      <div className="flex min-w-0 flex-col gap-4">
        {notice ? (
          <FormAlert tone={notice.tone} ref={alertRef}>
            {notice.text}
          </FormAlert>
        ) : null}
        <Field id="guide-title" label="Judul" required error={fields.title}>
          <Input
            ref={titleRef}
            value={draft.title}
            maxLength={GUIDE_TITLE_MAX}
            placeholder="Mis. Mengunggah file Excel pertama"
            onChange={(e) => {
              set("title", e.target.value);
              if (!slugTouched) set("slug", slugify(e.target.value));
            }}
          />
        </Field>
        <Field
          id="guide-slug"
          label="Slug (alamat)"
          required
          error={fields.slug}
          hint={`Dipakai di /panduan/<slug>. Huruf kecil, angka, tanda hubung; ≤ ${GUIDE_SLUG_MAX} karakter.`}
        >
          <Input
            ref={slugRef}
            value={draft.slug}
            maxLength={GUIDE_SLUG_MAX}
            spellCheck={false}
            autoCapitalize="none"
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", e.target.value);
            }}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceField
            id="guide-role"
            label="Peran"
            triggerRef={roleRef}
            value={draft.role}
            error={fields.role}
            options={GUIDE_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            onChange={(v) => set("role", v as GuideRoleValue)}
          />
          <ChoiceField
            id="guide-context"
            label="Bantuan di halaman"
            triggerRef={contextRef}
            value={draft.contextKey ?? NONE}
            error={fields.contextKey}
            options={[
              { value: NONE, label: "Tidak ada" },
              ...GUIDE_CONTEXTS.map((c) => ({ value: c, label: CONTEXT_LABEL[c] })),
            ]}
            onChange={(v) => set("contextKey", v === NONE ? null : (v as GuideContextValue))}
          />
        </div>
        <Field
          id="guide-body"
          label="Isi (markdown)"
          error={fields.bodyMarkdown}
          hint={`Judul (#), daftar (-), tautan [teks](https://…), gambar dari storage. HTML tidak dirender. ≤ ${GUIDE_BODY_MAX.toLocaleString("id-ID")} karakter.`}
        >
          <Textarea
            ref={bodyRef}
            value={draft.bodyMarkdown}
            maxLength={GUIDE_BODY_MAX}
            rows={16}
            className="font-mono text-sm"
            onChange={(e) => set("bodyMarkdown", e.target.value)}
          />
        </Field>
        <Button
          type="submit"
          pending={pending}
          leadingIcon={<IconDeviceFloppy aria-hidden />}
          className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto md:self-start"
        >
          {guide ? "Simpan perubahan" : "Simpan sebagai draf"}
        </Button>
      </div>
      <section
        aria-labelledby="guide-preview-title"
        className="min-w-0 rounded-lg border bg-card p-4 shadow-xs lg:sticky lg:top-[calc(var(--topbar-h)+1rem)]"
      >
        <h2 id="guide-preview-title" className="mb-3 text-sm font-medium text-muted-foreground">
          Pratinjau
        </h2>
        {draft.title.trim() ? (
          <p className="mb-3 text-lg font-semibold">{draft.title.trim()}</p>
        ) : null}
        {draft.bodyMarkdown.trim() ? (
          <GuideMarkdown markdown={draft.bodyMarkdown} origins={origins} />
        ) : (
          <p className="text-sm text-muted-foreground">Isi artikel tampil di sini saat diketik.</p>
        )}
      </section>
    </form>
  );
}

function ChoiceField({
  id,
  label,
  value,
  options,
  error,
  triggerRef,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  error?: string;
  triggerRef: React.Ref<HTMLButtonElement>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger
          ref={triggerRef}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-(--control-h-lg) aria-invalid:border-destructive md:h-(--control-h)"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
