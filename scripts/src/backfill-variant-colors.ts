// One-off: set color_hex for the seed catalog's named colors. New variants get their hex
// from the admin color picker; this only fills rows created before the column existed.
//
// Run: pnpm --filter @workspace/scripts run backfill-colors
import { pool } from "@workspace/db";

const SEED_COLOR_HEX: Record<string, string> = {
  Rosa: "#F29CBD",
  Coral: "#EF7853",
  Dorado: "#FCC261",
  Fucsia: "#EA4C75",
  Blanco: "#FFFFFF",
  Negro: "#2b2b2b",
  Denim: "#4a6fa5",
};

async function main() {
  for (const [name, hex] of Object.entries(SEED_COLOR_HEX)) {
    const result = await pool.query(
      "UPDATE product_variants SET color_hex = $1 WHERE color = $2 AND color_hex IS NULL",
      [hex, name],
    );
    console.log(`${name} -> ${hex}: ${result.rowCount} variant(s)`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
