'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrders } from '@/hooks/useOrders';
import { Restaurant, WebhookLog, OrderStatus } from '@/types';
import OrderTable from './OrderTable';
import CustomersPanel from './CustomersPanel';
import ReportsPanel from './ReportsPanel';
import MenuPanel from './MenuPanel';
import SimulatorPanel from './SimulatorPanel';
import KitchenDisplay from './KitchenDisplay';
import DeliveryDisplay from './DeliveryDisplay';
import { useAuth, getDefaultPermissions, StaffPermissions } from '@/context/AuthContext';
import SaaSAdminPanel from './SaaSAdminPanel';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TableSkeleton, MetricSkeleton, CardSkeleton } from '@/components/Skeletons';
import { 
  Utensils, 
  ClipboardList, 
  Users, 
  Terminal, 
  Settings2, 
  DollarSign, 
  ShoppingBag, 
  Bell, 
  Truck, 
  CheckCircle,
  Database,
  Loader2,
  RefreshCw,
  AlertCircle,
  BarChart3,
  LogOut,
  UserCheck,
  History,
  UserPlus,
  Trash2,
  Edit,
  Key,
  Eye,
  EyeOff,
  X,
  BookOpen,
  MessageSquare,
  ShieldCheck
} from 'lucide-react';

const formatOrderCode = (code: string | null): string => {
  if (!code) return '';
  const match = code.match(/(\d{13})/);
  if (!match) return code;
  
  const numCode = match[1];
  const year = numCode.slice(0, 4);
  const month = numCode.slice(4, 6);
  const day = numCode.slice(6, 8);
  const seq = numCode.slice(8);
  return code.replace(numCode, `${year}-${month}-${day}-${seq}`);
};

export default function Dashboard() {
  const { user, profile, role, isSuperAdmin, permissions, logout, loading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'orders' | 'customers' | 'logs' | 'settings' | 'reports' | 'staff' | 'audit' | 'menu' | 'simulator' | 'saas'>('orders');
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [restaurantLoading, setRestaurantLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [bootstrapping, setBootstrapping] = useState<boolean>(false);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);
  
  // Real-time toast alert state
  const prevOrdersCount = useRef<number | null>(null);

  // Self-profile states
  const [profileFirstName, setProfileFirstName] = useState('');
  const [profileLastName, setProfileLastName] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Staff management states
  const [staffList, setStaffList] = useState<any[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  // Modal / Form states for creation
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffFullName, setStaffFullName] = useState('');
  const [staffRole, setStaffRole] = useState<'vendedor_cajero' | 'cocinero' | 'repartidor'>('vendedor_cajero');
  const [staffPermissions, setStaffPermissions] = useState<StaffPermissions>(getDefaultPermissions('vendedor_cajero'));
  const [addStaffLoading, setAddStaffLoading] = useState(false);
  const [addStaffError, setAddStaffError] = useState<string | null>(null);

  // Edit / Password Reset states
  const [editingStaffMember, setEditingStaffMember] = useState<any | null>(null);
  const [showEditStaffModal, setShowEditStaffModal] = useState(false);
  const [editStaffFullName, setEditStaffFullName] = useState('');
  const [editStaffRole, setEditStaffRole] = useState<'admin_general' | 'vendedor_cajero' | 'cocinero' | 'repartidor'>('vendedor_cajero');
  const [editStaffPassword, setEditStaffPassword] = useState('');
  const [editStaffPermissions, setEditStaffPermissions] = useState<StaffPermissions>(getDefaultPermissions('vendedor_cajero'));
  const [editStaffLoading, setEditStaffLoading] = useState(false);
  const [editStaffError, setEditStaffError] = useState<string | null>(null);

  // Audit logs states
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const activePermissions = permissions || getDefaultPermissions(role);

  const modulesConfig = [
    { key: 'orders', label: 'Pedidos', desc: 'Gestionar pedidos de clientes' },
    { key: 'customers', label: 'Clientes', desc: 'Ver y fidelizar base de clientes' },
    { key: 'menu', label: 'Carta / Menú', desc: 'Configurar platos y categorías' },
    { key: 'simulator', label: 'Simulador WhatsApp', desc: 'Probar pedidos simulados' },
    { key: 'reports', label: 'Reportes', desc: 'Analíticas y descargas Excel/PDF' },
    { key: 'logs', label: 'Historial Webhooks', desc: 'Ver logs técnicos de Meta/Gemini' },
    { key: 'staff', label: 'Gestión Personal', desc: 'Administrar accesos y seguimiento' },
    { key: 'settings', label: 'Ajustes', desc: 'Ver perfil y llaves de API' },
  ] as const;
  const [auditFilterAction, setAuditFilterAction] = useState<string>('all');

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Dynamic Tab Guarding: redirect to the first available tab if current tab is forbidden (has 'none' permission)
  useEffect(() => {
    const activePerms = permissions || getDefaultPermissions(role);
    if (!activePerms) return;

    const tabToPermissionKey: Record<string, keyof StaffPermissions> = {
      orders: 'orders',
      customers: 'customers',
      menu: 'menu',
      simulator: 'simulator',
      logs: 'logs',
      reports: 'reports',
      staff: 'staff',
      audit: 'staff', // audit logs are grouped under staff permission
      settings: 'settings',
    };

    const permKey = tabToPermissionKey[activeTab];
    if (permKey && activePerms[permKey] === 'none') {
      const tabPreferenceOrder: typeof activeTab[] = [
        'orders',
        'menu',
        'simulator',
        'customers',
        'reports',
        'settings',
        'staff',
        'audit',
        'logs'
      ];
      const allowedTab = tabPreferenceOrder.find(t => {
        const pk = tabToPermissionKey[t];
        return pk && activePerms[pk] !== 'none';
      });
      if (allowedTab) {
        setActiveTab(allowedTab);
      }
    }
  }, [permissions, role, activeTab]);

  // Prepopulate self-profile name fields
  useEffect(() => {
    if (profile) {
      setProfileFirstName(profile.first_name || '');
      setProfileLastName(profile.last_name || '');
    }
  }, [profile]);

  // Fetch restaurant profile — MUST wait for auth to settle first.
  // Depends on [authLoading, user] so it re-runs when:
  //   1. Auth finishes loading (authLoading goes false)
  //   2. User changes (e.g. TOKEN_REFRESHED triggers fetchUserData which sets user again)
  useEffect(() => {
    // Don't fetch until auth is fully resolved
    if (authLoading) return;
    // Don't re-fetch if already loaded
    if (restaurant) return;

    let isMounted = true;

    const fetchRestaurant = async (attempt = 1) => {
      if (!isMounted) return;
      setRestaurantLoading(true);
      try {
        const { data, error } = await supabase
          .from('restaurants')
          .select('*')
          .limit(1);

        if (error) {
          // If we get an auth-related error, retry once after a short delay
          if (attempt === 1 && (error.message?.includes('JWT') || error.message?.includes('token') || error.code === 'PGRST301' || error.code === '401')) {
            console.warn('Restaurant fetch got auth error, retrying in 1s...', error.message);
            setTimeout(() => fetchRestaurant(2), 1000);
            return;
          }
          throw error;
        }

        if (isMounted && data && data.length > 0) {
          setRestaurant(data[0]);
        }
      } catch (err) {
        console.error('Error fetching restaurant:', err);
      } finally {
        if (isMounted) {
          setRestaurantLoading(false);
        }
      }
    };

    fetchRestaurant();

    return () => {
      isMounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  // Hook into orders real-time stream
  const { 
    orders, 
    loading: ordersLoading, 
    updateOrderStatus, 
    updateOrderPaymentStatus,
    refreshOrders 
  } = useOrders(restaurant?.id || null);

  // Wrappers to log activity
  const logActivity = async (action: string, details: string) => {
    if (!restaurant?.id || !user?.id) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      await fetch('/api/activity', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          profile_id: user.id,
          action,
          details
        })
      });
    } catch (err) {
      console.error('Error logging activity:', err);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus): Promise<boolean> => {
    const success = await updateOrderStatus(orderId, status);
    if (success && restaurant?.id && profile?.id) {
      const order = orders.find(o => o.id === orderId);
      const code = formatOrderCode(order?.order_code || orderId.substring(0, 8));
      const customer = order?.customer_name || 'Cliente';
      
      await logActivity(
        'order_status_update',
        `Cambió el estado del pedido #${code} (${customer}) a: ${status}`
      );
    }
    return success;
  };

  const handleUpdatePaymentStatus = async (orderId: string, isPaid: boolean): Promise<boolean> => {
    const success = await updateOrderPaymentStatus(orderId, isPaid);
    if (success && restaurant?.id && profile?.id) {
      const order = orders.find(o => o.id === orderId);
      const code = formatOrderCode(order?.order_code || orderId.substring(0, 8));
      const customer = order?.customer_name || 'Cliente';
      
      await logActivity(
        isPaid ? 'payment_confirmed' : 'payment_revoked',
        isPaid 
          ? `Confirmó el pago del pedido #${code} (${customer})`
          : `Revocó el pago del pedido #${code} (${customer})`
      );
    }
    return success;
  };

  // Fetch staff list
  const fetchStaff = React.useCallback(async () => {
    setStaffLoading(true);
    setStaffError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No session token available');

      const res = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al obtener personal');
      setStaffList(data.staff || []);
    } catch (err: any) {
      console.error('Error fetching staff list:', err);
      setStaffError(err.message || 'Error al cargar la lista de personal.');
    } finally {
      setStaffLoading(false);
    }
  }, []);

  // Fetch audit logs
  const fetchAuditLogs = React.useCallback(async () => {
    if (!restaurant?.id) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select(`
          id,
          action,
          details,
          created_at,
          profiles (
            id,
            first_name,
            last_name
          )
        `)
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setAuditLogs(data || []);
    } catch (err: any) {
      console.error('Error fetching audit logs:', err);
      setAuditError(err.message || 'Error al cargar los logs de auditoría.');
    } finally {
      setAuditLoading(false);
    }
  }, [restaurant?.id]);

  useEffect(() => {
    if (activeTab === 'staff' && role === 'admin_general') {
      fetchStaff();
    }
    if (activeTab === 'audit' && role === 'admin_general') {
      fetchAuditLogs();
    }
  }, [activeTab, role, fetchStaff, fetchAuditLogs]);

  // Profile forms submit handlers
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setProfileLoading(true);
    setProfileMessage(null);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: profileFirstName.trim(),
          last_name: profileLastName.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;

      if (restaurant?.id) {
        await logActivity(
          'profile_updated',
          `Usuario actualizó sus datos de perfil a: ${profileFirstName} ${profileLastName}`
        );
      }

      setProfileMessage({ type: 'success', text: 'Perfil actualizado con éxito.' });
    } catch (err: any) {
      setProfileMessage({ type: 'error', text: err.message || 'Error al actualizar el perfil.' });
    } finally {
      setProfileLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Las contraseñas no coinciden.' });
      return;
    }

    setPasswordLoading(true);
    setPasswordMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      if (restaurant?.id) {
        await logActivity(
          'password_changed',
          'Usuario cambió su contraseña de acceso'
        );
      }

      setPasswordMessage({ type: 'success', text: 'Contraseña actualizada con éxito.' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordMessage({ type: 'error', text: err.message || 'Error al actualizar la contraseña.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  // Staff CRUD handlers
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddStaffLoading(true);
    setAddStaffError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No session token available');

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: staffEmail.trim(),
          password: staffPassword,
          fullName: staffFullName.trim(),
          role: staffRole,
          permissions: staffPermissions
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al crear usuario');

      setStaffEmail('');
      setStaffPassword('');
      setStaffFullName('');
      setStaffRole('vendedor_cajero');
      setStaffPermissions(getDefaultPermissions('vendedor_cajero'));
      setShowAddStaffModal(false);
      
      fetchStaff();
    } catch (err: any) {
      setAddStaffError(err.message || 'Error al agregar miembro del personal.');
    } finally {
      setAddStaffLoading(false);
    }
  };

  const handleEditStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaffMember) return;
    setEditStaffLoading(true);
    setEditStaffError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No session token available');

      const payload: any = {
        fullName: editStaffFullName.trim(),
        role: editStaffRole,
        permissions: editStaffPermissions
      };
      if (editStaffPassword) {
        payload.password = editStaffPassword;
      }

      const res = await fetch(`/api/admin/users/${editingStaffMember.profiles?.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al modificar usuario');

      setEditStaffPassword('');
      setShowEditStaffModal(false);
      setEditingStaffMember(null);
      fetchStaff();
    } catch (err: any) {
      setEditStaffError(err.message || 'Error al modificar miembro del personal.');
    } finally {
      setEditStaffLoading(false);
    }
  };

  const openEditModal = (member: any) => {
    setEditingStaffMember(member);
    setEditStaffFullName(`${member.profiles?.first_name || ''} ${member.profiles?.last_name || ''}`.trim());
    setEditStaffRole(member.role);
    setEditStaffPassword('');
    
    // Load custom permissions or fall back to defaults
    const currentPermissions = member.permissions || {};
    const defaultPerms = getDefaultPermissions(member.role);
    setEditStaffPermissions({
      orders: currentPermissions.orders || defaultPerms.orders,
      customers: currentPermissions.customers || defaultPerms.customers,
      menu: currentPermissions.menu || defaultPerms.menu,
      simulator: currentPermissions.simulator || defaultPerms.simulator,
      logs: currentPermissions.logs || defaultPerms.logs,
      reports: currentPermissions.reports || defaultPerms.reports,
      staff: currentPermissions.staff || defaultPerms.staff,
      settings: currentPermissions.settings || defaultPerms.settings
    });
    
    setEditStaffError(null);
    setShowEditStaffModal(true);
  };

  const handleRoleChange = (selectedRole: typeof staffRole) => {
    setStaffRole(selectedRole);
    setStaffPermissions(getDefaultPermissions(selectedRole));
  };

  const handleEditRoleChange = (selectedRole: typeof editStaffRole) => {
    setEditStaffRole(selectedRole);
    setEditStaffPermissions(getDefaultPermissions(selectedRole));
  };

  const handleDeleteStaff = async (memberId: string, fullName: string) => {
    const confirmDelete = window.confirm(`¿Estás seguro de que deseas eliminar a ${fullName}? Esta acción no se puede deshacer y revocará todo el acceso.`);
    if (!confirmDelete) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No session token available');

      const res = await fetch(`/api/admin/users/${memberId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar usuario');

      fetchStaff();
      toast.success('Usuario eliminado exitosamente.');
    } catch (err: any) {
      toast.error(err.message || 'Error al eliminar miembro del personal.');
    }
  };

  // Filter orders based on user role
  const filteredOrdersByRole = React.useMemo(() => {
    if (role === 'cocinero') {
      return orders.filter(order => ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status));
    }
    if (role === 'repartidor') {
      return orders.filter(order => order.type === 'delivery' && ['ready', 'delivering'].includes(order.status));
    }
    return orders;
  }, [orders, role]);

  // Monitor for new orders to trigger live notification banner
  useEffect(() => {
    if (ordersLoading || !orders.length) return;
    
    if (prevOrdersCount.current !== null && orders.length > prevOrdersCount.current) {
      // Find the latest inserted order
      const latestOrder = orders[0];
      toast.success(`¡Nuevo pedido recibido de ${latestOrder.customer_name} por $${Number(latestOrder.total_price).toFixed(2)}!`, {
        duration: 7000,
        icon: <Bell className="h-5 w-5 animate-pulse text-emerald-500" />
      });

      // Play subtle chime sound if possible
      try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-200.wav');
        audio.volume = 0.3;
        audio.play();
      } catch {
        // browser block audio autoplay
      }
    }
    
    prevOrdersCount.current = orders.length;
  }, [orders, ordersLoading]);

  // Seeding/Bootstrapping database
  const handleBootstrap = async () => {
    setBootstrapping(true);
    try {
      const res = await fetch('/api/bootstrap', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setRestaurant(data.restaurant);
        toast.success('Base de datos inicializada correctamente');
      } else {
        toast.error('Error: ' + data.error);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error('Error initializing: ' + errorMsg);
    } finally {
      setBootstrapping(false);
    }
  };

  // Fetch webhook logs
  const fetchWebhookLogs = React.useCallback(async () => {
    if (!restaurant?.id) return;
    setLogsLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_webhook_logs')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setWebhookLogs(data || []);
    } catch (err) {
      console.error('Error fetching webhook logs:', err);
    } finally {
      setLogsLoading(false);
    }
  }, [restaurant?.id]);

  useEffect(() => {
    if (activeTab === 'logs' && restaurant?.id) {
      fetchWebhookLogs();
    }
  }, [activeTab, restaurant?.id, fetchWebhookLogs]);

  // Calculations for stats metrics
  const stats = React.useMemo(() => {
    let totalRevenue = 0;
    let activeCount = 0;
    let readyCount = 0;
    let completedToday = 0;

    orders.forEach(order => {
      // Revenue from non-cancelled orders
      if (order.status !== 'cancelled') {
        totalRevenue += Number(order.total_price);
      }

      // Active statuses
      if (['pending', 'confirmed', 'preparing'].includes(order.status)) {
        activeCount++;
      }

      // Ready for dispatch
      if (order.status === 'ready') {
        readyCount++;
      }

      // Completed/Delivered today
      if (order.status === 'delivered') {
        completedToday++;
      }
    });

    return { totalRevenue, activeCount, readyCount, completedToday };
  }, [orders]);

  // Only show loading splash while auth or restaurant data is still being fetched.
  // IMPORTANT: only block if BOTH are still loading — if auth is done and user is null,
  // fall through so the redirect-to-login effect can fire.
  if (authLoading || restaurantLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#09090b] text-zinc-100">
        <Loader2 className="h-10 w-10 text-emerald-500 animate-spin mb-4" />
        <p className="text-zinc-400 text-sm">Cargando Administrador SaaS...</p>
      </div>
    );
  }

  // If loading is done and there is NO authenticated user, redirect to login.
  // This handles the case where the session expired or was never set in production.
  if (!user) {
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#09090b] text-zinc-100">
        <Loader2 className="h-10 w-10 text-emerald-500 animate-spin mb-4" />
        <p className="text-zinc-400 text-sm">Redirigiendo al inicio de sesión...</p>
      </div>
    );
  }

  // Seeding view if no restaurant exists (user IS authenticated but no restaurant found)
  if (!restaurant) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#09090b] text-zinc-100 p-6">
        <div className="max-w-md w-full bg-zinc-900/60 border border-zinc-800 p-8 rounded-3xl text-center space-y-6 backdrop-blur-md shadow-2xl">
          <div className="h-16 w-16 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto text-3xl">
            <Utensils className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold tracking-tight">Inicializar Aplicación</h2>
            <p className="text-sm text-zinc-400">
              Parece que la base de datos está vacía. Necesitamos crear la estructura inicial del restaurante y sus platos de muestra para comenzar a operar.
            </p>
          </div>
          <button
            onClick={handleBootstrap}
            disabled={bootstrapping}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-emerald-950/20 transition-all cursor-pointer"
          >
            {bootstrapping ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Inicializando Base de Datos...
              </>
            ) : (
              <>
                <Database className="h-5 w-5" />
                Crear Restaurante Demo
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 flex flex-col md:flex-row antialiased transition-colors duration-300">
      
      {/* Navigation Sidebar */}
      <aside className="w-full md:w-64 bg-zinc-950 border-r border-zinc-900 flex flex-col shrink-0">
        {/* Restaurant Header */}
        <div className="p-6 border-b border-zinc-900 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-black">
            <Utensils className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-zinc-100 line-clamp-1">{restaurant.name}</h1>
            <p className="text-[10px] text-emerald-450 font-medium flex items-center gap-1 uppercase tracking-wider mt-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-550 animate-ping"></span>
              SaaS Live Panel
            </p>
          </div>
        </div>

        {/* Links Navigation */}
        <nav className="flex-1 p-4 space-y-1.5">
          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('saas')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'saas'
                  ? 'bg-zinc-900 text-violet-400 border border-zinc-800'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
              }`}
            >
              <ShieldCheck className="h-4.5 w-4.5" />
              <span>Administración SaaS</span>
            </button>
          )}
          {activePermissions.orders !== 'none' && (
            <button
              onClick={() => setActiveTab('orders')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'orders'
                  ? 'bg-zinc-900 text-emerald-400 border border-zinc-800'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
              }`}
            >
              <ClipboardList className="h-4.5 w-4.5" />
              <span>
                {role === 'cocinero' ? 'Cola de Cocina' : role === 'repartidor' ? 'Cola de Repartos' : 'Gestión Pedidos'}
              </span>
              {stats.activeCount > 0 && role !== 'repartidor' && (
                <span className="ml-auto bg-emerald-600 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-md">
                  {stats.activeCount}
                </span>
              )}
            </button>
          )}

          {activePermissions.menu !== 'none' && (
            <button
              onClick={() => setActiveTab('menu')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'menu'
                  ? 'bg-zinc-900 text-emerald-400 border border-zinc-800'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
              }`}
            >
              <BookOpen className="h-4.5 w-4.5" />
              <span>Carta / Menú</span>
            </button>
          )}

          {activePermissions.customers !== 'none' && (
            <button
              onClick={() => setActiveTab('customers')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'customers'
                  ? 'bg-zinc-900 text-emerald-400 border border-zinc-800'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
              }`}
            >
              <Users className="h-4.5 w-4.5" />
              <span>Fidelización Clientes</span>
            </button>
          )}

          {activePermissions.staff !== 'none' && (
            <>
              <button
                onClick={() => setActiveTab('staff')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  activeTab === 'staff'
                    ? 'bg-zinc-900 text-emerald-400 border border-zinc-800'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
                }`}
              >
                <UserCheck className="h-4.5 w-4.5" />
                <span>Gestión Personal</span>
              </button>

              <button
                onClick={() => setActiveTab('audit')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  activeTab === 'audit'
                    ? 'bg-zinc-900 text-emerald-400 border border-zinc-800'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
                }`}
              >
                <History className="h-4.5 w-4.5" />
                <span>Seguimiento</span>
              </button>
            </>
          )}

          {activePermissions.reports !== 'none' && (
            <button
              onClick={() => setActiveTab('reports')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'reports'
                  ? 'bg-zinc-900 text-emerald-400 border border-zinc-800'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
              }`}
            >
              <BarChart3 className="h-4.5 w-4.5" />
              <span>Reportes & Analítica</span>
            </button>
          )}

          {activePermissions.settings !== 'none' && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeTab === 'settings'
                  ? 'bg-zinc-900 text-emerald-400 border border-zinc-800'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
              }`}
            >
              <Settings2 className="h-4.5 w-4.5" />
              <span>Configuración / Perfil</span>
            </button>
          )}

          <div className="pt-4 mt-4 border-t border-zinc-800/50">
            <Link
              href="/privacidad"
              target="_blank"
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-emerald-400 hover:bg-emerald-950/20 transition-all"
            >
              <ShieldCheck className="h-4.5 w-4.5" />
              <span>Privacidad LOPDP</span>
            </Link>
          </div>
        </nav>

        {/* User profile card & Logout */}
        {user && (
          <div className="p-4 border-t border-zinc-900 bg-zinc-950/40 space-y-3">
            <div className="flex items-center gap-2.5 px-1">
              <div className="h-8 w-8 rounded-full bg-zinc-900 border border-zinc-850 flex items-center justify-center text-emerald-400 text-xs font-bold font-mono shrink-0">
                {profile?.first_name?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-zinc-250 truncate">
                  {profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : 'Miembro Personal'}
                </p>
                <p className="text-[9px] text-zinc-550 uppercase tracking-widest truncate font-semibold">
                  {role === 'admin_general' && 'Administrador General'}
                  {role === 'vendedor_cajero' && 'Vendedor / Cajero'}
                  {role === 'cocinero' && 'Cocinero'}
                  {role === 'repartidor' && 'Repartidor'}
                </p>
              </div>
            </div>
            <button
              onClick={() => logout()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-350 bg-rose-950/5 hover:bg-rose-950/15 border border-rose-950/20 hover:border-rose-900/30 transition-all cursor-pointer"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        )}

        {/* Footer Brand Info */}
        <div className="p-4 border-t border-zinc-900 text-[10px] text-zinc-600 text-center">
          <p>© 2026 Restaurante SaaS</p>
          <p className="mt-0.5 text-zinc-700">WhatsApp & Gemini Powered</p>
        </div>
      </aside>

      {/* Main Dashboard Space */}
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Top Header Navbar */}
        <header className="h-16 border-b border-zinc-200 dark:border-zinc-900 px-6 flex items-center justify-between shrink-0">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-150 uppercase tracking-widest">
            {activeTab === 'saas' && 'Administración Global de la Plataforma'}
            {activeTab === 'orders' && 'Panel de Pedidos WhatsApp'}
            {activeTab === 'customers' && 'Base de Clientes'}
            {activeTab === 'reports' && 'Reportes & Analítica de Ventas'}
            {activeTab === 'logs' && 'Logs de Integración WhatsApp & AI'}
            {activeTab === 'settings' && 'Configuración & Perfil'}
            {activeTab === 'staff' && 'Administración de Personal'}
            {activeTab === 'audit' && 'Seguimiento de Actividades'}
            {activeTab === 'menu' && 'Carta / Menú del Restaurante'}
            {activeTab === 'simulator' && 'Simulador de Chat de WhatsApp'}
          </h2>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button 
              onClick={() => {
                refreshOrders();
                if (activeTab === 'logs') fetchWebhookLogs();
              }}
              className="p-2 rounded-xl bg-zinc-200 dark:bg-zinc-900 hover:bg-zinc-300 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-850 transition-colors text-zinc-600 dark:text-zinc-400 cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <span className="text-[11px] text-zinc-600 dark:text-zinc-400 bg-zinc-200 dark:bg-zinc-900/80 px-2.5 py-1 rounded-lg border border-zinc-300 dark:border-zinc-850">
              ID Local: {restaurant.id.substring(0, 8)}...
            </span>
          </div>
        </header>

        {/* Main Content Animated Wrapper */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-y-auto flex flex-col"
          >

        {/* Statistical Summary Cards */}
        {activeTab === 'orders' && (role === 'admin_general' || role === 'vendedor_cajero') && (
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-6 pt-6">
            {/* Revenue card */}
            <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-900 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Ingresos Acumulados</span>
                <div className="p-1.5 rounded-lg bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border border-emerald-550/15">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-100 mt-2">${stats.totalRevenue.toFixed(2)}</h3>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">Excluye pedidos cancelados</p>
            </div>

            {/* Active Orders */}
            <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-900 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Pedidos en Cocina</span>
                <div className="p-1.5 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-550/15">
                  <ShoppingBag className="h-4 w-4" />
                </div>
              </div>
              <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-100 mt-2">{stats.activeCount}</h3>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">Pendientes/Preparando</p>
            </div>

            {/* Ready for Dispatch */}
            <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-900 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Listos para Entrega</span>
                <div className="p-1.5 rounded-lg bg-amber-600/10 text-amber-600 dark:text-amber-400 border border-amber-550/15">
                  <Truck className="h-4 w-4" />
                </div>
              </div>
              <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-100 mt-2">{stats.readyCount}</h3>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">Espera despacho/cliente</p>
            </div>

            {/* Completed today */}
            <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-900 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Entregados</span>
                <div className="p-1.5 rounded-lg bg-purple-600/10 text-purple-600 dark:text-purple-400 border border-purple-550/15">
                  <CheckCircle className="h-4 w-4" />
                </div>
              </div>
              <h3 className="text-xl font-black text-zinc-900 dark:text-zinc-100 mt-2">{stats.completedToday}</h3>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">Pedidos despachados</p>
            </div>
          </section>
        )}

        {/* Main Section Content Area */}
        <section className="flex-1 p-6 overflow-y-auto">
          {activeTab === 'orders' && role === 'cocinero' ? (
            <KitchenDisplay 
              orders={filteredOrdersByRole} 
              onUpdateStatus={handleUpdateOrderStatus} 
            />
          ) : activeTab === 'orders' && role === 'repartidor' ? (
            <DeliveryDisplay
              orders={filteredOrdersByRole}
              onUpdateStatus={handleUpdateOrderStatus}
            />
          ) : activeTab === 'orders' ? (
            <OrderTable 
              orders={filteredOrdersByRole} 
              onUpdateStatus={handleUpdateOrderStatus} 
              onUpdatePayment={handleUpdatePaymentStatus}
              loading={ordersLoading} 
              role={role}
              readOnly={activePermissions.orders === 'read'}
            />
          ) : null}

          {activeTab === 'customers' && (
            <CustomersPanel 
              orders={orders} 
              loading={ordersLoading} 
            />
          )}

          {activeTab === 'reports' && (
            <ReportsPanel 
              orders={orders} 
              loading={ordersLoading} 
              restaurantId={restaurant.id}
            />
          )}

          {activeTab === 'menu' && (
            <MenuPanel 
              restaurantId={restaurant.id} 
              readOnly={activePermissions.menu === 'read'}
            />
          )}

          {activeTab === 'simulator' && (
            <SimulatorPanel 
              restaurantId={restaurant.id} 
            />
          )}

          {activeTab === 'saas' && (
            <SaaSAdminPanel />
          )}

          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-900/60 mb-6 gap-3">
                <div>
                  <h4 className="text-base font-bold text-zinc-800 dark:text-zinc-200">Historial de Webhooks Recibidos</h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Muestra las últimas transacciones de Meta y las interpretaciones de Gemini AI.</p>
                </div>
                <button
                  onClick={fetchWebhookLogs}
                  disabled={logsLoading}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-semibold border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 transition-all cursor-pointer shadow-sm"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${logsLoading ? 'animate-spin' : ''}`} /> Refrescar
                </button>
              </div>

              {logsLoading ? (
                <div className="text-center py-20 text-zinc-500 text-xs">Cargando webhook logs...</div>
              ) : webhookLogs.length === 0 ? (
                <div className="text-center py-20 bg-zinc-100 dark:bg-zinc-950/20 border border-zinc-200 dark:border-zinc-850 rounded-2xl px-4 text-xs text-zinc-550">
                  No se han registrado mensajes de webhook de WhatsApp. Envía un mensaje de prueba al webhook para registrar logs.
                </div>
              ) : (
                <div className="space-y-3">
                  {webhookLogs.map((log) => (
                    <div key={log.id} className="bg-white dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-900/80 rounded-2xl p-5 space-y-4 shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{log.sender_phone}</span>
                          <span className="text-zinc-300 dark:text-zinc-700 text-xs">•</span>
                          <span className="text-xs text-zinc-550 dark:text-zinc-400">{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                          log.status === 'order_created' 
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40' 
                            : log.status === 'failed'
                            ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450 border-rose-200 dark:border-rose-900/40'
                            : 'bg-zinc-100 dark:bg-zinc-850 text-zinc-650 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                        }`}>
                          {log.status}
                        </span>
                      </div>

                      {/* Raw text */}
                      <div>
                        <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-1">Mensaje de WhatsApp:</p>
                        <p className="text-xs text-zinc-700 dark:text-zinc-300 italic bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-850/60 p-3 rounded-xl">
                          &quot;{log.message_body}&quot;
                        </p>
                      </div>

                      {/* AI parsed block / error details */}
                      {!!log.ai_parsed_response && (
                        <div>
                          <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-1">Extracción Inteligente (Gemini):</p>
                          <pre className="text-[11px] text-emerald-600 dark:text-emerald-350 bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-850 p-3 rounded-xl overflow-x-auto font-mono">
                            {JSON.stringify(log.ai_parsed_response, null, 2)}
                          </pre>
                        </div>
                      )}

                      {log.error_message && (
                        <div className="flex items-start gap-2 bg-rose-50 dark:bg-rose-950/10 border border-rose-200 dark:border-rose-950/45 p-3 rounded-xl text-rose-650 dark:text-rose-450">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <div className="text-xs">
                            <span className="font-semibold">Error del sistema:</span> {log.error_message}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'staff' && role === 'admin_general' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-zinc-200 dark:border-zinc-900/60 mb-6 gap-4">
                <div>
                  <h4 className="text-base font-bold text-zinc-800 dark:text-zinc-200">Administración de Personal</h4>
                  <p className="text-xs text-zinc-550 dark:text-zinc-400 mt-0.5">Agrega, modifica perfiles, restablece contraseñas o elimina miembros de tu equipo.</p>
                </div>
                <button
                  onClick={() => {
                    setAddStaffError(null);
                    setShowAddStaffModal(true);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-900/10 hover:shadow-lg transition-all cursor-pointer"
                >
                  <UserPlus className="h-4 w-4" /> Agregar Personal
                </button>
              </div>

              {staffLoading ? (
                <div className="text-center py-20 text-zinc-500 text-xs flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-500" /> Cargando lista de personal...
                </div>
              ) : staffError ? (
                <div className="bg-rose-50 dark:bg-rose-950/10 border border-rose-200 dark:border-rose-950/45 p-4 rounded-xl text-rose-600 dark:text-rose-450 text-xs">
                  {staffError}
                </div>
              ) : staffList.length === 0 ? (
                <div className="text-center py-20 bg-zinc-100 dark:bg-zinc-950/20 border border-zinc-850 rounded-2xl text-xs text-zinc-500">
                  No se encontraron miembros del personal registrados.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {staffList.map((member) => (
                    <div 
                      key={member.id} 
                      className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-850 p-5 rounded-2xl space-y-4 shadow-sm hover:shadow-md transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">
                            {member.profiles?.first_name?.[0]?.toUpperCase() || 'P'}
                          </div>
                          <div>
                            <h5 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                              {`${member.profiles?.first_name || ''} ${member.profiles?.last_name || ''}`.trim() || 'Miembro Sin Nombre'}
                            </h5>
                            <p className="text-[10px] text-zinc-550 dark:text-zinc-400 truncate max-w-[150px]">{member.email}</p>
                          </div>
                        </div>
                        
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                          member.role === 'admin_general' 
                            ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-455 border-rose-200 dark:border-rose-900/40' 
                            : member.role === 'vendedor_cajero'
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/40'
                            : member.role === 'cocinero'
                            ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/40'
                            : 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-650 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/40'
                        }`}>
                          {member.role === 'admin_general' && 'Admin General'}
                          {member.role === 'vendedor_cajero' && 'Vendedor / Cajero'}
                          {member.role === 'cocinero' && 'Cocinero'}
                          {member.role === 'repartidor' && 'Repartidor'}
                        </span>
                      </div>

                      <div className="border-t border-zinc-100 dark:border-zinc-900 pt-3 flex justify-between items-center text-[10px] text-zinc-500">
                        <div>
                          <span>Último acceso: </span>
                          <span className="text-zinc-650 dark:text-zinc-400 font-medium">
                            {member.last_sign_in ? new Date(member.last_sign_in).toLocaleDateString() : 'Nunca'}
                          </span>
                        </div>
                        
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditModal(member)}
                            className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-850 dark:hover:text-zinc-250 border border-zinc-200 dark:border-zinc-850 transition-colors cursor-pointer"
                            title="Editar usuario o clave"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          
                          {member.profiles?.id !== user?.id && (
                            <button
                              onClick={() => handleDeleteStaff(member.profiles?.id, `${member.profiles?.first_name || ''} ${member.profiles?.last_name || ''}`.trim())}
                              className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/5 hover:bg-rose-100 dark:hover:bg-rose-950/15 text-rose-600 dark:text-rose-455 hover:text-rose-700 dark:hover:text-rose-400 border border-rose-200 dark:border-rose-955/10 hover:border-rose-900/20 transition-colors cursor-pointer"
                              title="Eliminar usuario"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Staff Modal */}
              {showAddStaffModal && (
                <div className="fixed inset-0 z-50 bg-[#000000]/80 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-zinc-950 border border-zinc-900 max-w-md w-full rounded-3xl p-6.5 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-zinc-150">Agregar Nuevo Personal</h4>
                        <p className="text-xs text-zinc-500">Crea una cuenta para un miembro del personal.</p>
                      </div>
                      <button 
                        onClick={() => setShowAddStaffModal(false)}
                        className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-zinc-250 border border-zinc-850 cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {addStaffError && (
                      <div className="bg-rose-950/10 border border-rose-950/45 p-3 rounded-lg text-rose-400 text-xs flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{addStaffError}</span>
                      </div>
                    )}

                    <form onSubmit={handleAddStaff} className="space-y-4.5">
                      <div className="space-y-1 text-xs">
                        <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Nombre Completo</label>
                        <input
                          type="text"
                          required
                          value={staffFullName}
                          onChange={(e) => setStaffFullName(e.target.value)}
                          placeholder="Ej. María Clara Gómez"
                          className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all"
                        />
                      </div>

                      <div className="space-y-1 text-xs">
                        <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Correo Electrónico</label>
                        <input
                          type="email"
                          required
                          value={staffEmail}
                          onChange={(e) => setStaffEmail(e.target.value)}
                          placeholder="ejemplo@restaurante.com"
                          className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all"
                        />
                      </div>

                      <div className="space-y-1 text-xs">
                        <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Contraseña Inicial</label>
                        <input
                          type="password"
                          required
                          value={staffPassword}
                          onChange={(e) => setStaffPassword(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all"
                        />
                      </div>

                      <div className="space-y-1 text-xs">
                        <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Rol del Usuario</label>
                        <select
                          value={staffRole}
                          onChange={(e) => handleRoleChange(e.target.value as any)}
                          className="w-full bg-zinc-900 border border-zinc-850 focus:border-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all"
                        >
                          <option value="vendedor_cajero">Vendedor / Cajero</option>
                          <option value="cocinero">Cocinero</option>
                          <option value="repartidor">Repartidor</option>
                        </select>
                      </div>

                      <div className="space-y-3.5 border-t border-zinc-900/65 pt-4">
                        <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] block mb-2">Permisos del Sistema</label>
                        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                          {modulesConfig.map(({ key, label, desc }) => {
                            const val = staffPermissions[key];
                            return (
                              <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-xl bg-zinc-900/30 border border-zinc-900 gap-2">
                                <div className="min-w-0">
                                  <span className="text-xs font-bold text-zinc-205 block">{label}</span>
                                  <span className="text-[10px] text-zinc-500 block truncate">{desc}</span>
                                </div>
                                <div className="flex gap-0.5 bg-zinc-950 p-0.5 rounded-lg border border-zinc-850 shrink-0 self-start sm:self-center">
                                  {(['write', 'read', 'none'] as const).map((level) => (
                                    <button
                                      key={level}
                                      type="button"
                                      onClick={() => setStaffPermissions(prev => ({ ...prev, [key]: level }))}
                                      className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all cursor-pointer ${
                                        val === level
                                          ? level === 'write'
                                            ? 'bg-emerald-500/10 text-emerald-455 border border-emerald-500/20'
                                            : level === 'read'
                                            ? 'bg-amber-500/10 text-amber-455 border border-amber-500/20'
                                            : 'bg-rose-500/10 text-rose-455 border border-rose-500/20'
                                          : 'text-zinc-550 hover:text-zinc-300 hover:bg-zinc-900/40 border border-transparent'
                                      }`}
                                    >
                                      {level === 'write' ? 'Modi' : level === 'read' ? 'Ver' : 'N/A'}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={addStaffLoading}
                        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-650 text-white font-semibold py-3 px-4 rounded-xl shadow-lg transition-all cursor-pointer mt-2"
                      >
                        {addStaffLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Creando...
                          </>
                        ) : 'Crear Cuenta'}
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* Edit Staff Modal */}
              {showEditStaffModal && editingStaffMember && (
                <div className="fixed inset-0 z-50 bg-[#000000]/80 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-zinc-950 border border-zinc-900 max-w-md w-full rounded-3xl p-6.5 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-zinc-150">Modificar Miembro</h4>
                        <p className="text-xs text-zinc-500">Actualiza la información de {editingStaffMember.email}.</p>
                      </div>
                      <button 
                        onClick={() => {
                          setShowEditStaffModal(false);
                          setEditingStaffMember(null);
                        }}
                        className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-zinc-250 border border-zinc-850 cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {editStaffError && (
                      <div className="bg-rose-950/10 border border-rose-950/45 p-3 rounded-lg text-rose-450 text-xs flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{editStaffError}</span>
                      </div>
                    )}

                    <form onSubmit={handleEditStaff} className="space-y-4.5">
                      <div className="space-y-1 text-xs">
                        <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Nombre Completo</label>
                        <input
                          type="text"
                          required
                          value={editStaffFullName}
                          onChange={(e) => setEditStaffFullName(e.target.value)}
                          className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all"
                        />
                      </div>

                      <div className="space-y-1 text-xs">
                        <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Rol del Usuario</label>
                        <select
                          value={editStaffRole}
                          onChange={(e) => handleEditRoleChange(e.target.value as any)}
                          className="w-full bg-zinc-900 border border-zinc-850 focus:border-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all"
                        >
                          <option value="admin_general">Administrador General</option>
                          <option value="vendedor_cajero">Vendedor / Cajero</option>
                          <option value="cocinero">Cocinero</option>
                          <option value="repartidor">Repartidor</option>
                        </select>
                      </div>

                      <div className="space-y-3.5 border-t border-zinc-900/65 pt-4">
                        <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] block mb-2">Permisos del Sistema</label>
                        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                          {modulesConfig.map(({ key, label, desc }) => {
                            const val = editStaffPermissions[key];
                            return (
                              <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-xl bg-zinc-900/30 border border-zinc-900 gap-2">
                                <div className="min-w-0">
                                  <span className="text-xs font-bold text-zinc-205 block">{label}</span>
                                  <span className="text-[10px] text-zinc-500 block truncate">{desc}</span>
                                </div>
                                <div className="flex gap-0.5 bg-zinc-950 p-0.5 rounded-lg border border-zinc-850 shrink-0 self-start sm:self-center">
                                  {(['write', 'read', 'none'] as const).map((level) => (
                                    <button
                                      key={level}
                                      type="button"
                                      onClick={() => setEditStaffPermissions(prev => ({ ...prev, [key]: level }))}
                                      className={`px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all cursor-pointer ${
                                        val === level
                                          ? level === 'write'
                                            ? 'bg-emerald-500/10 text-emerald-455 border border-emerald-500/20'
                                            : level === 'read'
                                            ? 'bg-amber-500/10 text-amber-455 border border-amber-500/20'
                                            : 'bg-rose-500/10 text-rose-455 border border-rose-500/20'
                                          : 'text-zinc-550 hover:text-zinc-300 hover:bg-zinc-900/40 border border-transparent'
                                      }`}
                                    >
                                      {level === 'write' ? 'Modi' : level === 'read' ? 'Ver' : 'N/A'}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="border-t border-zinc-900/65 pt-4 space-y-3">
                        <div className="space-y-1">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                            <Key className="h-3 w-3 text-amber-500" /> Restablecer Contraseña (Opcional)
                          </label>
                          <input
                            type="password"
                            value={editStaffPassword}
                            onChange={(e) => setEditStaffPassword(e.target.value)}
                            placeholder="Dejar en blanco para no cambiar"
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all"
                          />
                        </div>
                        <p className="text-[10px] text-zinc-500">Si ingresas una contraseña aquí, se forzará la actualización de la contraseña del usuario en el sistema.</p>
                      </div>

                      <button
                        type="submit"
                        disabled={editStaffLoading}
                        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-650 text-white font-semibold py-3 px-4 rounded-xl shadow-lg transition-all cursor-pointer mt-2"
                      >
                        {editStaffLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Guardando...
                          </>
                        ) : 'Guardar Cambios'}
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'audit' && role === 'admin_general' && (
            <div className="space-y-6">
              <div className="bg-zinc-950/40 border border-zinc-800/80 p-4.5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-zinc-200">Seguimiento de Actividades</h4>
                  <p className="text-xs text-zinc-500">Log de auditoría de las acciones realizadas por el personal.</p>
                </div>
                
                <div className="flex items-center gap-2.5">
                  <select
                    value={auditFilterAction}
                    onChange={(e) => setAuditFilterAction(e.target.value)}
                    className="bg-zinc-900 border border-zinc-850 text-zinc-200 text-xs px-3 py-2 rounded-xl outline-none"
                  >
                    <option value="all">Todas las Acciones</option>
                    <option value="order_status_update">Cambios de Pedido</option>
                    <option value="payment_confirmed">Pagos Confirmados</option>
                    <option value="payment_revoked">Pagos Revocados</option>
                    <option value="staff_created">Creación de Usuarios</option>
                    <option value="staff_updated">Actualización de Usuarios</option>
                    <option value="staff_deleted">Eliminación de Usuarios</option>
                    <option value="profile_updated">Cambios de Perfil</option>
                  </select>
                  
                  <button
                    onClick={fetchAuditLogs}
                    disabled={auditLoading}
                    className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-250 border border-zinc-850 cursor-pointer"
                  >
                    <RefreshCw className={`h-4 w-4 ${auditLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {auditLoading ? (
                <div className="text-center py-20 text-zinc-500 text-xs flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-500" /> Cargando logs de auditoría...
                </div>
              ) : auditError ? (
                <div className="bg-rose-950/10 border border-rose-950/45 p-4 rounded-xl text-rose-400 text-xs">
                  {auditError}
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-20 bg-zinc-950/20 border border-zinc-850 rounded-2xl text-xs text-zinc-550">
                  No se registraron logs de actividades para el filtro seleccionado.
                </div>
              ) : (
                <div className="bg-zinc-950/40 border border-zinc-900 rounded-2xl overflow-hidden animate-in fade-in duration-200">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-900 bg-zinc-950/80 text-zinc-400 font-bold uppercase tracking-wider text-[9px]">
                          <th className="p-4">Usuario</th>
                          <th className="p-4">Acción</th>
                          <th className="p-4">Detalles</th>
                          <th className="p-4 text-right">Fecha & Hora</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900/70 text-zinc-300">
                        {auditLogs
                          .filter(log => auditFilterAction === 'all' || log.action === auditFilterAction)
                          .map((log) => {
                            const userFullName = log.profiles 
                              ? `${log.profiles.first_name || ''} ${log.profiles.last_name || ''}`.trim()
                              : 'Sistema / N/D';
                            
                            const getActionBadge = (action: string) => {
                              const styles: Record<string, string> = {
                                order_status_update: 'bg-blue-950/20 text-blue-400 border border-blue-900/40',
                                payment_confirmed: 'bg-emerald-950/20 text-emerald-400 border border-emerald-900/40',
                                payment_revoked: 'bg-rose-950/20 text-rose-450 border border-rose-900/40',
                                staff_created: 'bg-purple-950/20 text-purple-400 border border-purple-900/40',
                                staff_updated: 'bg-amber-950/20 text-amber-400 border border-amber-900/40',
                                staff_deleted: 'bg-orange-950/20 text-orange-400 border border-orange-900/40',
                                profile_updated: 'bg-pink-955/20 text-pink-400 border border-pink-900/40',
                                password_changed: 'bg-cyan-955/20 text-cyan-400 border border-cyan-900/40',
                              };
                              const labels: Record<string, string> = {
                                order_status_update: 'Cambio Pedido',
                                payment_confirmed: 'Pago Confirmado',
                                payment_revoked: 'Pago Revocado',
                                staff_created: 'Usuario Creado',
                                staff_updated: 'Usuario Editado',
                                staff_deleted: 'Usuario Borrado',
                                profile_updated: 'Perfil Editado',
                                password_changed: 'Clave Modificada',
                              };
                              return (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${styles[action] || 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>
                                  {labels[action] || action}
                                </span>
                              );
                            };

                            return (
                              <tr key={log.id} className="hover:bg-zinc-900/30 transition-colors">
                                <td className="p-4 font-semibold text-zinc-200">{userFullName}</td>
                                <td className="p-4">{getActionBadge(log.action)}</td>
                                <td className="p-4 text-zinc-400 font-medium max-w-xs sm:max-w-md md:max-w-lg truncate" title={log.details}>
                                  {log.details || 'Sin detalles'}
                                </td>
                                <td className="p-4 text-right text-zinc-500 font-mono">
                                  {new Date(log.created_at).toLocaleString('es-ES', {
                                    day: '2-digit', month: '2-digit', year: 'numeric',
                                    hour: '2-digit', minute: '2-digit', second: '2-digit'
                                  })}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start animate-in fade-in-50 duration-200">
              
              {/* Profile Config section for all users */}
              <div className="bg-zinc-950/40 border border-zinc-900 p-6 rounded-2xl space-y-6">
                <div className="border-b border-zinc-900 pb-4">
                  <h4 className="text-sm font-semibold text-zinc-200 font-bold">Mi Perfil Personal</h4>
                  <p className="text-xs text-zinc-500">Actualiza tus nombres y apellidos del perfil.</p>
                </div>

                {profileMessage && (
                  <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                    profileMessage.type === 'success' ? 'bg-emerald-950/15 border border-emerald-900/30 text-emerald-400' : 'bg-rose-950/15 border border-rose-900/30 text-rose-400'
                  }`}>
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{profileMessage.text}</span>
                  </div>
                )}

                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div className="space-y-1 text-xs">
                    <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Correo Electrónico (Solo Lectura)</label>
                    <input 
                      type="text" 
                      readOnly 
                      value={user?.email || ''} 
                      className="w-full bg-zinc-900/30 border border-zinc-850 p-2.5 rounded-xl text-zinc-550 outline-none select-all font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1 text-xs">
                      <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Nombre</label>
                      <input 
                        type="text" 
                        required
                        disabled={activePermissions.settings === 'read'}
                        value={profileFirstName}
                        onChange={(e) => setProfileFirstName(e.target.value)}
                        className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div className="space-y-1 text-xs">
                      <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Apellido</label>
                      <input 
                        type="text" 
                        required
                        disabled={activePermissions.settings === 'read'}
                        value={profileLastName}
                        onChange={(e) => setProfileLastName(e.target.value)}
                        className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={profileLoading || activePermissions.settings === 'read'}
                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-850 disabled:text-zinc-555 text-white font-semibold py-2.5 px-4 rounded-xl shadow-lg transition-all cursor-pointer text-xs"
                  >
                    {profileLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar Información'}
                  </button>
                </form>

                {/* Password Change Form */}
                <div className="border-t border-zinc-900 pt-6 space-y-6">
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-200 font-bold">Cambiar Contraseña</h4>
                    <p className="text-xs text-zinc-500">Restablece tu contraseña de seguridad para entrar al panel.</p>
                  </div>

                  {passwordMessage && (
                    <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                      passwordMessage.type === 'success' ? 'bg-emerald-950/15 border border-emerald-900/30 text-emerald-400' : 'bg-rose-950/15 border border-rose-900/30 text-rose-455'
                    }`}>
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{passwordMessage.text}</span>
                    </div>
                  )}

                  <form onSubmit={handleUpdatePassword} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1 text-xs">
                        <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Nueva Contraseña</label>
                        <div className="relative">
                          <input 
                            type={showPassword ? "text" : "password"} 
                            required
                            disabled={activePermissions.settings === 'read'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Mínimo 6 caracteres"
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 pr-10 rounded-xl text-zinc-200 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <button
                            type="button"
                            disabled={activePermissions.settings === 'read'}
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-3.5 text-zinc-500 hover:text-zinc-250 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1 text-xs">
                        <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Confirmar Nueva Contraseña</label>
                        <input 
                          type={showPassword ? "text" : "password"} 
                          required
                          disabled={activePermissions.settings === 'read'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Repite la contraseña"
                          className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={passwordLoading || activePermissions.settings === 'read'}
                      className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-850 disabled:text-zinc-555 text-white font-semibold py-2.5 px-4 rounded-xl shadow-lg transition-all cursor-pointer text-xs"
                    >
                      {passwordLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Modificar Contraseña'}
                    </button>
                  </form>
                </div>
              </div>

              {/* API and Integration settings for Admin General only */}
              {role === 'admin_general' ? (
                <div className="bg-zinc-950/40 border border-zinc-900 p-6 rounded-2xl space-y-6 animate-in fade-in-50 duration-200">
                  <div className="border-b border-zinc-900 pb-4">
                    <h4 className="text-sm font-semibold text-zinc-200">Ajustes de API & Integraciones</h4>
                    <p className="text-xs text-zinc-500">Configura tus llaves de API para Meta WhatsApp Business y Google Gemini AI.</p>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Verify Token (WhatsApp Webhook)</label>
                        <input 
                          type="text" 
                          readOnly 
                          value="mi_token_de_verificacion_prueba_123" 
                          className="w-full bg-zinc-900/30 border border-zinc-850 p-2.5 rounded-xl text-zinc-500 select-all outline-none font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Phone Number ID (WhatsApp API)</label>
                        <input 
                          type="text" 
                          readOnly 
                          value="123456789012345" 
                          className="w-full bg-zinc-900/30 border border-zinc-850 p-2.5 rounded-xl text-zinc-550 select-all outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Gemini Model Utilizado</label>
                      <input 
                        type="text" 
                        readOnly 
                        value="gemini-1.5-flash" 
                        className="w-full bg-zinc-900/30 border border-zinc-850 p-2.5 rounded-xl text-zinc-550 outline-none font-mono"
                      />
                    </div>

                    <div className="bg-amber-500/5 border border-amber-500/10 p-4 rounded-xl flex items-start gap-3 text-amber-550 leading-relaxed">
                      <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                      <div>
                        <h5 className="font-bold text-xs uppercase tracking-wider text-amber-500">Entorno de Producción</h5>
                        <p className="text-[11px] mt-1 text-zinc-400">
                          Los valores de API Key, tokens y llaves privadas se configuran localmente en el archivo <code className="text-amber-400 bg-zinc-900 px-1 py-0.5 rounded">.env.local</code>. El panel administrativo lee de estas variables de manera segura en el backend para evitar filtraciones en el cliente.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-950/20 border border-zinc-900/60 p-6 rounded-2xl flex flex-col items-center justify-center text-center space-y-3 h-full">
                  <AlertCircle className="h-8 w-8 text-zinc-600" />
                  <h5 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Restricciones de Rol</h5>
                  <p className="text-[11px] text-zinc-500 max-w-xs">
                    Los ajustes avanzados del sistema e integraciones con WhatsApp API y Gemini AI solo están disponibles para el Administrador General.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
