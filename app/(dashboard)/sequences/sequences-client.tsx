"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Plus,
  Play,
  Pause,
  MoreHorizontal,
  Users,
  TrendingUp,
  Copy,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Sequence } from "@/types/sequences";
import {
  createSequence as serverCreateSequence,
  deleteSequence as serverDeleteSequence,
  updateSequence as serverUpdateSequence,
} from "@/lib/actions/sequences";

const PERSONAS = [
  "CEO / Founder",
  "CTO / VP Engineering",
  "COO / Head of Operations",
  "VP Sales / Head of Sales",
  "CMO / Head of Marketing",
];

interface SequencesClientProps {
  initialSequences: Sequence[];
}

export default function SequencesClient({ initialSequences }: SequencesClientProps) {
  const [sequences, setSequences] = useState<Sequence[]>(initialSequences);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedSequence, setSelectedSequence] = useState<Sequence | null>(null);
  const [newName, setNewName] = useState("");
  const [newPersona, setNewPersona] = useState("");

  const createSequence = async () => {
    if (!newName.trim()) return;
    const result = await serverCreateSequence({ name: newName, persona: newPersona || undefined });
    if (result.success) {
      setSequences((prev) => [...prev, result.data]);
      toast.success("Séquence créée");
    } else {
      toast.error(result.error || "Erreur lors de la création");
    }
    setNewName("");
    setNewPersona("");
    setCreateOpen(false);
  };

  const duplicateSequence = async (seq: Sequence) => {
    const result = await serverCreateSequence({
      name: `${seq.name} - Copie`,
      persona: seq.persona || undefined,
    });
    if (result.success) {
      setSequences((prev) => [...prev, result.data]);
      toast.success("Séquence dupliquée");
    } else {
      toast.error(result.error || "Erreur lors de la duplication");
    }
  };

  const deleteSequence = async () => {
    if (!selectedSequence) return;
    const result = await serverDeleteSequence(selectedSequence.id);
    if (result.success) {
      setSequences((prev) => prev.filter((s) => s.id !== selectedSequence.id));
      toast.success("Séquence supprimée");
    } else {
      toast.error(result.error || "Erreur lors de la suppression");
    }
    setDeleteOpen(false);
    setSelectedSequence(null);
  };

  const toggleStatus = async (id: string) => {
    const seq = sequences.find((s) => s.id === id);
    if (!seq) return;
    const oldStatus = seq.status;
    const newStatus = oldStatus === "active" ? "paused" : "active";
    // Optimistic local update
    setSequences((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: newStatus as Sequence["status"] }
          : s
      )
    );
    // Server sync with rollback
    const result = await serverUpdateSequence(id, { status: newStatus });
    if (result.success) {
      toast.success(newStatus === "active" ? "Séquence activée" : "Séquence mise en pause");
    } else {
      // Rollback
      setSequences((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: oldStatus } : s
        )
      );
      toast.error(result.error || "Erreur lors de la mise à jour");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">S&eacute;quences</h1>
          <p className="text-muted-foreground">
            G&eacute;rez vos s&eacute;quences de prospection automatis&eacute;es
          </p>
        </div>
        <Button
          variant="accent"
          onClick={() => {
            setNewName("");
            setNewPersona("");
            setCreateOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Nouvelle s&eacute;quence
        </Button>
      </div>

      {/* Sequences Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sequences.map((sequence) => (
          <div
            key={sequence.id}
            className="bg-card rounded-lg border border-border transition-all duration-200"
          >
            <div className="flex flex-row items-start justify-between p-6 pb-2">
              <div>
                <h3 className="text-base font-semibold leading-none tracking-tight">
                  <Link
                    href={`/sequences/${sequence.id}`}
                    className="hover:text-accent transition-colors"
                  >
                    {sequence.name}
                  </Link>
                </h3>
                {sequence.persona && (
                  <Badge variant="outline" className="mt-2 rounded-full">
                    {sequence.persona}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  className={`rounded-full ${
                    sequence.status === "active"
                      ? "bg-success-light text-success"
                      : sequence.status === "paused"
                      ? "bg-warning-light text-warning"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {sequence.status === "active"
                    ? "Active"
                    : sequence.status === "paused"
                    ? "En pause"
                    : "Brouillon"}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => toggleStatus(sequence.id)}>
                      {sequence.status === "active" ? (
                        <>
                          <Pause className="mr-2 h-4 w-4" />
                          Mettre en pause
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          Activer
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => duplicateSequence(sequence)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Dupliquer
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => {
                        setSelectedSequence(sequence);
                        setDeleteOpen(true);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Supprimer
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="p-6 pt-4">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div className="text-sm">
                    <span className="font-medium">{sequence.stats.activeLeads}</span>
                    <span className="text-muted-foreground">
                      /{sequence.stats.totalLeads} leads
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-success" />
                  <div className="text-sm">
                    <span className="font-medium">
                      {sequence.stats.responseRate}%
                    </span>
                    <span className="text-muted-foreground"> r&eacute;ponses</span>
                  </div>
                </div>
              </div>

              {/* Steps Preview */}
              <div className="flex items-center gap-1.5">
                {sequence.steps.slice(0, 5).map((step, i) => (
                  <div
                    key={step.id}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
                    title={`${step.stepType}${step.stepType !== "visit" ? (step.generationMode === "template" ? " (template)" : " (IA)") : ""}`}
                  >
                    {i + 1}
                  </div>
                ))}
                {sequence.steps.length > 5 && (
                  <div className="ml-1 text-sm text-muted-foreground">
                    +{sequence.steps.length - 5}
                  </div>
                )}
              </div>

              {/* View Button */}
              <Button variant="outline" className="w-full mt-4 rounded-lg" asChild>
                <Link href={`/sequences/${sequence.id}`}>Voir la s&eacute;quence</Link>
              </Button>
            </div>
          </div>
        ))}

        {/* Create New Sequence Card */}
        <div
          className="flex items-center justify-center border-2 border-dashed border-border hover:border-accent rounded-lg transition-all duration-200 cursor-pointer min-h-[250px]"
          onClick={() => {
            setNewName("");
            setNewPersona("");
            setCreateOpen(true);
          }}
        >
          <div className="text-center p-6">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-medium">Cr&eacute;er une s&eacute;quence</h3>
            <p className="text-sm text-muted-foreground">
              Automatisez votre prospection
            </p>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle>Nouvelle s&eacute;quence</DialogTitle>
            <DialogDescription>
              Cr&eacute;ez une s&eacute;quence de prospection automatis&eacute;e avec des
              &eacute;tapes personnalis&eacute;es.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Nom de la s&eacute;quence
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: CEO Tech - Acquisition"
                className="w-full h-11 rounded-lg border border-border bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") createSequence();
                }}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Persona cible</label>
              <Select value={newPersona} onValueChange={setNewPersona}>
                <SelectTrigger className="h-11 rounded-lg">
                  <SelectValue placeholder="S&eacute;lectionnez un persona" />
                </SelectTrigger>
                <SelectContent>
                  {PERSONAS.map((persona) => (
                    <SelectItem key={persona} value={persona}>
                      {persona}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-lg" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="accent"
              className="rounded-lg"
              onClick={createSequence}
              disabled={!newName.trim()}
            >
              <Plus className="mr-2 h-4 w-4" />
              Cr&eacute;er
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle>Supprimer la s&eacute;quence</DialogTitle>
            <DialogDescription>
              &Ecirc;tes-vous s&ucirc;r de vouloir supprimer la s&eacute;quence &laquo;{" "}
              {selectedSequence?.name} &raquo; ? Les leads actifs seront retir&eacute;s de
              la s&eacute;quence.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded-lg" onClick={() => setDeleteOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" className="rounded-lg" onClick={deleteSequence}>
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
