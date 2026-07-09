import type { DashboardSummary, SalesReport } from "@workspace/api-zod";
import { toCents, fromCents } from "../../lib/money";
import {
  selectTopProducts,
  selectTopProductsRange,
  selectDashboardTotals,
  selectRangeTotals,
  selectSalesByDay,
  selectAbandonedCarts,
} from "./queries";

const TOP_LIMIT = 5;

// Percent change today-vs-yesterday. Null when the baseline is zero (no honest ratio exists).
function deltaPct(today: string, yesterday: string): number | null {
  const prev = toCents(yesterday);
  if (prev === 0) return null;
  const cur = toCents(today);
  return Math.round(((cur - prev) / prev) * 1000) / 10; // one decimal
}

function avgTicket(revenue: string, orders: number): string {
  return orders === 0 ? "0.00" : fromCents(Math.round(toCents(revenue) / orders));
}

export async function getDashboard(): Promise<DashboardSummary> {
  const [totals, topProducts] = await Promise.all([
    selectDashboardTotals(),
    selectTopProducts(7, TOP_LIMIT),
  ]);

  return {
    kpis: {
      salesToday: totals.salesToday,
      salesTodayDeltaPct: deltaPct(totals.salesToday, totals.salesYesterday),
      ordersToday: totals.ordersToday,
      ordersTodayDelta: totals.ordersToday - totals.ordersYesterday,
      avgTicket: totals.avgTicket,
    },
    alerts: {
      pendingPayments: totals.pendingPayments,
      abandonedCarts: totals.abandonedCarts,
      lowStock: totals.lowStock,
      newReturns: totals.newReturns,
    },
    topProducts,
  };
}

// yyyy-mm-dd for a Date in UTC. Range defaults: last 30 days through today.
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function resolveRange(from?: string, to?: string): { from: string; to: string } {
  const today = isoDate(new Date());
  const ago = new Date();
  ago.setUTCDate(ago.getUTCDate() - 30);
  return { from: from ?? isoDate(ago), to: to ?? today };
}

export async function getSalesReport(fromArg?: string, toArg?: string): Promise<SalesReport> {
  const { from, to } = resolveRange(fromArg, toArg);

  const [totals, salesByDay, topProducts, abandoned] = await Promise.all([
    selectRangeTotals(from, to),
    selectSalesByDay(from, to),
    selectTopProductsRange(from, to, TOP_LIMIT),
    selectAbandonedCarts(),
  ]);

  // Funnel proxy: paid orders / carts that held items. NOT visit-based (no traffic tracking yet).
  const cartConversionRate =
    totals.cartsWithItems === 0
      ? null
      : Math.round((totals.orders / totals.cartsWithItems) * 1000) / 10;

  return {
    from,
    to,
    orders: totals.orders,
    revenue: totals.revenue,
    avgTicket: avgTicket(totals.revenue, totals.orders),
    unitsSold: totals.unitsSold,
    cartConversionRate,
    salesByDay,
    topProducts,
    abandonedCarts: abandoned,
  };
}
