"use client";

import { IconPlus } from "@tabler/icons-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SEARCH_MIN, SearchSelect } from "@/components/ui/search-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createDashboardAction, type DashboardFormState } from "@/features/dashboards/actions";
import { DASHBOARD_NAME_MAX, DASHBOARDS_PER_DATASET } from "@/features/dashboards/validation";

/**
 * Form buat dashboard: pilih dataset (Select kustom) + nama + "Mulai dengan dashboard contoh" (T-zm9k).
 * Isian dipertahankan saat gagal.
 */
export function DashboardForm({
  datasets,
  defaultDatasetId,
}: {
  datasets: { id: string; name: string; dashboardCount: number }[];
  defaultDatasetId?: string;
}) {
  const [state, action, pending] = useActionState<DashboardFormState, FormData>(
    createDashboardAction,
    { status: "idle" },
  );
  const nameRef = useRef<HTMLInputElement>(null);
  const datasetRef = useRef<HTMLButtonElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const error = state.status === "error" ? state : null;

  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field === "name") nameRef.current?.focus();
    else if (state.field === "datasetId") datasetRef.current?.focus();
    else alertRef.current?.focus();
  }, [state]);

  const datasetError = error?.field === "datasetId" ? error.message : undefined;
  const datasetId = error?.values.datasetId || defaultDatasetId || undefined;
  const [picked, setPicked] = useState(datasetId ?? "");
  const datasetLabel = (d: (typeof datasets)[number]) =>
    `${d.name} (${d.dashboardCount}/${DASHBOARDS_PER_DATASET} dashboard)`;
  const datasetAria = {
    "aria-invalid": datasetError ? true : undefined,
    "aria-describedby": datasetError ? "datasetId-error" : "datasetId-hint",
  };

  return (
    <form action={action} className="flex max-w-xl flex-col gap-4" noValidate>
      {error && !error.field ? (
        <FormAlert tone="error" ref={alertRef}>
          {error.message}
        </FormAlert>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="datasetId" className="text-sm font-medium">
          Dataset
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        </label>
        {/* Banyak dataset: kotak cari pintar (T-jwhc). */}
        {datasets.length >= SEARCH_MIN ? (
          <SearchSelect
            ref={datasetRef}
            id="datasetId"
            name="datasetId"
            label="Dataset"
            value={picked}
            onChange={setPicked}
            placeholder="Pilih dataset"
            options={datasets.map((d) => ({ value: d.id, label: datasetLabel(d) }))}
            className="h-(--control-h-lg) md:h-(--control-h)"
            aria-required
            {...datasetAria}
          />
        ) : (
          <Select name="datasetId" defaultValue={datasetId} required>
            <SelectTrigger
              ref={datasetRef}
              id="datasetId"
              {...datasetAria}
              className="h-(--control-h-lg) aria-invalid:border-destructive md:h-(--control-h)"
            >
              <SelectValue placeholder="Pilih dataset" />
            </SelectTrigger>
            <SelectContent>
              {datasets.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {datasetLabel(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {datasetError ? (
          <p id="datasetId-error" role="alert" className="text-sm text-destructive">
            {datasetError}
          </p>
        ) : (
          <p id="datasetId-hint" className="text-sm text-muted-foreground">
            Data yang akan ditampilkan widget di dashboard ini.
          </p>
        )}
      </div>
      <Field
        id="name"
        label="Nama dashboard"
        hint="Contoh: Ringkasan Pengiriman Harian. Unik di dataset yang sama."
        required
        error={error?.field === "name" ? error.message : undefined}
      >
        <Input
          ref={nameRef}
          name="name"
          maxLength={DASHBOARD_NAME_MAX}
          defaultValue={error?.values.name ?? ""}
          className="h-(--control-h-lg) md:h-(--control-h)"
        />
      </Field>
      <label className="grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 gap-y-0.5 rounded-md border px-3 py-2.5">
        <input
          type="checkbox"
          name="starter"
          defaultChecked={error?.values.starter ?? false}
          aria-describedby="starter-hint"
          className="row-span-2 mt-0.5 size-4 shrink-0 accent-[hsl(var(--primary))]"
          data-testid="dashboard-starter"
        />
        <span className="text-sm font-medium">Mulai dengan dashboard contoh</span>
        <span id="starter-hint" className="col-start-2 text-sm text-muted-foreground">
          Widget angka, grafik, dan tabel serta kolom filter disusun otomatis dari kolom data.
          Semuanya bisa diubah atau dihapus. Dataset yang belum punya data siap tetap dibuat kosong.
        </span>
      </label>
      <Button
        type="submit"
        pending={pending}
        className="h-(--control-h-lg) w-full md:h-(--control-h) md:w-auto md:self-start"
        leadingIcon={<IconPlus aria-hidden />}
      >
        Buat dashboard
      </Button>
    </form>
  );
}
