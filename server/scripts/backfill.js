// Manual run:  npm run backfill   (BACKFILL_LIMIT=1000 for more)
import { backfill } from "../src/backfill.js";
const n = await backfill(Number(process.env.BACKFILL_LIMIT || 400));
console.log(`Klaar: ${n} meldingen geïmporteerd.`);
