// Manual run:  npm run backfill   (BACKFILL_LIMIT=20000 for more history)
import { backfill } from "../src/backfill.js";
const n = await backfill(Number(process.env.BACKFILL_LIMIT || 5000));
console.log(`Klaar: ${n} meldingen geïmporteerd.`);
