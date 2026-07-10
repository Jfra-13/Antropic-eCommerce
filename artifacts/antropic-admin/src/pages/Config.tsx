import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
import {
  useGetAdminConfig,
  useUpdateAdminConfig,
  useCreateConfigMediaUploadUrl,
  useListAdminPickupPoints,
  useCreatePickupPoint,
  useUpdatePickupPoint,
  useDeletePickupPoint,
  getGetAdminConfigQueryKey,
  getListAdminPickupPointsQueryKey,
  type AdminConfig,
  type Banner,
  type PickupPoint,
} from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/format";

const MEDIA_BUCKET = "public-media";
function publicUrl(path: string): string {
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

export default function Config() {
  const { data, isLoading, isError, error, refetch, isFetching } = useGetAdminConfig();

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Configuración</h1>
          <p className="text-sm text-slate-500">Pago Yape, delivery, puntos de recojo y banners.</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>

      {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
      {isError && <p className="text-sm text-red-600">Error: {errorMessage(error)}</p>}

      {data && <ConfigForm key={JSON.stringify(data)} initial={data} />}

      <PickupPoints />
    </div>
  );
}

// --- Settings form (delivery fee, Yape, banners) — saved together ---

function ConfigForm({ initial }: { initial: AdminConfig }) {
  const queryClient = useQueryClient();
  const [deliveryFee, setDeliveryFee] = useState(initial.deliveryFee);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(
    initial.freeShippingThreshold ?? "",
  );
  const [yapeNumber, setYapeNumber] = useState(initial.yapeNumber ?? "");
  const [yapeQrPath, setYapeQrPath] = useState(initial.yapeQrPath);
  const [banners, setBanners] = useState<Banner[]>(initial.banners);
  const [heroTitle, setHeroTitle] = useState(initial.hero.title ?? "");
  const [heroSubtitle, setHeroSubtitle] = useState(initial.hero.subtitle ?? "");
  const [promoText, setPromoText] = useState(initial.promoText ?? "");

  const save = useUpdateAdminConfig({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetAdminConfigQueryKey() }),
    },
  });

  function submit() {
    save.mutate({
      data: {
        deliveryFee: deliveryFee.trim() || "0.00",
        freeShippingThreshold: freeShippingThreshold.trim() || null,
        yapeNumber: yapeNumber.trim() || null,
        yapeQrPath,
        banners,
        hero: { title: heroTitle.trim() || null, subtitle: heroSubtitle.trim() || null },
        promoText: promoText.trim() || null,
      },
    });
  }

  return (
    <div className="space-y-6">
      <Section title="Pagos (Yape / Plin)">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Número Yape" value={yapeNumber} onChange={setYapeNumber} placeholder="+51 9xx xxx xxx" />
          <ImageField
            label="QR Yape"
            path={yapeQrPath}
            onUploaded={setYapeQrPath}
            onRemove={() => setYapeQrPath(null)}
          />
        </div>
      </Section>

      <Section title="Envío (delivery La Molina)">
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Tarifa de delivery (S/)"
            value={deliveryFee}
            onChange={setDeliveryFee}
            placeholder="12.00"
          />
          <Field
            label="Envío gratis desde (S/) — vacío para desactivar"
            value={freeShippingThreshold}
            onChange={setFreeShippingThreshold}
            placeholder="150.00"
          />
        </div>
      </Section>

      <Section title="Banners">
        <BannerList banners={banners} onChange={setBanners} />
      </Section>

      <Section title="Textos de la tienda">
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Hero — título (vacío usa el texto por defecto)"
            value={heroTitle}
            onChange={setHeroTitle}
            placeholder="Verano 2025"
          />
          <Field
            label="Hero — subtítulo"
            value={heroSubtitle}
            onChange={setHeroSubtitle}
            placeholder="Nueva colección disponible"
          />
        </div>
        <div className="mt-3">
          <Field
            label="Franja promocional (texto bajo el hero)"
            value={promoText}
            onChange={setPromoText}
            placeholder="Envíos a toda La Molina · Pagos con Yape"
          />
        </div>
      </Section>

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={save.isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {save.isPending ? "Guardando…" : "Guardar configuración"}
        </button>
        {save.isError && <span className="text-sm text-red-600">{errorMessage(save.error)}</span>}
        {save.isSuccess && <span className="text-sm text-emerald-600">Guardado.</span>}
      </div>
    </div>
  );
}

function BannerList({
  banners,
  onChange,
}: {
  banners: Banner[];
  onChange: (b: Banner[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {banners.map((b, i) => (
          <div key={b.path} className="relative">
            <img
              src={publicUrl(b.path)}
              alt="banner"
              className={`h-20 w-36 rounded border border-slate-200 object-cover ${b.active ? "" : "opacity-40"}`}
            />
            <button
              onClick={() => onChange(banners.filter((_, j) => j !== i))}
              className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 text-slate-500 shadow hover:text-red-600"
              title="Quitar"
            >
              <X size={14} />
            </button>
            <label className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={b.active}
                onChange={(e) =>
                  onChange(banners.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))
                }
              />
              Activo
            </label>
          </div>
        ))}
      </div>
      <UploadButton
        label="Agregar banner"
        onUploaded={(path) => onChange([...banners, { path, active: true }])}
      />
    </div>
  );
}

// --- Pickup points (own CRUD, immediate) ---

function PickupPoints() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useListAdminPickupPoints();
  const [adding, setAdding] = useState(false);
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListAdminPickupPointsQueryKey() });

  return (
    <div className="mt-8 border-t border-slate-200 pt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Puntos de recojo (La Molina)
        </h2>
        <button
          onClick={() => setAdding((a) => !a)}
          className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          <Plus size={14} /> Agregar punto
        </button>
      </div>

      {adding && (
        <PickupForm
          onDone={() => {
            setAdding(false);
            invalidate();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
      {isError && <p className="text-sm text-red-600">Error: {errorMessage(error)}</p>}

      {data && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {data.items.map((p) => (
            <PickupRow key={p.id} point={p} onChanged={invalidate} />
          ))}
          {data.items.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-400">Sin puntos de recojo.</li>
          )}
        </ul>
      )}
    </div>
  );
}

function PickupRow({ point, onChanged }: { point: PickupPoint; onChanged: () => void }) {
  const update = useUpdatePickupPoint({ mutation: { onSuccess: onChanged } });
  const del = useDeletePickupPoint({ mutation: { onSuccess: onChanged } });

  return (
    <li className={`flex items-center justify-between px-4 py-3 ${point.active ? "" : "opacity-60"}`}>
      <div>
        <p className="text-sm font-medium text-slate-900">{point.name}</p>
        <p className="text-xs text-slate-500">{point.address}</p>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={point.active}
            disabled={update.isPending}
            onChange={(e) => update.mutate({ id: point.id, data: { active: e.target.checked } })}
          />
          Activo
        </label>
        <button
          onClick={() => {
            if (confirm(`¿Eliminar el punto "${point.name}"?`)) del.mutate({ id: point.id });
          }}
          disabled={del.isPending}
          className="text-slate-500 hover:text-red-600 disabled:opacity-50"
          title="Eliminar"
        >
          <Trash2 size={15} />
        </button>
        {del.isError && <span className="text-xs text-red-600">{errorMessage(del.error)}</span>}
      </div>
    </li>
  );
}

function PickupForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const create = useCreatePickupPoint({ mutation: { onSuccess: onDone } });

  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre" value={name} onChange={setName} placeholder="Punto A" />
        <Field label="Dirección" value={address} onChange={setAddress} placeholder="Av. La Molina 1234" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => create.mutate({ data: { name: name.trim(), address: address.trim() } })}
          disabled={!name.trim() || !address.trim() || create.isPending}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {create.isPending ? "Guardando…" : "Agregar"}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
        {create.isError && <span className="text-sm text-red-600">{errorMessage(create.error)}</span>}
      </div>
    </div>
  );
}

// --- Shared bits ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-500">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
      />
    </div>
  );
}

function ImageField({
  label,
  path,
  onUploaded,
  onRemove,
}: {
  label: string;
  path: string | null;
  onUploaded: (path: string) => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-500">{label}</label>
      {path ? (
        <div className="relative inline-block">
          <img src={publicUrl(path)} alt={label} className="h-24 w-24 rounded border border-slate-200 object-cover" />
          <button
            onClick={onRemove}
            className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 text-slate-500 shadow hover:text-red-600"
            title="Quitar"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <UploadButton label="Subir imagen" onUploaded={onUploaded} />
      )}
    </div>
  );
}

// Requests a signed URL, uploads the picked file to the public bucket, returns its storage path.
function UploadButton({ label, onUploaded }: { label: string; onUploaded: (path: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const signUpload = useCreateConfigMediaUploadUrl();

  async function handleFile(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const signed = await signUpload.mutateAsync({ data: { contentType: file.type } });
      const { error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .uploadToSignedUrl(signed.path, signed.token, file);
      if (error) throw error;
      onUploaded(signed.path);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        <Upload size={14} /> {busy ? "Subiendo…" : label}
      </button>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
