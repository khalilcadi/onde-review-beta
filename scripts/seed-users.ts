/**
 * Seed script for creating the 3 initial users in Supabase.
 *
 * USAGE:
 *   npx tsx scripts/seed-users.ts
 *
 * PREREQUISITES:
 *   - .env.local must contain NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   - The Supabase project must have the migration applied (profiles table with trigger)
 *
 * IMPORTANT:
 *   - This script uses the service_role key (admin) to create users without email verification
 *   - Run this only once in a fresh project
 *   - Change the passwords before deploying to production!
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 3 initial users - CHANGE PASSWORDS BEFORE PRODUCTION
const USERS = [
  {
    email: "khalil@prospector.app",
    password: "Prospector2026!",
    full_name: "Khalil",
  },
  {
    email: "ludwig@prospector.app",
    password: "Prospector2026!",
    full_name: "Ludwig",
  },
  {
    email: "samy@prospector.app",
    password: "Prospector2026!",
    full_name: "Samy",
  },
];

async function seedUsers() {
  console.log("Creating initial users...\n");

  for (const user of USERS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true, // Skip email verification
      user_metadata: { full_name: user.full_name },
    });

    if (error) {
      if (error.message.includes("already been registered")) {
        console.log(`  [SKIP] ${user.email} - already exists`);
      } else {
        console.error(`  [ERROR] ${user.email} - ${error.message}`);
      }
    } else {
      console.log(`  [OK] ${user.email} (id: ${data.user.id})`);
    }
  }

  console.log("\nDone! Users can log in at /login with email + password.");
  console.log(
    "Note: The handle_new_user() trigger will auto-create profiles."
  );
}

seedUsers().catch(console.error);
