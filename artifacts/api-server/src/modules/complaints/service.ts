import type { Complaint } from "@workspace/db";
import type {
  ComplaintReceipt,
  AdminComplaint as AdminComplaintDto,
  AdminComplaintList as AdminComplaintListDto,
  CreateComplaintInput,
} from "@workspace/api-zod";
import * as notifications from "../notifications/service";
import { complaintCode } from "./mappers";
import {
  insertComplaint,
  listComplaints,
  getAdminComplaintById,
  respondToComplaint,
  type AdminComplaintRow,
} from "./queries";

// D.S. 011-2011-PCM: the provider has 30 calendar days — not working days — to answer.
// Named because a magic 30 buried in a date calculation is how a legal deadline quietly
// becomes wrong.
const LEGAL_RESPONSE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ComplaintStatus = Complaint["status"];
type ComplaintType = Complaint["type"];

function dueDateFrom(filedAt: Date): Date {
  return new Date(filedAt.getTime() + LEGAL_RESPONSE_DAYS * MS_PER_DAY);
}

// Whole calendar days left to answer. Negative once the deadline has passed, which the
// backoffice renders as overdue rather than hiding.
function daysRemaining(dueAt: Date): number {
  return Math.ceil((dueAt.getTime() - Date.now()) / MS_PER_DAY);
}

function toReceipt(row: Complaint): ComplaintReceipt {
  return {
    id: row.id,
    code: complaintCode(row.complaintNumber),
    complaintNumber: row.complaintNumber,
    type: row.type,
    status: row.status,
    consumerEmail: row.consumerEmail,
    dueAt: row.dueAt,
    createdAt: row.createdAt,
  };
}

function toAdminDto(row: AdminComplaintRow): AdminComplaintDto {
  const c = row.complaint;
  return {
    id: c.id,
    code: complaintCode(c.complaintNumber),
    complaintNumber: c.complaintNumber,
    type: c.type,
    consumerName: c.consumerName,
    consumerDocumentType: c.consumerDocumentType,
    consumerDocumentNumber: c.consumerDocumentNumber,
    consumerEmail: c.consumerEmail,
    consumerPhone: c.consumerPhone,
    consumerAddress: c.consumerAddress,
    isMinor: c.isMinor,
    guardianName: c.guardianName,
    itemType: c.itemType,
    itemDescription: c.itemDescription,
    itemAmount: c.itemAmount,
    orderId: c.orderId,
    orderNumber: row.orderNumber,
    detail: c.detail,
    request: c.request,
    status: c.status,
    response: c.response,
    respondedAt: c.respondedAt,
    dueAt: c.dueAt,
    daysRemaining: daysRemaining(c.dueAt),
    createdAt: c.createdAt,
  };
}

export type CreateComplaintResult =
  | { ok: true; receipt: ComplaintReceipt }
  | { ok: false; status: number; code: string; message: string };

// Files a complaint. Public and unauthenticated by design (see the router); `userId` is only
// filled in when the person happens to be signed in, and is never required.
export async function createComplaint(
  input: CreateComplaintInput,
  userId: string | null,
): Promise<CreateComplaintResult> {
  // A minor cannot file on their own behalf — the reglamento requires the parent or guardian
  // to be named. Enforced server-side because a form checkbox is not a legal control.
  if (input.isMinor && !input.guardianName?.trim()) {
    return {
      ok: false,
      status: 422,
      code: "GUARDIAN_REQUIRED",
      message: "A complaint filed for a minor must name the parent or guardian",
    };
  }

  const now = new Date();
  const complaint = await insertComplaint({
    type: input.type,
    consumerName: input.consumerName.trim(),
    consumerDocumentType: input.consumerDocumentType,
    consumerDocumentNumber: input.consumerDocumentNumber.trim(),
    consumerEmail: input.consumerEmail.trim(),
    consumerPhone: input.consumerPhone ?? null,
    consumerAddress: input.consumerAddress ?? null,
    isMinor: input.isMinor,
    guardianName: input.guardianName?.trim() ?? null,
    itemType: input.itemType,
    itemDescription: input.itemDescription.trim(),
    itemAmount: input.itemAmount ?? null,
    orderId: input.orderId ?? null,
    userId,
    detail: input.detail.trim(),
    request: input.request.trim(),
    dueAt: dueDateFrom(now),
  });

  // The reglamento requires the consumer to be left with a constancia. Best-effort like every
  // other notification: a mail outage must not swallow a filing that is already recorded.
  void notifications.notifyComplaintFiled(complaint);
  void notifications.notifyAdminNewComplaint(complaint);

  return { ok: true, receipt: toReceipt(complaint) };
}

export async function getComplaints(
  status: ComplaintStatus | undefined,
  type: ComplaintType | undefined,
  page: number,
  limit: number,
): Promise<AdminComplaintListDto> {
  const { rows, total } = await listComplaints(status, type, page, limit);
  return { items: rows.map(toAdminDto), total, page, limit };
}

export type RespondResult =
  | { ok: true; complaint: AdminComplaintDto }
  | { ok: false; status: number; code: string; message: string };

export async function respond(
  id: string,
  status: ComplaintStatus,
  response: string | null,
  respondedBy: string,
): Promise<RespondResult> {
  const updated = await respondToComplaint(id, status, response, respondedBy);
  if (!updated) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Complaint not found" };
  }
  const row = await getAdminComplaintById(id);
  if (!row) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Complaint not found" };
  }
  // Tell the consumer what the business decided, but only when there is something to tell.
  if (response !== null) void notifications.notifyComplaintAnswered(row.complaint);
  return { ok: true, complaint: toAdminDto(row) };
}
