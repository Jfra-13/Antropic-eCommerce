import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus, RefreshCw, Upload, Download } from "lucide-react";
import {
  useListAdminProducts,
  useListCategories,
  useCreateProduct,
  useUpdateProduct,
  useCreateVariant,
  useUpdateVariant,
  useImportProducts,
  getListAdminProductsQueryKey,
  type AdminProduct,
  type AdminProductVariant,
  type ProductImportResult,
} from "@workspace/api-client-react";
import { soles, errorMessage } from "@/lib/format";

export default function Inventory() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const params = { q: q || undefined, page: 1, limit: 50 };
  const { data, isLoading, isError, error, refetch, isFetching } = useListAdminProducts(params);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() });

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Catálogo & Inventario</h1>
          <p className="text-sm text-slate-500">{data ? `${data.total} productos` : "Cargando…"}</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar producto…"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
          />
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900"
          >
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setImporting((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-white"
          >
            <Upload size={14} /> Importar CSV
          </button>
          <button
            onClick={() => setCreating((c) => !c)}
            className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Plus size={14} /> Nuevo producto
          </button>
        </div>
      </div>

      {importing && <ImportCsvPanel onImported={invalidate} />}
      {creating && <CreateProductForm onDone={() => { setCreating(false); invalidate(); }} />}

      {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
      {isError && <p className="text-sm text-red-600">Error: {errorMessage(error)}</p>}

      {data && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium w-8"></th>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium">Precio</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Activo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((p) => (
                <ProductRow
                  key={p.id}
                  product={p}
                  expanded={expanded.has(p.id)}
                  onToggle={() => toggleExpand(p.id)}
                  onChanged={invalidate}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProductRow({
  product,
  expanded,
  onToggle,
  onChanged,
}: {
  product: AdminProduct;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const updateProduct = useUpdateProduct({ mutation: { onSuccess: onChanged } });
  const lowStock = product.stockTotal <= 3;

  return (
    <>
      <tr className={product.active ? "" : "opacity-50"}>
        <td className="px-4 py-3">
          <button onClick={onToggle} className="text-slate-400 hover:text-slate-700">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td className="px-4 py-3 font-medium">{product.name}</td>
        <td className="px-4 py-3 text-slate-600">{product.categoryName}</td>
        <td className="px-4 py-3">{soles(product.price)}</td>
        <td className={`px-4 py-3 ${lowStock ? "text-amber-600 font-medium" : ""}`}>
          {product.stockTotal}
        </td>
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={product.active}
            disabled={updateProduct.isPending}
            onChange={(e) =>
              updateProduct.mutate({ id: product.id, data: { active: e.target.checked } })
            }
          />
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-slate-50 px-6 py-4">
            <VariantsPanel product={product} onChanged={onChanged} />
          </td>
        </tr>
      )}
    </>
  );
}

function VariantsPanel({ product, onChanged }: { product: AdminProduct; onChanged: () => void }) {
  return (
    <div>
      <table className="w-full text-sm mb-3">
        <thead className="text-left text-xs uppercase text-slate-400">
          <tr>
            <th className="py-1 font-medium">Talla</th>
            <th className="py-1 font-medium">Color</th>
            <th className="py-1 font-medium">SKU</th>
            <th className="py-1 font-medium">Stock</th>
            <th className="py-1 font-medium">Activo</th>
            <th className="py-1"></th>
          </tr>
        </thead>
        <tbody>
          {product.variants.map((v) => (
            <VariantRow key={v.id} variant={v} onChanged={onChanged} />
          ))}
          {product.variants.length === 0 && (
            <tr>
              <td colSpan={6} className="py-2 text-slate-400">
                Sin variantes.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <AddVariantForm productId={product.id} onChanged={onChanged} />
    </div>
  );
}

function VariantRow({ variant, onChanged }: { variant: AdminProductVariant; onChanged: () => void }) {
  const [stock, setStock] = useState(String(variant.stock));
  const update = useUpdateVariant({ mutation: { onSuccess: onChanged } });
  const dirty = stock !== String(variant.stock);

  return (
    <tr>
      <td className="py-1.5">{variant.size}</td>
      <td className="py-1.5">{variant.color}</td>
      <td className="py-1.5 font-mono text-xs text-slate-500">{variant.sku}</td>
      <td className="py-1.5">
        <input
          type="number"
          min={0}
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          className="w-20 rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-900 focus:outline-none"
        />
      </td>
      <td className="py-1.5">
        <input
          type="checkbox"
          checked={variant.active}
          disabled={update.isPending}
          onChange={(e) => update.mutate({ id: variant.id, data: { active: e.target.checked } })}
        />
      </td>
      <td className="py-1.5 text-right">
        {dirty && (
          <button
            onClick={() => update.mutate({ id: variant.id, data: { stock: Number(stock) } })}
            disabled={update.isPending}
            className="rounded bg-slate-900 px-2.5 py-1 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Guardar
          </button>
        )}
        {update.isError && (
          <div className="text-xs text-red-600">{errorMessage(update.error)}</div>
        )}
      </td>
    </tr>
  );
}

function AddVariantForm({ productId, onChanged }: { productId: string; onChanged: () => void }) {
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [sku, setSku] = useState("");
  const [stock, setStock] = useState("0");
  const create = useCreateVariant({
    mutation: {
      onSuccess: () => {
        setSize("");
        setColor("");
        setSku("");
        setStock("0");
        onChanged();
      },
    },
  });

  const canSubmit = size.trim() && color.trim() && sku.trim();

  return (
    <div className="flex items-end gap-2">
      <Field label="Talla" value={size} onChange={setSize} />
      <Field label="Color" value={color} onChange={setColor} />
      <Field label="SKU" value={sku} onChange={setSku} />
      <Field label="Stock" value={stock} onChange={setStock} type="number" />
      <button
        onClick={() =>
          create.mutate({
            id: productId,
            data: { size, color, sku, stock: Number(stock) },
          })
        }
        disabled={!canSubmit || create.isPending}
        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-50"
      >
        <Plus size={12} /> Agregar variante
      </button>
      {create.isError && <span className="text-xs text-red-600">{errorMessage(create.error)}</span>}
    </div>
  );
}

function CreateProductForm({ onDone }: { onDone: () => void }) {
  const { data: categories } = useListCategories();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const create = useCreateProduct({ mutation: { onSuccess: onDone } });

  const canSubmit = name.trim() && price.trim() && categoryId;

  return (
    <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre" value={name} onChange={setName} />
        <Field label="Precio (S/)" value={price} onChange={setPrice} />
        <div>
          <label className="block text-xs text-slate-500 mb-1">Categoría</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
          >
            <option value="">Elegir…</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Field label="Descripción" value={description} onChange={setDescription} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() =>
            create.mutate({
              data: {
                name,
                price,
                categoryId,
                description: description || null,
              },
            })
          }
          disabled={!canSubmit || create.isPending}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {create.isPending ? "Creando…" : "Crear producto"}
        </button>
        {create.isError && (
          <span className="text-sm text-red-600">{errorMessage(create.error)}</span>
        )}
        <span className="text-xs text-slate-400">
          Agregá variantes después de crear el producto.
        </span>
      </div>
    </div>
  );
}

const TEMPLATE_HEADERS = "nombre,categoria,ocasion,precio,talla,color,sku,stock,descripcion";

function ImportCsvPanel({ onImported }: { onImported: () => void }) {
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ProductImportResult | null>(null);
  const [done, setDone] = useState<ProductImportResult | null>(null);
  const importMut = useImportProducts();

  async function onFile(file: File) {
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    setDone(null);
    setPreview(null);
    const res = await importMut.mutateAsync({ data: { csv: text, dryRun: true } });
    setPreview(res);
  }

  async function runImport() {
    if (!csv) return;
    const res = await importMut.mutateAsync({ data: { csv, dryRun: false } });
    setDone(res);
    setPreview(null);
    onImported();
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_HEADERS + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-productos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50">
            <Upload size={14} /> Seleccionar archivo .csv
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
          {fileName && <span className="ml-3 text-sm text-slate-500">{fileName}</span>}
        </div>
        <button
          onClick={downloadTemplate}
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <Download size={14} /> Descargar plantilla
        </button>
      </div>

      <p className="text-xs text-slate-400 mb-3">Columnas: {TEMPLATE_HEADERS}</p>

      {importMut.isError && (
        <p className="text-sm text-red-600">{errorMessage(importMut.error)}</p>
      )}

      {preview && (
        <div className="rounded-md bg-slate-50 border border-slate-200 p-3">
          <p className="text-sm">
            {preview.total} filas · <strong>{preview.valid} válidas</strong>
            {preview.errors.length > 0 && (
              <span className="text-amber-600"> · {preview.errors.length} con error</span>
            )}
          </p>
          {preview.errors.length > 0 && (
            <ul className="mt-2 max-h-40 overflow-auto text-xs text-red-600">
              {preview.errors.map((e, i) => (
                <li key={i}>
                  Fila {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={runImport}
            disabled={preview.valid === 0 || importMut.isPending}
            className="mt-3 rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {importMut.isPending ? "Importando…" : `Importar ${preview.valid} válidas`}
          </button>
        </div>
      )}

      {done && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
          Importadas {done.imported} filas.
          {done.errors.length > 0 && ` ${done.errors.length} con error.`}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
      />
    </div>
  );
}
