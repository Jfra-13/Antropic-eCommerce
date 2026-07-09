import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// Reporting is read-only aggregation. These queries use explicit SQL (not the Drizzle query
// builder) because GROUP BY / date-series / funnel math read far clearer as one SQL statement.
// Money columns are numeric(10,2); to_char guarantees a "1234.00" string the money DTOs expect.

// Active variants below this stock count raise the dashboard "low stock" alert (mockup: < 3).
export const LOW_STOCK_THRESHOLD = 3;
// A cart with items untouched for this long counts as abandoned.
const ABANDONED_HOURS = 24;

const MONEY = (expr: string) => sql.raw(`to_char(coalesce(${expr}, 0), 'FM999999990.00')`);

export type TopProductRow = { productName: string; quantity: number; revenue: string };

// Best sellers from PAID orders within the last `days` days, by units sold.
export async function selectTopProducts(days: number, limit: number): Promise<TopProductRow[]> {
  const res = await db.execute<{ product_name: string; quantity: number; revenue: string }>(sql`
    select oi.product_name,
           sum(oi.quantity)::int as quantity,
           ${MONEY("sum(oi.line_total)")} as revenue
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.payment_status = 'pagado'
      and o.approved_at >= now() - (${days} || ' days')::interval
    group by oi.product_name
    order by quantity desc
    limit ${limit}
  `);
  return res.rows.map((r) => ({
    productName: r.product_name,
    quantity: r.quantity,
    revenue: r.revenue,
  }));
}

export type DashboardTotals = {
  salesToday: string;
  salesYesterday: string;
  ordersToday: number;
  ordersYesterday: number;
  avgTicket: string;
  pendingPayments: number;
  abandonedCarts: number;
  lowStock: number;
  newReturns: number;
};

// One round-trip for every dashboard scalar. Day boundaries use the DB clock.
export async function selectDashboardTotals(): Promise<DashboardTotals> {
  const res = await db.execute<Record<keyof DashboardTotals, string>>(sql`
    select
      ${MONEY(
        "sum(o.total) filter (where o.payment_status = 'pagado' and o.approved_at::date = current_date)",
      )} as "salesToday",
      ${MONEY(
        "sum(o.total) filter (where o.payment_status = 'pagado' and o.approved_at::date = current_date - 1)",
      )} as "salesYesterday",
      count(*) filter (where o.created_at::date = current_date)::int as "ordersToday",
      count(*) filter (where o.created_at::date = current_date - 1)::int as "ordersYesterday",
      ${MONEY(
        "avg(o.total) filter (where o.payment_status = 'pagado' and o.approved_at >= now() - interval '30 days')",
      )} as "avgTicket",
      count(*) filter (where o.payment_status = 'en_verificacion')::int as "pendingPayments"
    from orders o
  `);
  const base = res.rows[0]!;

  const alerts = await db.execute<{ abandoned: number; low_stock: number; new_returns: number }>(sql`
    select
      (select count(*)::int from carts c
         where c.updated_at < now() - (${ABANDONED_HOURS} || ' hours')::interval
           and exists (select 1 from cart_items ci where ci.cart_id = c.id)) as abandoned,
      (select count(*)::int from product_variants v
         where v.active = true and v.stock < ${LOW_STOCK_THRESHOLD}) as low_stock,
      (select count(*)::int from return_tickets t where t.status = 'nueva') as new_returns
  `);
  const a = alerts.rows[0]!;

  return {
    salesToday: base.salesToday,
    salesYesterday: base.salesYesterday,
    ordersToday: Number(base.ordersToday),
    ordersYesterday: Number(base.ordersYesterday),
    avgTicket: base.avgTicket,
    pendingPayments: Number(base.pendingPayments),
    abandonedCarts: a.abandoned,
    lowStock: a.low_stock,
    newReturns: a.new_returns,
  };
}

export type RangeTotals = {
  orders: number;
  revenue: string;
  unitsSold: number;
  cartsWithItems: number;
};

// Paid-order totals for a [from, to] date range (inclusive), keyed on approval date.
// Revenue/orders come from `orders` (one row each); units are summed separately to avoid
// the fan-out that joining order_items would cause.
export async function selectRangeTotals(from: string, to: string): Promise<RangeTotals> {
  const res = await db.execute<{ orders: number; revenue: string; units: number }>(sql`
    select
      (select count(*)::int from orders o
         where o.payment_status = 'pagado'
           and o.approved_at::date between ${from}::date and ${to}::date) as orders,
      (select ${MONEY("sum(o.total)")} from orders o
         where o.payment_status = 'pagado'
           and o.approved_at::date between ${from}::date and ${to}::date) as revenue,
      (select coalesce(sum(oi.quantity), 0)::int
         from order_items oi
         join orders o on o.id = oi.order_id
         where o.payment_status = 'pagado'
           and o.approved_at::date between ${from}::date and ${to}::date) as units
  `);
  const row = res.rows[0]!;

  // Distinct carts that held items and were active in the range — funnel denominator.
  const carts = await db.execute<{ carts: number }>(sql`
    select count(distinct c.id)::int as carts
    from carts c
    where c.updated_at::date between ${from}::date and ${to}::date
      and exists (select 1 from cart_items ci where ci.cart_id = c.id)
  `);

  return {
    orders: row.orders,
    revenue: row.revenue,
    unitsSold: row.units,
    cartsWithItems: carts.rows[0]!.carts,
  };
}

export type SalesByDayRow = { date: string; revenue: string; orders: number };

// Daily paid revenue/order counts across the whole range, zero-filled for empty days.
export async function selectSalesByDay(from: string, to: string): Promise<SalesByDayRow[]> {
  const res = await db.execute<{ date: string; revenue: string; orders: number }>(sql`
    select to_char(d.day, 'YYYY-MM-DD') as date,
           ${MONEY("sum(o.total)")} as revenue,
           count(o.id)::int as orders
    from generate_series(${from}::date, ${to}::date, interval '1 day') d(day)
    left join orders o
      on o.payment_status = 'pagado' and o.approved_at::date = d.day
    group by d.day
    order by d.day
  `);
  return res.rows.map((r) => ({ date: r.date, revenue: r.revenue, orders: r.orders }));
}

// Top sellers within an explicit [from, to] range.
export async function selectTopProductsRange(
  from: string,
  to: string,
  limit: number,
): Promise<TopProductRow[]> {
  const res = await db.execute<{ product_name: string; quantity: number; revenue: string }>(sql`
    select oi.product_name,
           sum(oi.quantity)::int as quantity,
           ${MONEY("sum(oi.line_total)")} as revenue
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.payment_status = 'pagado'
      and o.approved_at::date between ${from}::date and ${to}::date
    group by oi.product_name
    order by quantity desc
    limit ${limit}
  `);
  return res.rows.map((r) => ({
    productName: r.product_name,
    quantity: r.quantity,
    revenue: r.revenue,
  }));
}

export type AbandonedCartsRow = { count: number; value: string; recoverable: number };

// Current abandoned carts (snapshot, not range-bound): items present, untouched > 24h.
// value = live cart worth; recoverable = abandoners who have never placed any order.
export async function selectAbandonedCarts(): Promise<AbandonedCartsRow> {
  const res = await db.execute<{ count: number; value: string; recoverable: number }>(sql`
    with abandoned as (
      select c.id, c.user_id
      from carts c
      where c.updated_at < now() - (${ABANDONED_HOURS} || ' hours')::interval
        and exists (select 1 from cart_items ci where ci.cart_id = c.id)
    )
    select
      (select count(*)::int from abandoned) as count,
      ${MONEY(`(
        select sum(ci.quantity * coalesce(v.price_override, p.price))
        from cart_items ci
        join abandoned a on a.id = ci.cart_id
        join product_variants v on v.id = ci.variant_id
        join products p on p.id = v.product_id
      )`)} as value,
      (select count(*)::int from abandoned a
         where not exists (select 1 from orders o where o.user_id = a.user_id)) as recoverable
  `);
  return res.rows[0]!;
}
