"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Upload,
  Users,
  MoreHorizontal,
  Trash2,
  Edit2,
  Download,
  Loader2,
  ChevronLeft,
  Search,
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
import type { ListWithCount } from "@/lib/actions/lists";
import {
  createList as serverCreateList,
  renameList as serverRenameList,
  deleteList as serverDeleteList,
  getListWithLeads as serverGetListWithLeads,
} from "@/lib/actions/lists";
import type { Lead } from "@/types/leads";

interface ListsClientProps {
  initialLists: ListWithCount[];
}

type ListItem = ListWithCount & { leads?: Lead[] };

export default function ListsClient({ initialLists }: ListsClientProps) {
  const [lists, setLists] = useState<ListItem[]>(initialLists);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedList, setSelectedList] = useState<ListItem | null>(null);
  const [viewingList, setViewingList] = useState<(ListItem & { leads?: Lead[] }) | null>(null);
  const [newName, setNewName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingLeads, setLoadingLeads] = useState(false);

  const createList = async () => {
    if (!newName.trim()) return;
    const result = await serverCreateList(newName);
    if (result.success) {
      setLists((prev) => [...prev, result.data]);
      toast.success("Liste créée");
    } else {
      toast.error(result.error || "Erreur lors de la création");
    }
    setNewName("");
    setCreateOpen(false);
  };

  const renameListAction = async () => {
    if (!newName.trim() || !selectedList) return;
    const result = await serverRenameList(selectedList.id, newName);
    if (result.success) {
      setLists((prev) =>
        prev.map((l) => (l.id === selectedList.id ? { ...l, name: newName } : l))
      );
      toast.success("Liste renommée");
    } else {
      toast.error(result.error || "Erreur lors du renommage");
    }
    setNewName("");
    setRenameOpen(false);
    setSelectedList(null);
  };

  const deleteListAction = async () => {
    if (!selectedList) return;
    const result = await serverDeleteList(selectedList.id);
    if (result.success) {
      setLists((prev) => prev.filter((l) => l.id !== selectedList.id));
      toast.success("Liste supprimée");
    } else {
      toast.error(result.error || "Erreur lors de la suppression");
    }
    setDeleteOpen(false);
    setSelectedList(null);
  };

  const handleImportCSV = async () => {
    toast.info("Pour importer des leads via CSV, utilisez la page Pipeline.");
    setImportOpen(false);
  };

  const openRename = (list: ListItem) => {
    setSelectedList(list);
    setNewName(list.name);
    setRenameOpen(true);
  };

  const openDelete = (list: ListItem) => {
    setSelectedList(list);
    setDeleteOpen(true);
  };

  const openListDetail = async (list: ListItem) => {
    setViewingList({ ...list, leads: undefined });
    setLoadingLeads(true);
    const result = await serverGetListWithLeads(list.id);
    if (result.success) {
      setViewingList({ ...result.data });
    } else {
      setViewingList({ ...list, leads: [] });
      toast.error("Erreur lors du chargement des leads");
    }
    setLoadingLeads(false);
  };

  // Detail view
  if (viewingList) {
    const leads = viewingList.leads ?? [];
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => { setViewingList(null); setSearchQuery(""); }}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{viewingList.name}</h1>
            <p className="text-muted-foreground">
              {viewingList.leadsCount} leads &middot; Cr&eacute;&eacute;e le{" "}
              {new Date(viewingList.createdAt).toLocaleDateString("fr-FR")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher dans la liste..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 rounded-lg border border-border bg-muted/50 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
          </div>
          <Badge variant="secondary" className="rounded-full">
            {leads.length} leads affich&eacute;s
          </Badge>
        </div>

        {loadingLeads ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground bg-transparent">
                    Nom
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground bg-transparent">
                    Titre
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground bg-transparent">
                    Entreprise
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground bg-transparent">
                    Score
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground bg-transparent">
                    Statut
                  </th>
                </tr>
              </thead>
              <tbody>
                {leads
                  .filter(
                    (l) =>
                      !searchQuery ||
                      `${l.firstName} ${l.lastName}`
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase()) ||
                      (l.company ?? "").toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-b border-border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => (window.location.href = `/pipeline/${lead.id}`)}
                    >
                      <td className="px-4 py-3 font-medium">
                        {lead.displayName}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {lead.title}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {lead.company}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            lead.score >= 70
                              ? "destructive"
                              : lead.score >= 50
                              ? "warning"
                              : "secondary"
                          }
                          className="font-mono rounded-full"
                        >
                          {lead.score}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="rounded-full">
                          {lead.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {leads.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                Aucun lead dans cette liste
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Listes</h1>
          <p className="text-muted-foreground">Organisez vos leads en listes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
          <Button variant="accent" onClick={() => { setNewName(""); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle liste
          </Button>
        </div>
      </div>

      {/* Lists Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {lists.map((list) => (
          <div
            key={list.id}
            className="bg-card rounded-lg border border-border transition-all duration-200 cursor-pointer"
          >
            <div className="flex items-start justify-between p-5 pb-2">
              <div onClick={() => openListDetail(list)} className="flex-1 min-w-0">
                <h3 className="text-base font-semibold truncate">{list.name}</h3>
                <p className="text-sm text-muted-foreground">
                  Cr&eacute;&eacute;e le{" "}
                  {new Date(list.createdAt).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openRename(list)}>
                    <Edit2 className="mr-2 h-4 w-4" />
                    Renommer
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toast.info("Fonctionnalité à venir")}>
                    Ajouter &agrave; une s&eacute;quence
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toast.info("Fonctionnalité à venir")}>
                    <Download className="mr-2 h-4 w-4" />
                    Exporter CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => openDelete(list)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Supprimer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="px-5 pb-5 pt-2" onClick={() => openListDetail(list)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{list.leadsCount}</span>
                  <span className="text-muted-foreground">leads</span>
                </div>
                <Button variant="outline" size="sm">
                  Voir
                </Button>
              </div>
            </div>
          </div>
        ))}

        {/* Create New List Card */}
        <div
          className="flex items-center justify-center border-2 border-dashed border-border hover:border-accent rounded-lg transition-all duration-200 cursor-pointer min-h-[150px]"
          onClick={() => { setNewName(""); setCreateOpen(true); }}
        >
          <div className="text-center py-8">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Plus className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="font-medium">Cr&eacute;er une liste</h3>
            <p className="text-sm text-muted-foreground">Organisez vos leads</p>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle>Nouvelle liste</DialogTitle>
            <DialogDescription>
              Cr&eacute;ez une nouvelle liste pour organiser vos leads.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Nom de la liste
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: CEO Tech France"
                className="w-full h-11 rounded-lg border border-border bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") createList();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button variant="accent" onClick={createList} disabled={!newName.trim()}>
              <Plus className="mr-2 h-4 w-4" />
              Cr&eacute;er
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Modal */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle>Renommer la liste</DialogTitle>
            <DialogDescription>
              Modifiez le nom de la liste &laquo; {selectedList?.name} &raquo;
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Nouveau nom
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full h-11 rounded-lg border border-border bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") renameListAction();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Annuler
            </Button>
            <Button variant="accent" onClick={renameListAction} disabled={!newName.trim()}>
              Renommer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle>Supprimer la liste</DialogTitle>
            <DialogDescription>
              &Ecirc;tes-vous s&ucirc;r de vouloir supprimer la liste &laquo;{" "}
              {selectedList?.name} &raquo; ? Cette action est irr&eacute;versible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={deleteListAction}>
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import CSV Modal */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="rounded-lg">
          <DialogHeader>
            <DialogTitle>Importer des leads</DialogTitle>
            <DialogDescription>
              Importez un fichier CSV pour cr&eacute;er une nouvelle liste de leads.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">Glissez un fichier CSV ici</h3>
              <p className="text-sm text-muted-foreground mb-4">
                ou cliquez pour s&eacute;lectionner un fichier
              </p>
              <Button
                variant="outline"
                onClick={handleImportCSV}
                disabled={isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importation en cours...
                  </>
                ) : (
                  "Sélectionner un fichier"
                )}
              </Button>
              <p className="text-xs text-muted-foreground mt-4">
                Format attendu : firstName, lastName, title, company, linkedinUrl
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
