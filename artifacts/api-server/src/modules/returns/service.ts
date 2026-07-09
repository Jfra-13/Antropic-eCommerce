import type { ReturnTicket } from "@workspace/db";
import type {
  ReturnTicket as ReturnTicketDto,
  AdminReturn as AdminReturnDto,
  AdminReturnList as AdminReturnListDto,
  CreateReturnInput,
} from "@workspace/api-zod";
import {
  orderBelongsToUser,
  insertReturnTicket,
  listReturns,
  getAdminReturnById,
  updateReturnStatusRow,
  type AdminReturnRow,
} from "./queries";

type ReturnStatus = ReturnTicket["status"];

function toReturnTicketDto(row: ReturnTicket): ReturnTicketDto {
  return {
    id: row.id,
    ticketNumber: row.ticketNumber,
    orderId: row.orderId,
    userId: row.userId,
    reason: row.reason,
    currentSize: row.currentSize,
    desiredSize: row.desiredSize,
    photoPath: row.photoPath,
    status: row.status,
    createdAt: row.createdAt,
  };
}

function toAdminReturnDto(row: AdminReturnRow): AdminReturnDto {
  return {
    id: row.ticket.id,
    ticketNumber: row.ticket.ticketNumber,
    orderId: row.ticket.orderId,
    orderNumber: row.orderNumber,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerPhone: row.customerPhone,
    reason: row.ticket.reason,
    currentSize: row.ticket.currentSize,
    desiredSize: row.ticket.desiredSize,
    photoPath: row.ticket.photoPath,
    status: row.ticket.status,
    createdAt: row.ticket.createdAt,
  };
}

export type CreateReturnResult =
  | { ok: true; ticket: ReturnTicketDto }
  | { ok: false; status: number; code: string; message: string };

// Customer opens a return ticket (requerimientos §7.6). Guarded to their own order.
export async function createReturn(
  userId: string,
  input: CreateReturnInput,
): Promise<CreateReturnResult> {
  if (!(await orderBelongsToUser(input.orderId, userId))) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Order not found" };
  }
  const ticket = await insertReturnTicket({
    orderId: input.orderId,
    userId,
    reason: input.reason ?? null,
    currentSize: input.currentSize ?? null,
    desiredSize: input.desiredSize ?? null,
    photoPath: input.photoPath ?? null,
  });
  return { ok: true, ticket: toReturnTicketDto(ticket) };
}

export async function getReturns(
  status: ReturnStatus | undefined,
  page: number,
  limit: number,
): Promise<AdminReturnListDto> {
  const { rows, total } = await listReturns(status, page, limit);
  return { items: rows.map(toAdminReturnDto), total, page, limit };
}

export type UpdateReturnResult =
  | { ok: true; ticket: AdminReturnDto }
  | { ok: false; status: number; code: string; message: string };

export async function updateReturnStatus(
  id: string,
  status: ReturnStatus,
): Promise<UpdateReturnResult> {
  const updated = await updateReturnStatusRow(id, status);
  if (!updated) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Return ticket not found" };
  }
  const row = await getAdminReturnById(id);
  if (!row) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Return ticket not found" };
  }
  return { ok: true, ticket: toAdminReturnDto(row) };
}
