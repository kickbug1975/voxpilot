import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { globalSearch } from '../src/actions/search';

async function run() {
  console.log("Searching for 'amandes'...");
  const res = await globalSearch('demo-maree-belgique', 'amandes');
  console.log("Result:", JSON.stringify(res, null, 2));
}

run().catch(console.error);
