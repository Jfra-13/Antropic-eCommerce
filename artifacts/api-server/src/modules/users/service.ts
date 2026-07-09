import type { Profile } from "@workspace/db";
import type {
  AdminUser as AdminUserDto,
  AdminUserList as AdminUserListDto,
  CreateEmployeeInput,
  UpdateUserInput,
} from "@workspace/api-zod";
import { createAuthUser } from "../../lib/auth-admin";
import {
  listProfiles,
  insertProfile,
  getProfileById,
  updateProfileRow,
} from "./queries";

type Role = Profile["role"];

function toAdminUserDto(p: Profile): AdminUserDto {
  return {
    id: p.id,
    email: p.email,
    fullName: p.fullName,
    phone: p.phone,
    role: p.role,
    blocked: p.blocked,
    createdAt: p.createdAt,
  };
}

export type CreateEmployeeResult =
  | { ok: true; user: AdminUserDto }
  | { ok: false; status: number; code: string; message: string };

// Provisions the auth user first, then the profile row with role=employee. On first login the
// auth middleware finds this profile (by id) and keeps the employee role.
// ponytail: if the profile insert fails after the auth user is created, the auth user is
// orphaned (would bootstrap as a customer on login). Acceptable; add a delete-on-rollback if it
// ever matters.
export async function createEmployee(input: CreateEmployeeInput): Promise<CreateEmployeeResult> {
  const created = await createAuthUser(input.email);
  if (!created.ok) {
    if (created.conflict) {
      return { ok: false, status: 409, code: "EMAIL_TAKEN", message: "Email already registered" };
    }
    return { ok: false, status: 502, code: "AUTH_PROVISION_FAILED", message: created.message };
  }

  const profile = await insertProfile({
    id: created.id,
    email: created.email,
    fullName: input.fullName ?? null,
    phone: input.phone ?? null,
    role: "employee",
  });
  return { ok: true, user: toAdminUserDto(profile) };
}

export async function getUsers(
  role: Role | undefined,
  q: string | undefined,
  page: number,
  limit: number,
): Promise<AdminUserListDto> {
  const { rows, total } = await listProfiles(role, q, page, limit);
  return { items: rows.map(toAdminUserDto), total, page, limit };
}

export type UpdateUserResult =
  | { ok: true; user: AdminUserDto }
  | { ok: false; status: number; code: string; message: string };

// An admin cannot change their OWN role or blocked flag (that would let them lock themselves
// out or drop their own privileges by accident). Editing own name/phone is fine.
export async function updateUser(
  actingUserId: string,
  id: string,
  input: UpdateUserInput,
): Promise<UpdateUserResult> {
  const touchesPrivilege = input.role !== undefined || input.blocked !== undefined;
  if (id === actingUserId && touchesPrivilege) {
    return {
      ok: false,
      status: 400,
      code: "SELF_MODIFY",
      message: "Cannot modify your own role or blocked status",
    };
  }

  const patch: Record<string, unknown> = {};
  if (input.fullName !== undefined) patch["fullName"] = input.fullName;
  if (input.phone !== undefined) patch["phone"] = input.phone;
  if (input.role !== undefined) patch["role"] = input.role;
  if (input.blocked !== undefined) patch["blocked"] = input.blocked;

  // Nothing to change — return current state instead of issuing an empty UPDATE.
  if (Object.keys(patch).length === 0) {
    const current = await getProfileById(id);
    if (!current) return { ok: false, status: 404, code: "NOT_FOUND", message: "User not found" };
    return { ok: true, user: toAdminUserDto(current) };
  }

  const profile = await updateProfileRow(id, patch);
  if (!profile) return { ok: false, status: 404, code: "NOT_FOUND", message: "User not found" };
  return { ok: true, user: toAdminUserDto(profile) };
}
