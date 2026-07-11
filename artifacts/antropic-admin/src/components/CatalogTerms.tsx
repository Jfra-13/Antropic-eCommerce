import { useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import {
  useListCategories,
  useListOccasions,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useCreateOccasion,
  useUpdateOccasion,
  useDeleteOccasion,
  getListCategoriesQueryKey,
  getListOccasionsQueryKey,
  type Category,
} from "@workspace/api-client-react";
import { errorMessage, errorCode } from "@/lib/format";

// Category and Occasion share the exact same DTO shape, so one generic list serves both.
type Term = Category;
type TermPatch = { name?: string; active?: boolean; sortOrder?: number };

export default function CatalogTerms() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <CategoryList />
      <OccasionList />
    </div>
  );
}

function CategoryList() {
  const queryClient = useQueryClient();
  // includeInactive: deactivated categories must stay listed so they can be reactivated.
  const { data, isLoading, isError, error } = useListCategories({
    includeEmpty: true,
    includeInactive: true,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
  const create = useCreateCategory({ mutation: { onSuccess: invalidate } });
  const update = useUpdateCategory({ mutation: { onSuccess: invalidate } });
  const del = useDeleteCategory({ mutation: { onSuccess: invalidate } });

  return (
    <TermList
      title="Categorías"
      referencedCopy="Esta categoría tiene productos asociados, por lo que no puede eliminarse. Podés desactivarla: deja de mostrarse en la tienda pero conserva sus productos."
      items={data}
      isLoading={isLoading}
      loadError={isError ? error : null}
      onCreate={(name) => create.mutate({ data: { name } })}
      createPending={create.isPending}
      createError={create.isError ? create.error : null}
      onUpdate={(id, patch) => update.mutate({ id, data: patch })}
      updatePending={update.isPending}
      updateError={update.isError ? update.error : null}
      onDelete={(id) => del.mutateAsync({ id }).then(() => true, () => false)}
      deletePending={del.isPending}
      deleteError={del.isError ? del.error : null}
      resetDelete={() => del.reset()}
    />
  );
}

function OccasionList() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useListOccasions({ includeInactive: true });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListOccasionsQueryKey() });
  const create = useCreateOccasion({ mutation: { onSuccess: invalidate } });
  const update = useUpdateOccasion({ mutation: { onSuccess: invalidate } });
  const del = useDeleteOccasion({ mutation: { onSuccess: invalidate } });

  return (
    <TermList
      title="Ocasiones"
      referencedCopy="Esta ocasión está asignada a productos, por lo que no puede eliminarse. Podés desactivarla: deja de mostrarse en la tienda pero conserva sus asignaciones."
      items={data}
      isLoading={isLoading}
      loadError={isError ? error : null}
      onCreate={(name) => create.mutate({ data: { name } })}
      createPending={create.isPending}
      createError={create.isError ? create.error : null}
      onUpdate={(id, patch) => update.mutate({ id, data: patch })}
      updatePending={update.isPending}
      updateError={update.isError ? update.error : null}
      onDelete={(id) => del.mutateAsync({ id }).then(() => true, () => false)}
      deletePending={del.isPending}
      deleteError={del.isError ? del.error : null}
      resetDelete={() => del.reset()}
    />
  );
}

// --- Generic term list (create, rename inline, activate, sortOrder, delete w/ 409 flow) ---

function TermList({
  title,
  referencedCopy,
  items,
  isLoading,
  loadError,
  onCreate,
  createPending,
  createError,
  onUpdate,
  updatePending,
  updateError,
  onDelete,
  deletePending,
  deleteError,
  resetDelete,
}: {
  title: string;
  referencedCopy: string;
  items: Term[] | undefined;
  isLoading: boolean;
  loadError: unknown;
  onCreate: (name: string) => void;
  createPending: boolean;
  createError: unknown;
  onUpdate: (id: string, patch: TermPatch) => void;
  updatePending: boolean;
  updateError: unknown;
  onDelete: (id: string) => Promise<boolean>;
  deletePending: boolean;
  deleteError: unknown;
  resetDelete: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<Term | null>(null);

  function submitCreate() {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName("");
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>

      <div className="mb-3 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitCreate()}
          placeholder="Nombre…"
          className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
        />
        <button
          onClick={submitCreate}
          disabled={!newName.trim() || createPending}
          className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <Plus size={14} /> Crear
        </button>
      </div>
      {createError != null && (
        <p className="mb-2 text-xs text-red-600">{errorMessage(createError)}</p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Cargando…</p>}
      {loadError != null && (
        <p className="text-sm text-red-600">Error: {errorMessage(loadError)}</p>
      )}

      {items && (
        <ul className="divide-y divide-slate-100">
          {items.map((t) => (
            <TermRow
              key={t.id}
              term={t}
              onUpdate={onUpdate}
              updatePending={updatePending}
              onDeleteClick={() => {
                resetDelete();
                setDeleting(t);
              }}
            />
          ))}
          {items.length === 0 && (
            <li className="py-4 text-center text-sm text-slate-400">Sin registros.</li>
          )}
        </ul>
      )}
      {updateError != null && (
        <p className="mt-2 text-xs text-red-600">{errorMessage(updateError)}</p>
      )}

      {deleting && (
        <DeleteTermDialog
          term={deleting}
          referencedCopy={referencedCopy}
          onDelete={async () => {
            if (await onDelete(deleting.id)) setDeleting(null);
          }}
          deletePending={deletePending}
          deleteError={deleteError}
          onDeactivate={() => {
            onUpdate(deleting.id, { active: false });
            setDeleting(null);
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function TermRow({
  term,
  onUpdate,
  updatePending,
  onDeleteClick,
}: {
  term: Term;
  onUpdate: (id: string, patch: TermPatch) => void;
  updatePending: boolean;
  onDeleteClick: () => void;
}) {
  const [name, setName] = useState(term.name);
  const [sortOrder, setSortOrder] = useState(String(term.sortOrder));
  const dirty = name.trim() !== term.name || sortOrder !== String(term.sortOrder);

  return (
    <li className={`flex items-center gap-2 py-2 ${term.active ? "" : "opacity-50"}`}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="min-w-0 flex-1 rounded border border-transparent px-2 py-1 text-sm hover:border-slate-200 focus:border-slate-900 focus:outline-none"
      />
      <input
        type="number"
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
        title="Orden"
        className="w-16 rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-900 focus:outline-none"
      />
      <label className="flex items-center gap-1 text-xs text-slate-500" title="Visible en la tienda">
        <input
          type="checkbox"
          checked={term.active}
          disabled={updatePending}
          onChange={(e) => onUpdate(term.id, { active: e.target.checked })}
        />
        Activa
      </label>
      {dirty && (
        <button
          onClick={() =>
            onUpdate(term.id, {
              name: name.trim() || term.name,
              sortOrder: Number(sortOrder) || 0,
            })
          }
          disabled={updatePending || !name.trim()}
          className="rounded bg-slate-900 px-2.5 py-1 text-xs text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Guardar
        </button>
      )}
      <button
        onClick={onDeleteClick}
        className="text-slate-400 hover:text-red-600"
        title="Eliminar"
      >
        <Trash2 size={15} />
      </button>
    </li>
  );
}

// Delete flow mirrors products: hard-delete when unreferenced; a 409 REFERENCED flips the
// dialog into offering deactivation instead.
function DeleteTermDialog({
  term,
  referencedCopy,
  onDelete,
  deletePending,
  deleteError,
  onDeactivate,
  onClose,
}: {
  term: Term;
  referencedCopy: string;
  onDelete: () => void;
  deletePending: boolean;
  deleteError: unknown;
  onDeactivate: () => void;
  onClose: () => void;
}) {
  const referenced = deleteError != null && errorCode(deleteError) === "REFERENCED";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Eliminar — {term.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={16} />
          </button>
        </div>

        {!referenced ? (
          <>
            <p className="text-sm text-slate-600">
              Se eliminará definitivamente. Esta acción no se puede deshacer.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={onDelete}
                disabled={deletePending}
                className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletePending ? "Eliminando…" : "Eliminar definitivamente"}
              </button>
              <button
                onClick={onClose}
                className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              {deleteError != null && (
                <span className="text-sm text-red-600">{errorMessage(deleteError)}</span>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">{referencedCopy}</p>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={onDeactivate}
                className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                Desactivar
              </button>
              <button
                onClick={onClose}
                className="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
