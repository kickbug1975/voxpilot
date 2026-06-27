'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startImport } from '@/actions/imports';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Upload, FileText, ChevronRight, ShieldAlert, CheckCircle2, Clock } from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
}

interface PriceImport {
  id: string;
  file_name: string;
  sheet_name: string | null;
  status: string;
  total_rows: number | null;
  valid_rows: number | null;
  error_rows: number | null;
  created_at: string;
  suppliers?: { name: string } | null;
}

interface ImportsPageClientProps {
  orgSlug: string;
  initialImports: PriceImport[];
  suppliers: Supplier[];
  error: string | null;
}

export default function ImportsPageClient({
  orgSlug,
  initialImports,
  suppliers,
  error: fetchError,
}: ImportsPageClientProps) {
  const router = useRouter();
  const [imports] = useState<PriceImport[]>(initialImports);
  const [error, setError] = useState<string | null>(fetchError);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);
    const file = formData.get('file') as File;

    if (!selectedSupplierId) {
      setError("Veuillez sélectionner un fournisseur.");
      return;
    }
    if (!file || file.size === 0) {
      setError("Veuillez choisir un fichier tarif (Excel, CSV, PDF ou Image).");
      return;
    }

    startTransition(async () => {
      try {
        const result = await startImport(orgSlug, selectedSupplierId, formData);
        if (result.error) {
          throw new Error(result.error);
        }

        if (result.importId) {
          setSuccess("Fichier téléversé avec succès ! Redirection vers l'étape de mapping...");
          router.push(`/${orgSlug}/imports/${result.importId}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Une erreur est survenue lors de l\'upload.';
        setError(message);
      }
    });
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'confirmed': return "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20";
      case 'review': return "bg-amber-500/10 text-amber-600 border border-amber-500/20";
      case 'uploaded': return "bg-sky-500/10 text-sky-600 border border-sky-500/20";
      case 'mapping': return "bg-indigo-500/10 text-indigo-600 border border-indigo-500/20";
      case 'validating': return "bg-blue-500/10 text-blue-600 border border-blue-500/20";
      case 'failed': return "bg-destructive/10 text-destructive border border-destructive/20";
      default: return "bg-slate-100 text-slate-650";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'uploaded': return "Téléversé";
      case 'mapping': return "Mapping";
      case 'validating': return "Validation";
      case 'review': return "Revue requise";
      case 'confirmed': return "Confirmé";
      case 'failed': return "Échoué";
      case 'cancelled': return "Annulé";
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{"Tarifs & Imports"}</h2>
        <p className="text-sm text-slate-500">
          {"Importez de nouveaux fichiers de tarifs fournisseurs pour actualiser vos coûts et vos alertes."}
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Panel */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden p-6 h-fit">
          <h3 className="font-bold text-slate-900 text-base mb-4 flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            {"Nouvel import"}
          </h3>

          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid gap-1">
              <Label htmlFor="supplier" className="text-xs font-semibold text-slate-700">{"Fournisseur *"}</Label>
              <select 
                id="supplier" 
                name="supplierId"
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                required
                className="flex h-9 w-full rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">{"Sélectionnez un fournisseur"}</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="grid gap-1">
              <Label htmlFor="file" className="text-xs font-semibold text-slate-700">{"Fichier tarif (Excel, CSV, PDF, Image) *"}</Label>
              <div className="border border-dashed border-slate-200 rounded-lg p-6 text-center hover:bg-slate-50/50 transition-colors relative cursor-pointer group">
                <input 
                  id="file" 
                  name="file" 
                  type="file" 
                  accept=".csv, .xlsx, .xls, .pdf, .png, .jpg, .jpeg"
                  required
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="space-y-2">
                  <FileText className="h-8 w-8 text-slate-400 mx-auto group-hover:text-primary transition-colors" />
                  <div className="text-xs text-slate-650 font-medium">
                    {"Cliquez ou glissez un fichier"}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {"Excel, CSV, PDF ou Image jusqu'à 10 Mo"}
                  </div>
                </div>
              </div>
            </div>

            <Button 
              type="submit" 
              disabled={isPending} 
              className="w-full bg-primary hover:bg-primary/90 text-white font-semibold cursor-pointer"
            >
              {isPending ? 'Téléversement...' : 'Lancer l\'importation'}
            </Button>
          </form>
        </div>

        {/* History Panel */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            <h3 className="font-bold text-slate-900 text-sm">{"Historique des tarifs importés"}</h3>
          </div>

          {imports.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              {"Aucun fichier n'a été importé pour le moment."}
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-semibold text-slate-700">{"Fichier / Source"}</TableHead>
                  <TableHead className="font-semibold text-slate-700">{"Fournisseur"}</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">{"Lignes"}</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">{"Statut"}</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">{"Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((imp) => (
                  <TableRow key={imp.id} className="hover:bg-slate-50/50">
                    <TableCell className="font-medium text-slate-900">
                      <div className="truncate max-w-[200px]" title={imp.file_name}>
                        {imp.file_name}
                      </div>
                      <span className="block text-[10px] text-slate-400">
                        {new Date(imp.created_at).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-650 font-medium">
                      {imp.suppliers?.name || 'Fournisseur inconnu'}
                    </TableCell>
                    <TableCell className="text-right text-slate-500 font-mono text-xs">
                      {imp.total_rows || 0}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadgeClass(imp.status)}`}>
                        {getStatusLabel(imp.status)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-primary hover:bg-primary/5 cursor-pointer font-semibold"
                        onClick={() => router.push(`/${orgSlug}/imports/${imp.id}`)}
                      >
                        {"Voir"}
                        <ChevronRight className="h-4 w-4 ml-0.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
