import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, TrendingUp, Settings, Package, Plus, Trash2, Save, LogOut, ShieldAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface BotService {
  id: string;
  name: string;
  cup: number;
  emoji: string;
  category: string;
  duration_months: number | null;
  sort_order: number;
}

const AdminPanel = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  // Stats
  const [users, setUsers] = useState(0);
  const [deals, setDeals] = useState(0);

  // Config
  const [config, setConfig] = useState<Record<string, any>>({});

  // Services
  const [services, setServices] = useState<BotService[]>([]);
  const [newService, setNewService] = useState({ id: "", name: "", cup: "", emoji: "📦", category: "service", duration_months: "", sort_order: "0" });

  const adminCall = useCallback(async (action: string, extra: Record<string, any> = {}) => {
    const { data, error } = await supabase.functions.invoke("admin-api", {
      body: { action, token, ...extra },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }, [token]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stats, cfg, svcs] = await Promise.all([
        adminCall("get_stats"),
        adminCall("get_config"),
        adminCall("get_services"),
      ]);
      setUsers(stats.users);
      setDeals(stats.deals);
      setConfig(cfg);
      setServices(svcs);
      setAuthenticated(true);
    } catch (e: any) {
      setUnauthorized(true);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [adminCall]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setUnauthorized(true);
      return;
    }
    loadAll();
  }, [token, loadAll]);

  const updateConfig = async (key: string, value: any) => {
    try {
      await adminCall("update_config", { key, value });
      setConfig(prev => ({ ...prev, [key]: value }));
      toast({ title: "✅ Configuración actualizada" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const updateService = async (svc: BotService) => {
    try {
      await adminCall("update_service", svc);
      toast({ title: `✅ ${svc.name} actualizado` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const addService = async () => {
    if (!newService.id || !newService.name || !newService.cup) {
      toast({ title: "Completa ID, nombre y precio", variant: "destructive" });
      return;
    }
    try {
      await adminCall("add_service", {
        ...newService,
        cup: parseInt(newService.cup),
        sort_order: parseInt(newService.sort_order) || 0,
        duration_months: newService.duration_months ? parseInt(newService.duration_months) : null,
      });
      setNewService({ id: "", name: "", cup: "", emoji: "📦", category: "service", duration_months: "", sort_order: "0" });
      await loadAll();
      toast({ title: "✅ Servicio agregado" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const deleteService = async (id: string) => {
    try {
      await adminCall("delete_service", { id });
      setServices(prev => prev.filter(s => s.id !== id));
      toast({ title: "✅ Servicio eliminado" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Verificando acceso...</p>
      </div>
    );
  }

  if (unauthorized || !authenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <ShieldAlert className="w-10 h-10 mx-auto text-destructive mb-2" />
            <CardTitle>Acceso Restringido</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            <p>Este panel solo es accesible desde Telegram.</p>
            <p className="mt-2 text-sm">Usa el botón <b>"⚙️ Panel de Administrador"</b> en tu cuenta del bot.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const smPackages = config.sm_packages || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between shadow-md">
        <h1 className="font-bold text-lg">⚙️ Panel Admin</h1>
      </header>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="w-8 h-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{users}</p>
                <p className="text-xs text-muted-foreground">Usuarios</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{deals}</p>
                <p className="text-xs text-muted-foreground">Negocios exitosos</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="prices">
          <TabsList className="w-full">
            <TabsTrigger value="prices" className="flex-1"><Settings className="w-4 h-4 mr-1" />Precios</TabsTrigger>
            <TabsTrigger value="services" className="flex-1"><Package className="w-4 h-4 mr-1" />Servicios</TabsTrigger>
          </TabsList>

          {/* Prices Tab */}
          <TabsContent value="prices" className="space-y-4">
            {/* Exchange rates */}
            <Card>
              <CardHeader><CardTitle className="text-base">💰 Tasas de Cambio</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-sm text-muted-foreground">Compra USDT (CUP por 1 USDT)</label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="number"
                      value={config.buy_rate || ""}
                      onChange={e => setConfig(prev => ({ ...prev, buy_rate: parseInt(e.target.value) || 0 }))}
                    />
                    <Button size="sm" onClick={() => updateConfig("buy_rate", config.buy_rate)}>
                      <Save className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Venta USDT (CUP por 1 USDT)</label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      type="number"
                      value={config.sell_rate || ""}
                      onChange={e => setConfig(prev => ({ ...prev, sell_rate: parseInt(e.target.value) || 0 }))}
                    />
                    <Button size="sm" onClick={() => updateConfig("sell_rate", config.sell_rate)}>
                      <Save className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SM Packages */}
            <Card>
              <CardHeader><CardTitle className="text-base">📱 Paquetes de Saldo Móvil</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {smPackages.map((pkg: any, i: number) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      type="number"
                      placeholder="SM"
                      value={pkg.sm}
                      onChange={e => {
                        const newPkgs = [...smPackages];
                        newPkgs[i] = { ...newPkgs[i], sm: parseInt(e.target.value) || 0 };
                        setConfig(prev => ({ ...prev, sm_packages: newPkgs }));
                      }}
                      className="w-24"
                    />
                    <span className="text-muted-foreground text-sm">SM =</span>
                    <Input
                      type="number"
                      placeholder="CUP"
                      value={pkg.cup}
                      onChange={e => {
                        const newPkgs = [...smPackages];
                        newPkgs[i] = { ...newPkgs[i], cup: parseInt(e.target.value) || 0 };
                        setConfig(prev => ({ ...prev, sm_packages: newPkgs }));
                      }}
                      className="w-24"
                    />
                    <span className="text-muted-foreground text-sm">CUP</span>
                    <Button size="icon" variant="ghost" onClick={() => {
                      const newPkgs = smPackages.filter((_: any, j: number) => j !== i);
                      setConfig(prev => ({ ...prev, sm_packages: newPkgs }));
                      updateConfig("sm_packages", newPkgs);
                    }}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    const newPkgs = [...smPackages, { sm: 0, cup: 0 }];
                    setConfig(prev => ({ ...prev, sm_packages: newPkgs }));
                  }}>
                    <Plus className="w-4 h-4 mr-1" /> Agregar paquete
                  </Button>
                  <Button size="sm" onClick={() => updateConfig("sm_packages", smPackages)}>
                    <Save className="w-4 h-4 mr-1" /> Guardar todo
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Services Tab */}
          <TabsContent value="services" className="space-y-4">
            {/* Regular services */}
            <Card>
              <CardHeader><CardTitle className="text-base">⚡ Servicios</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {services.filter(s => s.category === "service").map(svc => (
                  <div key={svc.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={svc.emoji}
                        onChange={e => setServices(prev => prev.map(s => s.id === svc.id ? { ...s, emoji: e.target.value } : s))}
                        className="w-16"
                      />
                      <Input
                        value={svc.name}
                        onChange={e => setServices(prev => prev.map(s => s.id === svc.id ? { ...s, name: e.target.value } : s))}
                        className="flex-1"
                      />
                    </div>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="number"
                        value={svc.cup}
                        onChange={e => setServices(prev => prev.map(s => s.id === svc.id ? { ...s, cup: parseInt(e.target.value) || 0 } : s))}
                        className="w-28"
                      />
                      <span className="text-sm text-muted-foreground">CUP</span>
                      <Button size="sm" onClick={() => updateService(svc)}><Save className="w-4 h-4" /></Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteService(svc.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Telegram Premium */}
            <Card>
              <CardHeader><CardTitle className="text-base">✨ Telegram Premium</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {services.filter(s => s.category === "telegram_premium").map(svc => (
                  <div key={svc.id} className="flex gap-2 items-center border rounded-lg p-3">
                    <span className="text-sm font-medium w-20">{svc.name}</span>
                    <Input
                      type="number"
                      value={svc.cup}
                      onChange={e => setServices(prev => prev.map(s => s.id === svc.id ? { ...s, cup: parseInt(e.target.value) || 0 } : s))}
                      className="w-28"
                    />
                    <span className="text-sm text-muted-foreground">CUP</span>
                    <Button size="sm" onClick={() => updateService(svc)}><Save className="w-4 h-4" /></Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteService(svc.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Add new service */}
            <Card>
              <CardHeader><CardTitle className="text-base"><Plus className="w-4 h-4 inline mr-1" />Agregar Servicio</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="ID (ej: vpn)" value={newService.id} onChange={e => setNewService(prev => ({ ...prev, id: e.target.value }))} />
                  <Input placeholder="Emoji" value={newService.emoji} onChange={e => setNewService(prev => ({ ...prev, emoji: e.target.value }))} />
                  <Input placeholder="Nombre" value={newService.name} onChange={e => setNewService(prev => ({ ...prev, name: e.target.value }))} className="col-span-2" />
                  <Input type="number" placeholder="Precio CUP" value={newService.cup} onChange={e => setNewService(prev => ({ ...prev, cup: e.target.value }))} />
                  <select
                    value={newService.category}
                    onChange={e => setNewService(prev => ({ ...prev, category: e.target.value }))}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="service">Servicio</option>
                    <option value="telegram_premium">Telegram Premium</option>
                  </select>
                </div>
                {newService.category === "telegram_premium" && (
                  <Input type="number" placeholder="Duración (meses)" value={newService.duration_months} onChange={e => setNewService(prev => ({ ...prev, duration_months: e.target.value }))} />
                )}
                <Button onClick={addService} className="w-full">
                  <Plus className="w-4 h-4 mr-1" /> Agregar Servicio
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminPanel;
