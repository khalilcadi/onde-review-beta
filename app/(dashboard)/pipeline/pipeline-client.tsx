"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  Filter,
  Plus,
  ExternalLink,
  ChevronDown,
  X,
  SlidersHorizontal,
  ArrowUpDown,
  Flame,
  Clock,
  LayoutGrid,
  List,
  GripVertical,
  MessageSquare,
  Eye,
  UserPlus,
  User,
  Upload,
  Loader2,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Zap,
  Sparkles,
  GitBranch,
  Mail,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { importLeadsFromCSV } from "@/lib/actions/import";
import {
  importLeadsFromGojiberry,
  type GojiberryImportResult,
} from "@/lib/actions/import-gojiberry";
import {
  parseGojiberryIntent,
  parseGojiberryCSVHeaders,
  mapCSVRowToGojiberry,
  type GojiberryCSVRow,
} from "@/lib/gojiberry-parser";
import { createLead, deleteLead, deleteLeads } from "@/lib/actions/leads";
import { getSequences } from "@/lib/actions/sequences";
import { addLeadToSequence } from "@/lib/actions/sequences";
import type { Sequence } from "@/types/sequences";
import type { LeadWithOwner } from "@/lib/mappers";
import { LEAD_STATUSES, LEAD_STAGES, SIGNAL_TYPES } from "@/lib/constants";

// --- CSV Parsing Utilities ---

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

const HEADER_MAP: Record<string, keyof CSVRow> = {
  // firstName
  firstname: "firstName",
  first_name: "firstName",
  prenom: "firstName",
  "prénom": "firstName",
  // lastName
  lastname: "lastName",
  last_name: "lastName",
  nom: "lastName",
  // linkedinUrl
  linkedinurl: "linkedinUrl",
  linkedin_url: "linkedinUrl",
  linkedin: "linkedinUrl",
  url: "linkedinUrl",
  // title
  title: "title",
  titre: "title",
  poste: "title",
  // company
  company: "company",
  entreprise: "company",
  "société": "company",
  societe: "company",
  // email
  email: "email",
  mail: "email",
  // phone
  phone: "phone",
  telephone: "phone",
  "téléphone": "phone",
  tel: "phone",
  // tags
  tags: "tags",
};

function detectSeparator(firstLine: string): string {
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function parseCSVLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): { rows: CSVRow[]; headers: string[]; rawPreview: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return { rows: [], headers: [], rawPreview: [] };

  const separator = detectSeparator(lines[0]);
  const rawHeaders = parseCSVLine(lines[0], separator);
  const normalizedHeaders = rawHeaders.map((h) => {
    const key = h.toLowerCase().trim();
    return HEADER_MAP[key] || null;
  });

  const rows: CSVRow[] = [];
  const rawPreview: string[][] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], separator);
    if (i <= 5) rawPreview.push(values);

    const row: Partial<CSVRow> = {};
    normalizedHeaders.forEach((header, idx) => {
      if (!header || idx >= values.length) return;
      const value = values[idx]?.trim();
      if (!value) return;

      if (header === "tags") {
        row.tags = value.split(",").map((t) => t.trim()).filter(Boolean);
      } else {
        (row as Record<string, string>)[header] = value;
      }
    });

    if (row.linkedinUrl) {
      rows.push(row as CSVRow);
    }
  }

  return { rows, headers: rawHeaders, rawPreview };
}

interface PipelineClientProps {
  initialLeads: LeadWithOwner[];
  currentUserId: string;
}

type SortField = "name" | "score" | "lastActivity" | "company";
type SortOrder = "asc" | "desc";
type ViewMode = "table" | "kanban";

interface Filters {
  status: string[];
  stage: string[];
  scoreMin: number;
  scoreMax: number;
  tags: string[];
  signalType: string[];
  importBatch: string[];
  enrichmentStatus: string[]; // "enriched" | "unenriched"
}

const STATUS_OPTIONS = [
  { value: "hot", label: "Chaud", color: "destructive" },
  { value: "warm", label: "Tiède", color: "warning" },
  { value: "cold", label: "Froid", color: "secondary" },
  { value: "converted", label: "Converti", color: "success" },
  { value: "lost", label: "Perdu", color: "secondary" },
];

const STAGE_OPTIONS = [
  { value: "to_invite", label: "À inviter" },
  { value: "invited", label: "Invitation envoyée" },
  { value: "connected", label: "Connecté" },
  { value: "in_sequence", label: "En séquence" },
  { value: "responded", label: "A répondu" },
  { value: "meeting", label: "RDV planifié" },
  { value: "closed", label: "Fermé" },
];

const KANBAN_COLUMNS = [
  { key: "to_invite", label: "À inviter", color: "bg-slate-400 dark:bg-slate-500", lightBg: "bg-muted", border: "border-border" },
  { key: "invited", label: "Invité", color: "bg-accent", lightBg: "bg-muted", border: "border-border" },
  { key: "connected", label: "Connecté", color: "bg-success", lightBg: "bg-muted", border: "border-border" },
  { key: "in_sequence", label: "En séquence", color: "bg-warning", lightBg: "bg-muted", border: "border-border" },
  { key: "responded", label: "A répondu", color: "bg-orange-500 dark:bg-orange-400", lightBg: "bg-muted", border: "border-border" },
  { key: "meeting", label: "RDV", color: "bg-destructive", lightBg: "bg-muted", border: "border-border" },
];

export default function PipelineClient({ initialLeads, currentUserId }: PipelineClientProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [filters, setFilters] = useState<Filters>({
    status: [],
    stage: [],
    scoreMin: 0,
    scoreMax: 100,
    tags: [],
    signalType: [],
    importBatch: [],
    enrichmentStatus: [],
  });

  // Add Lead state
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [addLeadLoading, setAddLeadLoading] = useState(false);
  const [newLead, setNewLead] = useState({
    firstName: "",
    lastName: "",
    linkedinUrl: "",
    title: "",
    company: "",
    email: "",
  });

  const handleAddLead = useCallback(async () => {
    if (!newLead.linkedinUrl) {
      toast.error("L&apos;URL LinkedIn est requise");
      return;
    }
    setAddLeadLoading(true);
    try {
      const result = await createLead(newLead);
      if (result.success) {
        toast.success("Lead ajouté avec succès");
        setAddLeadOpen(false);
        setNewLead({ firstName: "", lastName: "", linkedinUrl: "", title: "", company: "", email: "" });
        router.refresh();
      } else {
        toast.error(result.error || "Erreur lors de la création du lead");
      }
    } catch (err) {
      console.error("createLead error:", err);
      toast.error("Erreur serveur lors de la création du lead");
    } finally {
      setAddLeadLoading(false);
    }
  }, [newLead, router]);

  // CSV Import state
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<{
    rows: CSVRow[];
    headers: string[];
    rawPreview: string[][];
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Gojiberry Import state
  const gojiFileInputRef = useRef<HTMLInputElement>(null);
  const [gojiImportOpen, setGojiImportOpen] = useState(false);
  const [gojiFile, setGojiFile] = useState<File | null>(null);
  const [gojiPreview, setGojiPreview] = useState<{
    rows: GojiberryCSVRow[];
    signalSummary: Record<string, number>;
    totalRows: number;
  } | null>(null);
  const [isGojiImporting, setIsGojiImporting] = useState(false);

  const handleGojiFileSelect = useCallback(async (file: File) => {
    setGojiFile(file);
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      setGojiPreview(null);
      return;
    }

    const separator = lines[0].includes("\t") ? "\t" : ",";
    const headers = parseCSVLine(lines[0], separator);
    const headerMapping = parseGojiberryCSVHeaders(headers);

    // Check if this looks like a Gojiberry CSV (must have Intent + Profile URL)
    const hasIntent = headers.some((h) => h.trim().toLowerCase() === "intent");
    const hasProfileUrl = headers.some((h) => h.trim().toLowerCase() === "profile url");
    if (!hasIntent || !hasProfileUrl) {
      toast.error("Ce fichier ne semble pas provenir de Gojiberry (colonnes Intent / Profile URL manquantes)");
      setGojiPreview(null);
      return;
    }

    const rows: GojiberryCSVRow[] = [];
    const signalSummary: Record<string, number> = {};

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i], separator);
      const row = mapCSVRowToGojiberry(values, headerMapping);
      if (!row.profileUrl) continue;
      rows.push(row);

      const parsed = parseGojiberryIntent(row.intent || "", row.intentKeyword || "");
      const label = SIGNAL_TYPES[parsed.signalType as keyof typeof SIGNAL_TYPES]?.label || parsed.signalType;
      signalSummary[label] = (signalSummary[label] || 0) + 1;
    }

    setGojiPreview({ rows, signalSummary, totalRows: lines.length - 1 });
  }, []);

  const handleGojiImport = useCallback(async () => {
    if (!gojiPreview || gojiPreview.rows.length === 0) return;

    setIsGojiImporting(true);
    try {
      const result = await importLeadsFromGojiberry(gojiPreview.rows);

      if (result.success) {
        const { imported, updated, errors } = result.data;
        const parts: string[] = [];
        if (imported > 0) parts.push(`${imported} nouveau${imported > 1 ? "x" : ""}`);
        if (updated > 0) parts.push(`${updated} mis \u00e0 jour`);

        if (parts.length > 0) {
          toast.success(`Import Gojiberry : ${parts.join(", ")}`);
        } else {
          toast.warning("Aucun lead import\u00e9");
        }

        if (errors.length > 0) {
          toast.error(`${errors.length} erreur${errors.length > 1 ? "s" : ""}`);
        }

        setGojiImportOpen(false);
        setGojiFile(null);
        setGojiPreview(null);
        if (gojiFileInputRef.current) gojiFileInputRef.current.value = "";
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Erreur inattendue lors de l\u2019import Gojiberry");
    } finally {
      setIsGojiImporting(false);
    }
  }, [gojiPreview, router]);

  const resetGojiDialog = useCallback(() => {
    setGojiFile(null);
    setGojiPreview(null);
    if (gojiFileInputRef.current) gojiFileInputRef.current.value = "";
  }, []);

  // Delete lead state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteLead = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const result = await deleteLead(deleteTarget.id);
      if (result.success) {
        toast.success("Lead supprimé");
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(result.error || "Erreur lors de la suppression");
      }
    } catch {
      toast.error("Erreur serveur lors de la suppression");
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, router]);

  // Batch enrichment state
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ current: 0, total: 0 });

  // Bulk Icypeas email enrichment
  const [isBulkEmailEnriching, setIsBulkEmailEnriching] = useState(false);
  const handleBulkEmailEnrich = useCallback(async () => {
    setIsBulkEmailEnriching(true);
    try {
      const res = await fetch("/api/icypeas/bulk-enrich", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erreur enrichissement emails");
      } else if (data.sent === 0) {
        toast.info(data.message);
      } else {
        toast.success(data.message);
      }
    } catch {
      toast.error("Erreur r\u00e9seau");
    } finally {
      setIsBulkEmailEnriching(false);
    }
  }, []);

  // Bulk selection state
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // Bulk send to sequence state
  const [bulkSequenceOpen, setBulkSequenceOpen] = useState(false);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [selectedSequenceId, setSelectedSequenceId] = useState<string>("");
  const [isBulkSequencing, setIsBulkSequencing] = useState(false);

  const toggleLeadSelection = useCallback((id: string) => {
    setSelectedLeads((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    setCsvFile(file);
    const text = await file.text();
    const parsed = parseCSV(text);
    setCsvPreview(parsed);
  }, []);

  const handleImport = useCallback(async () => {
    if (!csvPreview || csvPreview.rows.length === 0) return;

    setIsImporting(true);
    try {
      const result = await importLeadsFromCSV(csvPreview.rows);

      if (result.success) {
        const { imported, duplicates, errors } = result.data;

        if (imported > 0) {
          toast.success(
            `${imported} lead${imported > 1 ? "s" : ""} importé${imported > 1 ? "s" : ""} avec succès` +
            (duplicates > 0 ? ` (${duplicates} doublon${duplicates > 1 ? "s" : ""} ignoré${duplicates > 1 ? "s" : ""})` : "")
          );
        } else if (duplicates > 0) {
          toast.warning(`Aucun nouveau lead importé : ${duplicates} doublon${duplicates > 1 ? "s" : ""} détecté${duplicates > 1 ? "s" : ""}`);
        }

        if (errors.length > 0) {
          toast.error(`${errors.length} erreur${errors.length > 1 ? "s" : ""} lors de l'import`);
        }

        setCsvImportOpen(false);
        setCsvFile(null);
        setCsvPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Erreur inattendue lors de l'import");
    } finally {
      setIsImporting(false);
    }
  }, [csvPreview, router]);

  const resetImportDialog = useCallback(() => {
    setCsvFile(null);
    setCsvPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    initialLeads.forEach((lead) => lead.tags?.forEach((tag) => tags.add(tag)));
    return Array.from(tags);
  }, [initialLeads]);

  // Compute available import batches from leads data
  const importBatches = useMemo(() => {
    const map = new Map<string, { label: string; count: number; ts: number }>();
    initialLeads.forEach((lead) => {
      const batch = (lead.enrichmentData as { _import_batch?: string } | null)?._import_batch;
      if (!batch) return;
      if (map.has(batch)) {
        map.get(batch)!.count++;
      } else {
        // Parse: "gojiberry_2026-03-27T09:15:32.000Z" or "csv_2026-03-27T..."
        const underscore = batch.indexOf("_");
        const source = underscore !== -1 ? batch.slice(0, underscore) : batch;
        const isoStr = underscore !== -1 ? batch.slice(underscore + 1) : "";
        const date = isoStr ? new Date(isoStr) : null;
        const dateLabel = date && !isNaN(date.getTime())
          ? date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) +
            " " +
            date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
          : "";
        const sourceLabel = source === "gojiberry" ? "Gojiberry" : source === "csv" ? "CSV" : source;
        map.set(batch, {
          label: dateLabel ? `${sourceLabel} — ${dateLabel}` : sourceLabel,
          count: 1,
          ts: date ? date.getTime() : 0,
        });
      }
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1].ts - a[1].ts)
      .map(([value, meta]) => ({ value, label: meta.label, count: meta.count }));
  }, [initialLeads]);

  const filteredAndSortedLeads = useMemo(() => {
    let result = [...initialLeads];

    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (lead) =>
          lead.firstName.toLowerCase().includes(query) ||
          lead.lastName.toLowerCase().includes(query) ||
          lead.company?.toLowerCase().includes(query) ||
          lead.title?.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (filters.status.length > 0) {
      result = result.filter((lead) => filters.status.includes(lead.status));
    }

    // Stage filter
    if (filters.stage.length > 0) {
      result = result.filter((lead) => filters.stage.includes(lead.stage));
    }

    // Score filter
    result = result.filter(
      (lead) => lead.score >= filters.scoreMin && lead.score <= filters.scoreMax
    );

    // Tags filter
    if (filters.tags.length > 0) {
      result = result.filter((lead) =>
        filters.tags.some((tag) => lead.tags?.includes(tag))
      );
    }

    // Signal type filter
    if (filters.signalType.length > 0) {
      result = result.filter((lead) =>
        filters.signalType.includes(
          (lead.enrichmentData?.signal?.type as string) || ""
        )
      );
    }

    // Import batch filter
    if (filters.importBatch.length > 0) {
      result = result.filter((lead) => {
        const batch = (lead.enrichmentData as { _import_batch?: string } | null)?._import_batch || "manual";
        return filters.importBatch.includes(batch);
      });
    }

    // Enrichment status filter
    if (filters.enrichmentStatus.length > 0) {
      result = result.filter((lead) => {
        const isEnriched = !!(lead.enrichmentData?.scoring_detail);
        if (filters.enrichmentStatus.includes("enriched") && isEnriched) return true;
        if (filters.enrichmentStatus.includes("unenriched") && !isEnriched) return true;
        return false;
      });
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = `${a.firstName} ${a.lastName}`.localeCompare(
            `${b.firstName} ${b.lastName}`
          );
          break;
        case "score":
          comparison = a.score - b.score;
          break;
        case "company":
          comparison = (a.company || "").localeCompare(b.company || "");
          break;
        case "lastActivity":
          comparison =
            (a.updatedAt?.getTime() ?? 0) -
            (b.updatedAt?.getTime() ?? 0);
          break;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [searchQuery, filters, sortField, sortOrder, initialLeads]);

  // handleBatchEnrich uses filteredAndSortedLeads so it's defined after it
  const handleBatchEnrich = useCallback(async () => {
    // Only enrich non-enriched leads from current filtered view
    const unenriched = filteredAndSortedLeads.filter(
      (l) => !l.enrichmentData?.scoring_detail
    );
    if (unenriched.length === 0) {
      toast.info("Tous les leads filtrés sont déjà enrichis");
      return;
    }

    setIsEnriching(true);
    setEnrichProgress({ current: 0, total: unenriched.length });
    let successCount = 0;

    for (let i = 0; i < unenriched.length; i++) {
      const lead = unenriched[i];
      setEnrichProgress({ current: i + 1, total: unenriched.length });

      try {
        const res = await fetch("/api/ai/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lead: {
              id: lead.id,
              firstName: lead.firstName,
              lastName: lead.lastName,
              title: lead.title,
              company: lead.company,
              linkedinUrl: lead.linkedinUrl,
              score: lead.score,
              status: lead.status,
              stage: lead.stage,
              tags: lead.tags,
              notes: lead.notes,
              enrichmentData: lead.enrichmentData,
            },
          }),
        });

        if (res.ok) {
          successCount++;
        } else {
          console.warn(`Enrichment failed for ${lead.firstName} ${lead.lastName}`);
        }
      } catch (err) {
        console.warn(`Enrichment error for lead ${lead.id}:`, err);
      }

      if (i < unenriched.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    setIsEnriching(false);
    toast.success(`${successCount}/${unenriched.length} leads enrichis`);
    router.refresh();
  }, [filteredAndSortedLeads, router]);

  // Bulk send to sequence handler
  const handleBulkAddToSequence = useCallback(async () => {
    if (!selectedSequenceId) return;
    setIsBulkSequencing(true);
    const ids = Array.from(selectedLeads);
    let successCount = 0;
    for (const leadId of ids) {
      const result = await addLeadToSequence(selectedSequenceId, leadId);
      if (result.success) successCount++;
    }
    setIsBulkSequencing(false);
    setBulkSequenceOpen(false);
    setSelectedLeads(new Set());
    setSelectedSequenceId("");
    toast.success(`${successCount}/${ids.length} lead${ids.length > 1 ? "s" : ""} ajouté${ids.length > 1 ? "s" : ""} à la séquence`);
    router.refresh();
  }, [selectedSequenceId, selectedLeads, router]);

  // Bulk enrich selected leads
  const [isBulkEnriching, setIsBulkEnriching] = useState(false);
  const handleBulkEnrich = useCallback(async () => {
    const ids = Array.from(selectedLeads);
    const leadsToEnrich = initialLeads.filter(
      (l) => ids.includes(l.id) && !l.enrichmentData?.scoring_detail
    );
    if (leadsToEnrich.length === 0) {
      toast.info("Les leads sélectionnés sont déjà tous enrichis");
      return;
    }
    setIsBulkEnriching(true);
    let successCount = 0;
    for (const lead of leadsToEnrich) {
      try {
        const res = await fetch("/api/ai/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lead: {
              id: lead.id,
              firstName: lead.firstName,
              lastName: lead.lastName,
              title: lead.title,
              company: lead.company,
              linkedinUrl: lead.linkedinUrl,
              score: lead.score,
              status: lead.status,
              stage: lead.stage,
              tags: lead.tags,
              notes: lead.notes,
              enrichmentData: lead.enrichmentData,
            },
          }),
        });
        if (res.ok) successCount++;
      } catch {
        // continue
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    setIsBulkEnriching(false);
    setSelectedLeads(new Set());
    toast.success(`${successCount}/${leadsToEnrich.length} leads enrichis`);
    router.refresh();
  }, [selectedLeads, initialLeads, router]);

  const selectAllVisible = useCallback(() => {
    setSelectedLeads((prev) => {
      if (prev.size === filteredAndSortedLeads.length) return new Set();
      return new Set(filteredAndSortedLeads.map((l) => l.id));
    });
  }, [filteredAndSortedLeads]);

  const handleBulkDelete = useCallback(async () => {
    setIsBulkDeleting(true);
    try {
      const ids = Array.from(selectedLeads);
      const result = await deleteLeads(ids);
      if (result.success) {
        toast.success(`${result.data.deleted} lead${result.data.deleted > 1 ? "s" : ""} supprim\u00e9${result.data.deleted > 1 ? "s" : ""}`);
        setSelectedLeads(new Set());
        setBulkDeleteOpen(false);
        router.refresh();
      } else {
        toast.error(result.error || "Erreur lors de la suppression");
      }
    } catch {
      toast.error("Erreur lors de la suppression en masse");
    } finally {
      setIsBulkDeleting(false);
    }
  }, [selectedLeads, router]);

  // Group leads by stage for Kanban
  const leadsByStage = useMemo(() => {
    const grouped: Record<string, typeof filteredAndSortedLeads> = {};
    KANBAN_COLUMNS.forEach((col) => {
      grouped[col.key] = filteredAndSortedLeads.filter((l) => l.stage === col.key);
    });
    return grouped;
  }, [filteredAndSortedLeads]);

  const toggleStatus = (status: string) => {
    setFilters((prev) => ({
      ...prev,
      status: prev.status.includes(status)
        ? prev.status.filter((s) => s !== status)
        : [...prev.status, status],
    }));
  };

  const toggleStage = (stage: string) => {
    setFilters((prev) => ({
      ...prev,
      stage: prev.stage.includes(stage)
        ? prev.stage.filter((s) => s !== stage)
        : [...prev.stage, stage],
    }));
  };

  const toggleTag = (tag: string) => {
    setFilters((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter((t) => t !== tag)
        : [...prev.tags, tag],
    }));
  };

  const clearFilters = () => {
    setFilters({
      status: [],
      stage: [],
      scoreMin: 0,
      scoreMax: 100,
      tags: [],
      signalType: [],
      importBatch: [],
      enrichmentStatus: [],
    });
  };

  const hasActiveFilters =
    filters.status.length > 0 ||
    filters.stage.length > 0 ||
    filters.tags.length > 0 ||
    filters.signalType.length > 0 ||
    filters.importBatch.length > 0 ||
    filters.enrichmentStatus.length > 0 ||
    filters.scoreMin > 0 ||
    filters.scoreMax < 100;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const formatLastActivity = (date: string | null) => {
    if (!date) return "Jamais";
    const d = new Date(date);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60));
    if (diffHours < 1) return "< 1h";
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Hier";
    if (diffDays < 7) return `${diffDays}j`;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filteredAndSortedLeads.length} leads
            {filteredAndSortedLeads.length !== initialLeads.length &&
              ` sur ${initialLeads.length}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg border border-border bg-muted p-1">
            <button
              onClick={() => setViewMode("kanban")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                viewMode === "kanban"
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              Kanban
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                viewMode === "table"
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-4 w-4" />
              Table
            </button>
          </div>
          <Button
            variant="outline"
            onClick={handleBatchEnrich}
            disabled={isEnriching}
            className="gap-2"
          >
            {isEnriching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {enrichProgress.current}/{enrichProgress.total}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Enrichir tout
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleBulkEmailEnrich}
            disabled={isBulkEmailEnriching}
            className="gap-2"
          >
            {isBulkEmailEnriching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Enrichir emails
          </Button>
          <Button variant="outline" onClick={() => setGojiImportOpen(true)} className="gap-2">
            <Zap className="h-4 w-4" />
            Import Gojiberry
          </Button>
          <Button variant="outline" onClick={() => setCsvImportOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            Importer CSV
          </Button>
          <Button variant="accent" onClick={() => setAddLeadOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Ajouter un lead
          </Button>
        </div>
      </div>

      {/* Search & Filters Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[250px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Rechercher par nom, entreprise, titre..."
                className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-4 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent placeholder:text-muted-foreground"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Status Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-11 gap-2 rounded-lg">
                  <Flame className="h-4 w-4" />
                  Statut
                  {filters.status.length > 0 && (
                    <Badge variant="accent" className="ml-1 h-5 min-w-5 px-1.5">
                      {filters.status.length}
                    </Badge>
                  )}
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {STATUS_OPTIONS.map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status.value}
                    checked={filters.status.includes(status.value)}
                    onCheckedChange={() => toggleStatus(status.value)}
                  >
                    <Badge variant={status.color as "destructive" | "warning" | "secondary" | "success"} className="mr-2">
                      {status.label}
                    </Badge>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Stage Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-11 gap-2 rounded-lg">
                  Stage
                  {filters.stage.length > 0 && (
                    <Badge variant="accent" className="ml-1 h-5 min-w-5 px-1.5">
                      {filters.stage.length}
                    </Badge>
                  )}
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {STAGE_OPTIONS.map((stage) => (
                  <DropdownMenuCheckboxItem
                    key={stage.value}
                    checked={filters.stage.includes(stage.value)}
                    onCheckedChange={() => toggleStage(stage.value)}
                  >
                    {stage.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Import Batch Filter */}
            {importBatches.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-11 gap-2 rounded-lg">
                    <Upload className="h-4 w-4" />
                    Import
                    {filters.importBatch.length > 0 && (
                      <Badge variant="accent" className="ml-1 h-5 min-w-5 px-1.5">
                        {filters.importBatch.length}
                      </Badge>
                    )}
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  {importBatches.map((batch) => (
                    <DropdownMenuCheckboxItem
                      key={batch.value}
                      checked={filters.importBatch.includes(batch.value)}
                      onCheckedChange={() =>
                        setFilters((prev) => ({
                          ...prev,
                          importBatch: prev.importBatch.includes(batch.value)
                            ? prev.importBatch.filter((b) => b !== batch.value)
                            : [...prev.importBatch, batch.value],
                        }))
                      }
                    >
                      <span className="flex items-center justify-between w-full gap-2">
                        <span>{batch.label}</span>
                        <span className="text-xs text-muted-foreground">{batch.count}</span>
                      </span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Enrichment Status Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-11 gap-2 rounded-lg">
                  <Sparkles className="h-4 w-4" />
                  Enrichissement
                  {filters.enrichmentStatus.length > 0 && (
                    <Badge variant="accent" className="ml-1 h-5 min-w-5 px-1.5">
                      {filters.enrichmentStatus.length}
                    </Badge>
                  )}
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuCheckboxItem
                  checked={filters.enrichmentStatus.includes("enriched")}
                  onCheckedChange={() =>
                    setFilters((prev) => ({
                      ...prev,
                      enrichmentStatus: prev.enrichmentStatus.includes("enriched")
                        ? prev.enrichmentStatus.filter((s) => s !== "enriched")
                        : [...prev.enrichmentStatus, "enriched"],
                    }))
                  }
                >
                  Enrichis
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filters.enrichmentStatus.includes("unenriched")}
                  onCheckedChange={() =>
                    setFilters((prev) => ({
                      ...prev,
                      enrichmentStatus: prev.enrichmentStatus.includes("unenriched")
                        ? prev.enrichmentStatus.filter((s) => s !== "unenriched")
                        : [...prev.enrichmentStatus, "unenriched"],
                    }))
                  }
                >
                  Non enrichis
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* More Filters */}
            <Button
              variant={showFilters ? "secondary" : "outline"}
              onClick={() => setShowFilters(!showFilters)}
              className="h-11 gap-2 rounded-lg"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Plus de filtres
              {hasActiveFilters && !showFilters && (
                <Badge variant="accent" className="ml-1">!</Badge>
              )}
            </Button>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button variant="ghost" onClick={clearFilters} className="h-11 gap-2 rounded-lg text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
                Effacer
              </Button>
            )}
          </div>

          {/* Extended Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-border grid gap-6 md:grid-cols-3">
              {/* Score Range */}
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 block">
                  Score: {filters.scoreMin} - {filters.scoreMax}
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={filters.scoreMin}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        scoreMin: parseInt(e.target.value),
                      }))
                    }
                    className="flex-1 accent-accent"
                  />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={filters.scoreMax}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        scoreMax: parseInt(e.target.value),
                      }))
                    }
                    className="flex-1 accent-accent"
                  />
                </div>
              </div>

              {/* Signal Type */}
              <div className="md:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 block">Signal</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SIGNAL_TYPES).map(([key, meta]) => (
                    <Badge
                      key={key}
                      variant={filters.signalType.includes(key) ? (meta.color as "default" | "secondary" | "destructive" | "warning" | "accent") : "outline"}
                      className="cursor-pointer transition-colors duration-200"
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          signalType: prev.signalType.includes(key)
                            ? prev.signalType.filter((s) => s !== key)
                            : [...prev.signalType, key],
                        }))
                      }
                    >
                      {meta.label}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div className="md:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 block">Tags</label>
                <div className="flex flex-wrap gap-2">
                  {allTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant={filters.tags.includes(tag) ? "default" : "outline"}
                      className="cursor-pointer transition-colors duration-200"
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KANBAN VIEW */}
      {viewMode === "kanban" && (
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin" style={{ minHeight: "calc(100vh - 22rem)" }}>
          {KANBAN_COLUMNS.map((column) => {
            const leads = leadsByStage[column.key] || [];
            return (
              <div
                key={column.key}
                className="flex flex-col shrink-0"
                style={{ width: "280px" }}
              >
                {/* Column Header */}
                <div className={`rounded-t-lg px-4 py-3 ${column.lightBg} border border-border border-b-0`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-2.5 w-2.5 rounded-full ${column.color}`} />
                      <span className="font-medium text-sm">{column.label}</span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                      {leads.length}
                    </span>
                  </div>
                </div>

                {/* Column Body */}
                <div className="flex-1 rounded-b-lg border border-border border-t-0 bg-muted/30 dark:bg-muted/10 p-2 space-y-2 overflow-y-auto scrollbar-thin">
                  {leads.map((lead) => (
                    <Link
                      key={lead.id}
                      href={`/pipeline/${lead.id}`}
                      className="block group/card"
                    >
                      <div className="relative bg-card rounded-lg border border-border transition-all duration-200 cursor-pointer">
                        {lead.userId === currentUserId && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              setDeleteTarget({ id: lead.id, name: lead.displayName });
                            }}
                            className="absolute top-2 right-2 opacity-0 group-hover/card:opacity-100 transition-opacity duration-200 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <div className="p-3">
                          {/* Lead Header */}
                          <div className="flex items-start gap-2.5 mb-2">
                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarFallback className="bg-muted text-foreground text-xs">
                                {lead.displayName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-sm truncate">
                                {lead.displayName}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {lead.title}
                              </div>
                            </div>
                            {/* Score */}
                            <div
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${
                                lead.score >= 80
                                  ? "bg-success"
                                  : lead.score >= 60
                                  ? "bg-warning"
                                  : lead.score >= 40
                                  ? "bg-orange-500 dark:bg-orange-400"
                                  : "bg-muted-foreground/50"
                              }`}
                            >
                              {lead.score}
                            </div>
                          </div>

                          {/* Company */}
                          <div className="text-xs text-muted-foreground mb-2 truncate">
                            {lead.company}
                            {lead.enrichmentData?.company?.industry && (
                              <span className="opacity-60">
                                {" "}&middot; {lead.enrichmentData.company.industry}
                              </span>
                            )}
                          </div>

                          {/* Tags + Status */}
                          <div className="flex items-center justify-between">
                            <div className="flex gap-1 overflow-hidden">
                              {lead.tags?.slice(0, 2).map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="text-xs px-1.5 py-0 h-5"
                                >
                                  {tag}
                                </Badge>
                              ))}
                              {(lead.tags?.length || 0) > 2 && (
                                <span className="text-xs text-muted-foreground">
                                  +{(lead.tags?.length || 0) - 2}
                                </span>
                              )}
                            </div>
                            <Badge
                              variant={
                                lead.status === "hot"
                                  ? "destructive"
                                  : lead.status === "warm"
                                  ? "warning"
                                  : lead.status === "cold"
                                  ? "secondary"
                                  : "secondary"
                              }
                              className="text-xs px-1.5 py-0 h-5"
                            >
                              {lead.status === "hot"
                                ? "Chaud"
                                : lead.status === "warm"
                                ? "Tiède"
                                : "Froid"}
                            </Badge>
                          </div>

                          {/* Last Activity + Owner */}
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatLastActivity(lead.updatedAt?.toISOString() ?? null)}
                            </div>
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              <span className="truncate max-w-[80px]">{lead.ownerName}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}

                  {leads.length === 0 && (
                    <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
                      Aucun lead
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === "table" && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-transparent">
                  <tr className="border-b border-border">
                    <th className="px-2 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedLeads.size > 0 && selectedLeads.size === filteredAndSortedLeads.length}
                        onChange={selectAllVisible}
                        className="h-4 w-4 rounded border-border accent-accent cursor-pointer"
                      />
                    </th>
                    <th className="px-4 py-3 text-left">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 -ml-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
                        onClick={() => handleSort("name")}
                      >
                        Lead
                        <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </th>
                    <th className="px-4 py-3 text-left">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 -ml-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
                        onClick={() => handleSort("company")}
                      >
                        Entreprise
                        <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Stage
                    </th>
                    <th className="px-4 py-3 text-left">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 -ml-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
                        onClick={() => handleSort("score")}
                      >
                        Score
                        <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Owner
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Statut
                    </th>
                    <th className="px-4 py-3 text-left">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 -ml-2 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
                        onClick={() => handleSort("lastActivity")}
                      >
                        Derni&egrave;re activit&eacute;
                        <ArrowUpDown className="h-3 w-3" />
                      </Button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-b border-border transition-colors hover:bg-muted/50 dark:hover:bg-muted/50 group"
                    >
                      <td className="px-2 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedLeads.has(lead.id)}
                          onChange={() => toggleLeadSelection(lead.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 rounded border-border accent-accent cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-muted text-foreground text-sm">
                              {lead.displayName.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <Link
                              href={`/pipeline/${lead.id}`}
                              className="font-medium hover:text-accent transition-colors"
                            >
                              {lead.displayName}
                            </Link>
                            <div className="text-sm text-muted-foreground">
                              {lead.title}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{lead.company || "-"}</div>
                        {lead.enrichmentData?.company?.industry && (
                          <div className="text-xs text-muted-foreground">
                            {lead.enrichmentData.company.industry}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">
                          {LEAD_STAGES[lead.stage as keyof typeof LEAD_STAGES]?.label || lead.stage}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Progress
                            value={lead.score}
                            className="w-16 h-2"
                            indicatorClassName={
                              lead.score >= 70
                                ? "bg-success"
                                : lead.score >= 40
                                ? "bg-warning"
                                : "bg-muted-foreground/40"
                            }
                          />
                          <span
                            className={`font-mono text-sm font-medium ${
                              lead.score >= 70
                                ? "text-success"
                                : lead.score >= 40
                                ? "text-warning"
                                : "text-muted-foreground"
                            }`}
                          >
                            {lead.score}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-muted-foreground">{lead.ownerName}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            (STATUS_OPTIONS.find(s => s.value === lead.status)?.color || "secondary") as "destructive" | "warning" | "success" | "secondary"
                          }
                        >
                          {LEAD_STATUSES[lead.status as keyof typeof LEAD_STATUSES]?.label || lead.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {formatLastActivity(lead.updatedAt?.toISOString() ?? null)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <Button size="sm" variant="ghost" className="rounded-lg" asChild>
                            <Link href={`/pipeline/${lead.id}`}>Voir</Link>
                          </Button>
                          <Button size="sm" variant="ghost" className="rounded-lg" asChild>
                            <a
                              href={lead.linkedinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                          {lead.userId === currentUserId && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget({ id: lead.id, name: lead.displayName })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredAndSortedLeads.length === 0 && (
              <div className="py-16 text-center">
                <Search className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-medium mb-2">Aucun lead trouv&eacute;</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Essayez de modifier vos crit&egrave;res de recherche
                </p>
                {hasActiveFilters && (
                  <Button variant="outline" onClick={clearFilters} className="rounded-lg">
                    Effacer les filtres
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Lead Dialog */}
      <Dialog open={addLeadOpen} onOpenChange={setAddLeadOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Ajouter un lead
            </DialogTitle>
            <DialogDescription>
              Ajoutez un nouveau lead manuellement au pipeline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Pr&eacute;nom <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Jean"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newLead.firstName}
                  onChange={(e) => setNewLead((prev) => ({ ...prev, firstName: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Nom <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Dupont"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newLead.lastName}
                  onChange={(e) => setNewLead((prev) => ({ ...prev, lastName: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                URL LinkedIn <span className="text-destructive">*</span>
              </label>
              <input
                type="url"
                placeholder="https://www.linkedin.com/in/jean-dupont"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                value={newLead.linkedinUrl}
                onChange={(e) => setNewLead((prev) => ({ ...prev, linkedinUrl: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Titre / Poste</label>
              <input
                type="text"
                placeholder="CEO, Fondateur..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={newLead.title}
                onChange={(e) => setNewLead((prev) => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Entreprise</label>
                <input
                  type="text"
                  placeholder="Acme Corp"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newLead.company}
                  onChange={(e) => setNewLead((prev) => ({ ...prev, company: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Email</label>
                <input
                  type="email"
                  placeholder="jean@acme.com"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newLead.email}
                  onChange={(e) => setNewLead((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAddLeadOpen(false)} disabled={addLeadLoading}>
              Annuler
            </Button>
            <Button
              variant="accent"
              onClick={handleAddLead}
              disabled={addLeadLoading || !newLead.linkedinUrl}
              className="gap-2"
            >
              {addLeadLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ajout en cours...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Ajouter
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog
        open={csvImportOpen}
        onOpenChange={(open) => {
          setCsvImportOpen(open);
          if (!open) resetImportDialog();
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Importer des leads via CSV
            </DialogTitle>
            <DialogDescription>
              S&eacute;lectionnez un fichier CSV avec les colonnes : pr&eacute;nom, nom, URL LinkedIn (requis), titre, entreprise, email, t&eacute;l&eacute;phone, tags.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* File Input */}
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Choisir un fichier
              </Button>
              {csvFile && (
                <span className="text-sm text-muted-foreground truncate max-w-[300px]">
                  {csvFile.name}
                </span>
              )}
            </div>

            {/* Preview */}
            {csvPreview && (
              <div className="space-y-3">
                {/* Stats */}
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span>{csvPreview.rows.length} lead{csvPreview.rows.length > 1 ? "s" : ""} valide{csvPreview.rows.length > 1 ? "s" : ""}</span>
                  </div>
                  {csvPreview.headers.length > 0 && (
                    <div className="text-muted-foreground">
                      {csvPreview.headers.length} colonnes d&eacute;tect&eacute;es
                    </div>
                  )}
                </div>

                {csvPreview.rows.length === 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>
                      Aucun lead valide trouv&eacute;. V&eacute;rifiez que votre CSV contient les colonnes requises : pr&eacute;nom, nom, URL LinkedIn.
                    </span>
                  </div>
                )}

                {/* Preview Table */}
                {csvPreview.rawPreview.length > 0 && (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-3 py-2 bg-muted/50 border-b border-border">
                      Aper&ccedil;u (5 premi&egrave;res lignes)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/30">
                            {csvPreview.headers.map((header, idx) => (
                              <th
                                key={idx}
                                className="px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap"
                              >
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {csvPreview.rawPreview.map((row, rowIdx) => (
                            <tr
                              key={rowIdx}
                              className="border-b border-border last:border-0"
                            >
                              {row.map((cell, cellIdx) => (
                                <td
                                  key={cellIdx}
                                  className="px-3 py-2 text-sm whitespace-nowrap max-w-[200px] truncate"
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setCsvImportOpen(false);
                resetImportDialog();
              }}
              disabled={isImporting}
            >
              Annuler
            </Button>
            <Button
              variant="accent"
              onClick={handleImport}
              disabled={!csvPreview || csvPreview.rows.length === 0 || isImporting}
              className="gap-2"
            >
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Import en cours...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Importer {csvPreview?.rows.length ?? 0} lead{(csvPreview?.rows.length ?? 0) > 1 ? "s" : ""}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gojiberry Import Dialog */}
      <Dialog
        open={gojiImportOpen}
        onOpenChange={(open) => {
          setGojiImportOpen(open);
          if (!open) resetGojiDialog();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-orange-500" />
              Import Gojiberry
            </DialogTitle>
            <DialogDescription>
              Importez vos leads depuis un export CSV Gojiberry. Les signaux d&apos;intent seront automatiquement d&eacute;tect&eacute;s.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                ref={gojiFileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleGojiFileSelect(file);
                }}
              />
              <Button
                variant="outline"
                onClick={() => gojiFileInputRef.current?.click()}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Choisir un fichier
              </Button>
              {gojiFile && (
                <span className="text-sm text-muted-foreground truncate max-w-[300px]">
                  {gojiFile.name}
                </span>
              )}
            </div>

            {gojiPreview && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span>{gojiPreview.rows.length} lead{gojiPreview.rows.length > 1 ? "s" : ""} d&eacute;tect&eacute;{gojiPreview.rows.length > 1 ? "s" : ""}</span>
                </div>

                {/* Signal distribution */}
                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Distribution des signaux
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(gojiPreview.signalSummary)
                      .sort(([, a], [, b]) => b - a)
                      .map(([label, count]) => (
                        <Badge key={label} variant="secondary" className="gap-1">
                          {label}
                          <span className="font-mono text-xs">{count}</span>
                        </Badge>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setGojiImportOpen(false);
                resetGojiDialog();
              }}
              disabled={isGojiImporting}
            >
              Annuler
            </Button>
            <Button
              variant="accent"
              onClick={handleGojiImport}
              disabled={!gojiPreview || gojiPreview.rows.length === 0 || isGojiImporting}
              className="gap-2"
            >
              {isGojiImporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Import en cours...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Importer {gojiPreview?.rows.length ?? 0} lead{(gojiPreview?.rows.length ?? 0) > 1 ? "s" : ""}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Selection Floating Bar */}
      {selectedLeads.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 rounded-lg border border-border bg-card px-6 py-3 shadow-lg">
          <span className="text-sm font-medium">
            {selectedLeads.size} lead{selectedLeads.size > 1 ? "s" : ""} s&eacute;lectionn&eacute;{selectedLeads.size > 1 ? "s" : ""}
          </span>
          <Button variant="outline" size="sm" onClick={() => setSelectedLeads(new Set())}>
            D&eacute;s&eacute;lectionner
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={isBulkEnriching}
            onClick={handleBulkEnrich}
          >
            {isBulkEnriching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Enrichir
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={async () => {
              const result = await getSequences();
              if (result.success) setSequences(result.data);
              setSelectedSequenceId("");
              setBulkSequenceOpen(true);
            }}
          >
            <GitBranch className="h-4 w-4" />
            Envoyer vers s&eacute;quence
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)} className="gap-2">
            <Trash2 className="h-4 w-4" />
            Supprimer
          </Button>
        </div>
      )}

      {/* Bulk Send to Sequence Dialog */}
      <Dialog open={bulkSequenceOpen} onOpenChange={setBulkSequenceOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Envoyer vers une s&eacute;quence
            </DialogTitle>
            <DialogDescription>
              {selectedLeads.size} lead{selectedLeads.size > 1 ? "s" : ""} seront ajout&eacute;{selectedLeads.size > 1 ? "s" : ""} à la s&eacute;quence s&eacute;lectionn&eacute;e.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {sequences.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Aucune s&eacute;quence disponible</p>
            ) : (
              <div className="space-y-2">
                {sequences.map((seq) => (
                  <button
                    key={seq.id}
                    onClick={() => setSelectedSequenceId(seq.id)}
                    className={`w-full text-left rounded-lg border px-4 py-3 text-sm transition-colors duration-150 ${
                      selectedSequenceId === seq.id
                        ? "border-accent bg-accent/5 font-medium"
                        : "border-border hover:border-accent/50 hover:bg-muted"
                    }`}
                  >
                    {seq.name}
                    {seq.persona && (
                      <span className="ml-2 text-xs text-muted-foreground">{seq.persona}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setBulkSequenceOpen(false)} disabled={isBulkSequencing}>
              Annuler
            </Button>
            <Button
              variant="accent"
              onClick={handleBulkAddToSequence}
              disabled={!selectedSequenceId || isBulkSequencing}
              className="gap-2"
            >
              {isBulkSequencing ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Ajout en cours...</>
              ) : (
                <><GitBranch className="h-4 w-4" />Ajouter à la s&eacute;quence</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Supprimer {selectedLeads.size} lead{selectedLeads.size > 1 ? "s" : ""}
            </DialogTitle>
            <DialogDescription>
              Cette action est irr&eacute;versible. Tous les leads s&eacute;lectionn&eacute;s seront supprim&eacute;s.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={isBulkDeleting}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={isBulkDeleting} className="gap-2">
              {isBulkDeleting ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Suppression...</>
              ) : (
                <>Supprimer</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Lead Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Supprimer le lead
            </DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>{deleteTarget?.name}</strong> ? Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteLead}
              disabled={isDeleting}
              className="gap-2"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Suppression...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Supprimer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
