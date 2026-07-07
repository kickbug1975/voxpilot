'use client';

import React, { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Search, 
  ShoppingCart, 
  MessageSquare, 
  Mic, 
  Calendar,
  CheckCircle,
  XCircle,
  Trash2,
  Eye,
  RefreshCw,
  Clock,
  ArrowLeft
} from 'lucide-react';
import { updateOrderStatus, deleteOrder } from '@/actions/orders';

interface OrderItem {
  id: string;
  product_name: string;
  quantity_kg: number;
}

interface Order {
  id: string;
  order_number: number;
  client_name: string;
  status: string; // 'pending_validation', 'transmitted', 'validated', 'cancelled'
  source_channel: string; // 'meeting', 'whatsapp', 'vapi'
  delivery_date: string | null;
  created_at: string;
  order_items?: OrderItem[];
}

interface OrdersPageClientProps {
  orgSlug: string;
  initialOrders: Order[];
  error: string | null;
}

export default function OrdersPageClient({
  orgSlug,
  initialOrders,
  error: fetchError,
}: OrdersPageClientProps) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [error, setError] = useState<string | null>(fetchError);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Modal Detail State
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Filtering State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch = 
        order.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(order.order_number).includes(searchQuery) ||
        (order.order_items || []).some(item => item.product_name.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const matchesChannel = channelFilter === 'all' || order.source_channel === channelFilter;

      return matchesSearch && matchesStatus && matchesChannel;
    });
  }, [orders, searchQuery, statusFilter, channelFilter]);

  const handleUpdateStatus = (orderId: string, newStatus: string) => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await updateOrderStatus(orgSlug, orderId, newStatus);
      if (result.error) {
        setError(result.error);
      } else if (result.success && result.data) {
        setSuccess(`Le statut de la commande #${result.data.order_number} a été mis à jour.`);
        // Mettre à jour l'état local
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
        
        // Mettre à jour la commande sélectionnée dans la modal si ouverte
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder(prev => prev ? { ...prev, status: newStatus } : null);
        }
      }
    });
  };

  const handleDeleteOrder = (orderId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette commande définitivement ?')) return;
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await deleteOrder(orgSlug, orderId);
      if (result.error) {
        setError(result.error);
      } else if (result.success) {
        setSuccess('La commande a été supprimée avec succès.');
        setOrders(prev => prev.filter(o => o.id !== orderId));
        setIsDetailOpen(false);
        setSelectedOrder(null);
      }
    });
  };

  // Helpers pour les badges de statut et de canaux
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_validation':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">En attente</Badge>;
      case 'transmitted':
        return <Badge className="bg-sky-100 text-sky-800 border-sky-200">Transmis</Badge>;
      case 'validated':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Validé</Badge>;
      case 'cancelled':
        return <Badge className="bg-rose-100 text-rose-800 border-rose-200">Annulé</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-800">{status}</Badge>;
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'whatsapp':
        return <span className="flex items-center gap-1.5 text-emerald-600 font-medium"><MessageSquare className="h-4 w-4" /> WhatsApp</span>;
      case 'vapi':
      case 'meeting':
        return <span className="flex items-center gap-1.5 text-indigo-600 font-medium"><Mic className="h-4 w-4" /> Dictée Vocale</span>;
      default:
        return <span className="flex items-center gap-1.5 text-slate-600 font-medium"><ShoppingCart className="h-4 w-4" /> CRM</span>;
    }
  };

  return (
    <div className="flex-1 space-y-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 flex items-center gap-2">
            <ShoppingCart className="h-8 w-8 text-brand-600" />
            Commandes
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gérez et visualisez toutes les commandes vocales et WhatsApp reçues pour votre organisation.
          </p>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <Card className="border-rose-200 bg-rose-50 text-rose-900">
          <CardContent className="py-3 px-4 text-sm font-medium flex items-center gap-2">
            <XCircle className="h-5 w-5 text-rose-500 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {success && (
        <Card className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <CardContent className="py-3 px-4 text-sm font-medium flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
            {success}
          </CardContent>
        </Card>
      )}

      {/* Filters Card */}
      <Card className="border-slate-200/60 shadow-sm bg-white">
        <CardContent className="p-4 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Rechercher par client ou produit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-slate-50 border-slate-200 focus:bg-white transition-all"
            />
          </div>
          
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-800 focus:bg-white focus:outline-none transition-all cursor-pointer"
              >
                <option value="all">Tous les statuts</option>
                <option value="pending_validation">En attente de validation</option>
                <option value="transmitted">Transmis</option>
                <option value="validated">Validé</option>
                <option value="cancelled">Annulé</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-800 focus:bg-white focus:outline-none transition-all cursor-pointer"
              >
                <option value="all">Tous les canaux</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="meeting">Dictée Vocale</option>
              </select>
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setChannelFilter('all');
              }}
              title="Réinitialiser les filtres"
              className="border-slate-200"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card className="border-slate-200/60 shadow-sm bg-white overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50 border-b border-slate-200/60">
            <TableRow>
              <TableHead className="w-[100px] font-semibold text-slate-900">N° Commande</TableHead>
              <TableHead className="font-semibold text-slate-900">Client</TableHead>
              <TableHead className="font-semibold text-slate-900">Date de réception</TableHead>
              <TableHead className="font-semibold text-slate-900">Canal</TableHead>
              <TableHead className="font-semibold text-slate-900">Articles</TableHead>
              <TableHead className="font-semibold text-slate-900 text-center">Statut</TableHead>
              <TableHead className="w-[120px] font-semibold text-slate-900 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.length > 0 ? (
              filteredOrders.map((order) => {
                const itemsCount = order.order_items?.length || 0;
                const dateStr = new Date(order.created_at).toLocaleString('fr-FR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Europe/Brussels'
                });

                return (
                  <TableRow key={order.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell className="font-semibold text-brand-600">
                      #{order.order_number}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {order.client_name}
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {dateStr}
                    </TableCell>
                    <TableCell>
                      {getChannelIcon(order.source_channel)}
                    </TableCell>
                    <TableCell className="text-slate-700 max-w-[250px] truncate">
                      {order.order_items && order.order_items.length > 0 
                        ? order.order_items.map(i => i.product_name).join(', ')
                        : 'Aucun article'}
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(order.status)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedOrder(order);
                            setIsDetailOpen(true);
                          }}
                          title="Voir le détail"
                          className="hover:bg-slate-100 text-slate-700"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-slate-400 font-medium">
                  Aucune commande ne correspond aux filtres.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Detail Modal Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        {selectedOrder && (
          <DialogContent className="sm:max-w-[550px] bg-white border border-slate-200">
            <DialogHeader className="border-b border-slate-100 pb-4">
              <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                Commande #{selectedOrder.order_number}
                {getStatusBadge(selectedOrder.status)}
              </DialogTitle>
              <DialogDescription className="text-slate-400 text-sm mt-1">
                Origine : {getChannelIcon(selectedOrder.source_channel)} | Reçue le {new Date(selectedOrder.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Brussels' })}
              </DialogDescription>
            </DialogHeader>

            <div className="py-6 space-y-6">
              {/* Client Info */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Client / Prospect</Label>
                <p className="text-base font-bold text-slate-900">{selectedOrder.client_name}</p>
              </div>

              {/* Delivery Date */}
              {selectedOrder.delivery_date && (
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Date de livraison prévue</Label>
                  <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-slate-500" />
                    {new Date(selectedOrder.delivery_date).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              )}

              {/* Order Items */}
              <div className="space-y-3 bg-slate-50/50 border border-slate-100 rounded-lg p-4">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Articles Commandés</Label>
                <div className="divide-y divide-slate-100">
                  {selectedOrder.order_items && selectedOrder.order_items.length > 0 ? (
                    selectedOrder.order_items.map((item) => (
                      <div key={item.id} className="py-2.5 flex justify-between text-sm">
                        <span className="font-semibold text-slate-900">{item.product_name}</span>
                        <span className="font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded text-xs">{item.quantity_kg} kg</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400 py-2">Aucun article enregistré.</p>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row gap-3">
              {/* Delete Button (Left aligned on Desktop) */}
              <div className="flex-1 flex justify-start">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleDeleteOrder(selectedOrder.id)}
                  disabled={isPending}
                  className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 w-full sm:w-auto"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Supprimer
                </Button>
              </div>

              {/* Action Buttons (Right aligned) */}
              <div className="flex flex-wrap gap-2 justify-end">
                {selectedOrder.status === 'pending_validation' && (
                  <Button
                    type="button"
                    onClick={() => handleUpdateStatus(selectedOrder.id, 'transmitted')}
                    disabled={isPending}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm w-full sm:w-auto"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Valider / Transmettre
                  </Button>
                )}
                
                {selectedOrder.status !== 'cancelled' ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleUpdateStatus(selectedOrder.id, 'cancelled')}
                    disabled={isPending}
                    className="border-slate-200 text-slate-700 hover:bg-slate-50 w-full sm:w-auto"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Annuler la commande
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => handleUpdateStatus(selectedOrder.id, 'pending_validation')}
                    disabled={isPending}
                    className="bg-brand-600 hover:bg-brand-700 text-white font-medium shadow-sm w-full sm:w-auto"
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    Remettre en attente
                  </Button>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
