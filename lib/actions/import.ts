"use server";

import { getAuthUser } from "./auth";
import { createLead } from "./leads";
import type { ActionResult } from "./types";

interface CSVRow {
  firstName?: string;
  lastName?: string;
  linkedinUrl: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  tags?: string[];
}

interface ImportResult {
  imported: number;
  duplicates: number;
  errors: Array<{ row: number; error: string }>;
}

export async function importLeadsFromCSV(
  rows: CSVRow[]
): Promise<ActionResult<ImportResult>> {
  try {
    await getAuthUser(); // Verify auth

    const result: ImportResult = { imported: 0, duplicates: 0, errors: [] };
    const batchId = `csv_${new Date().toISOString()}`;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Validate required fields
      if (!row.linkedinUrl) {
        result.errors.push({
          row: i + 1,
          error: "Champ requis manquant (linkedinUrl)",
        });
        continue;
      }

      // createLead already handles anti-doublon via linkedin_url
      const createResult = await createLead({
        firstName: row.firstName,
        lastName: row.lastName,
        linkedinUrl: row.linkedinUrl,
        title: row.title,
        company: row.company,
        email: row.email,
        phone: row.phone,
        tags: row.tags,
        enrichmentData: { _source: "csv", _import_batch: batchId },
      });

      if (createResult.success) {
        result.imported++;
      } else {
        if (createResult.error?.includes("existe d\u00e9j\u00e0")) {
          result.duplicates++;
        } else {
          result.errors.push({ row: i + 1, error: createResult.error });
        }
      }
    }

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
