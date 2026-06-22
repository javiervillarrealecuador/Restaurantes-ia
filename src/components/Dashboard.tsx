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
import TakeOrderPanel from './TakeOrderPanel';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeToggle } from '@/components/ThemeToggle';
import { 
  Utensils, 
  ClipboardList, 
  Users, 
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
  ShieldCheck,
  Smartphone,
  Plus,
  MapPin,
  Phone,
  LayoutDashboard
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
  const { user, profile, role, isSuperAdmin, permissions, logout, loading: authLoading, restaurantAccess, activeRestaurantId, setActiveRestaurantId, branchId } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'orders' | 'customers' | 'logs' | 'settings' | 'reports' | 'staff' | 'audit' | 'menu' | 'simulator' | 'saas' | 'take_order'>('orders');
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [restaurantLoading, setRestaurantLoading] = useState<boolean>(true);
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

  // Restaurant settings states
  const [aiSystemInstruction, setAiSystemInstruction] = useState<string>('');
  const [aiSystemInstructionLoading, setAiSystemInstructionLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // SRI Settings States
  const [sriRuc, setSriRuc] = useState('');
  const [sriDirMatriz, setSriDirMatriz] = useState('');
  const [sriDirEstab, setSriDirEstab] = useState('');
  const [sriEstab, setSriEstab] = useState('001');
  const [sriPtoEmi, setSriPtoEmi] = useState('001');
  const [sriObligadoContab, setSriObligadoContab] = useState(true);
  const [sriRimpe, setSriRimpe] = useState('');
  const [sriAgenteRetencion, setSriAgenteRetencion] = useState('');
  const [sriContribEspecial, setSriContribEspecial] = useState('');
  const [sriAmbiente, setSriAmbiente] = useState<number>(1);
  const [sriP12B64, setSriP12B64] = useState('');
  const [sriP12Pwd, setSriP12Pwd] = useState('');
  const [sriEmailEnvio, setSriEmailEnvio] = useState('');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [sriIvaRate, setSriIvaRate] = useState<number>(15.00);
  const [sriIvaTemporal, setSriIvaTemporal] = useState<string>('');
  const [sriIvaTemporalInicio, setSriIvaTemporalInicio] = useState('');
  const [sriIvaTemporalFin, setSriIvaTemporalFin] = useState('');
  const [sriFirmaExpira, setSriFirmaExpira] = useState('');
  const [sriFirmaRazon, setSriFirmaRazon] = useState('');
  
  const [sriSecuencialInicio, setSriSecuencialInicio] = useState<number>(1);
  const [sriLoading, setSriLoading] = useState(false);
  const [sriMessage, setSriMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sriFirmas, setSriFirmas] = useState<any[]>([]);
  const [newP12Uploaded, setNewP12Uploaded] = useState(false);

  // sri_firmas table removed — signatures are stored in restaurants.sri_p12_b64
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const fetchSriFirmas = async (_restaurantId: string) => {
    setSriFirmas([]);
  };

  useEffect(() => {
    if (restaurant) {
      setSriRuc(restaurant.ruc || '');
      setSriDirMatriz(restaurant.sri_dir_matriz || '');
      setSriDirEstab(restaurant.sri_dir_estab || '');
      setSriEstab(restaurant.sri_estab || '001');
      setSriPtoEmi(restaurant.sri_pto_emi || '001');
      setSriObligadoContab(restaurant.sri_obligado_contab !== false);
      setSriRimpe(restaurant.sri_rimpe || '');
      setSriAgenteRetencion(restaurant.sri_agente_retencion || '');
      setSriContribEspecial(restaurant.sri_contrib_especial || '');
      setSriAmbiente(restaurant.sri_ambiente === 2 ? 2 : 1);
      setSriP12B64(restaurant.sri_p12_b64 || '');
      setSriP12Pwd(restaurant.sri_p12_pwd || '');
      setSriEmailEnvio(restaurant.sri_email_envio || '');
      setSmtpHost(restaurant.smtp_host || '');
      setSmtpPort(restaurant.smtp_port ? String(restaurant.smtp_port) : '587');
      setSmtpUser(restaurant.smtp_user || '');
      setSmtpPass(restaurant.smtp_pass || '');
      setSmtpFrom(restaurant.smtp_from || '');
      setSriIvaRate(restaurant.sri_iva_rate !== undefined ? Number(restaurant.sri_iva_rate) : 15.00);
      setSriIvaTemporal(restaurant.sri_iva_temporal !== null && restaurant.sri_iva_temporal !== undefined ? String(restaurant.sri_iva_temporal) : '');
      setSriIvaTemporalInicio(restaurant.sri_iva_temporal_inicio || '');
      setSriIvaTemporalFin(restaurant.sri_iva_temporal_fin || '');
      setSriFirmaExpira(restaurant.sri_firma_expira || '');
      setSriFirmaRazon(restaurant.sri_firma_razon || '');
      fetchSriFirmas(restaurant.id);
      supabase
        .from('sri_document_sequence')
        .select('next_number')
        .eq('restaurant_id', restaurant.id)
        .eq('doc_type', 'factura')
        .maybeSingle()
        .then(({ data }) => {
          if (data?.next_number) setSriSecuencialInicio(data.next_number);
        });
    }
  }, [restaurant]);

  // Admin alerts (high priority)
  const [alerts, setAlerts] = useState<any[]>([]);
  const [activeAlert, setActiveAlert] = useState<any | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Staff management states
  const [staffList, setStaffList] = useState<any[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  // Modal / Form states for creation
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffFullName, setStaffFullName] = useState('');
  const [staffRole, setStaffRole] = useState<'admin_general' | 'vendedor_cajero' | 'cocinero' | 'repartidor' | 'camarero'>('vendedor_cajero');
  const [staffPermissions, setStaffPermissions] = useState<StaffPermissions>(getDefaultPermissions('vendedor_cajero'));
  const [addStaffLoading, setAddStaffLoading] = useState(false);
  const [addStaffError, setAddStaffError] = useState<string | null>(null);

  // Edit / Password Reset states
  const [editingStaffMember, setEditingStaffMember] = useState<any | null>(null);
  const [showEditStaffModal, setShowEditStaffModal] = useState(false);
  const [editStaffFullName, setEditStaffFullName] = useState('');
  const [editStaffRole, setEditStaffRole] = useState<'admin_general' | 'vendedor_cajero' | 'cocinero' | 'repartidor' | 'camarero'>('vendedor_cajero');
  const [editStaffPassword, setEditStaffPassword] = useState('');
  const [editStaffPermissions, setEditStaffPermissions] = useState<StaffPermissions>(getDefaultPermissions('vendedor_cajero'));
  const [editStaffLoading, setEditStaffLoading] = useState(false);
  const [editStaffError, setEditStaffError] = useState<string | null>(null);

  // Audit logs states
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Map of restaurantId -> name for the restaurant switcher
  const [restaurantNames, setRestaurantNames] = useState<Record<string, string>>({});

  // Branch management state
  const [branches, setBranches] = useState<any[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any | null>(null);

  // Form states for branches
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [branchIsActive, setBranchIsActive] = useState(true);
  const [branchSubmitting, setBranchSubmitting] = useState(false);

  // Load names for all accessible restaurants (for the switcher dropdown)
  useEffect(() => {
    if (restaurantAccess.length <= 1) return;
    const ids = restaurantAccess.map(a => a.restaurantId);
    supabase
      .from('restaurants')
      .select('id, name')
      .in('id', ids)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, string> = {};
          data.forEach((r: any) => { map[r.id] = r.name; });
          setRestaurantNames(map);
        }
      });
  }, [restaurantAccess]);

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
      take_order: 'orders',
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
        'take_order',
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

  // Fetch restaurant profile for the ACTIVE restaurant.
  // Resets and reloads whenever the active restaurant changes (multi-tenant support).
  useEffect(() => {
    if (authLoading) return;
    if (!activeRestaurantId) {
      // If user has no restaurants, don't hang the dashboard
      setRestaurantLoading(false);
      setRestaurant(null);
      return;
    }

    // Reset restaurant data when switching restaurants
    setRestaurant(null);
    let isMounted = true;

    const fetchRestaurant = async (attempt = 1) => {
      if (!isMounted) return;
      setRestaurantLoading(true);
      let isRetrying = false;
      try {
        const { data, error } = await supabase
          .from('restaurants')
          .select('*')
          .eq('id', activeRestaurantId)
          .single();

        if (error) {
          if (attempt === 1 && (error.message?.includes('JWT') || error.message?.includes('token') || error.code === 'PGRST301' || error.code === '401')) {
            console.warn('Restaurant fetch got auth error, retrying in 1s...', error.message);
            isRetrying = true;
            setTimeout(() => fetchRestaurant(2), 1000);
            return;
          }
          throw error;
        }

        if (isMounted && data) {
          setRestaurant(data);
        }
      } catch (err) {
        console.error('Error fetching restaurant:', err);
      } finally {
        if (isMounted && !isRetrying) {
          setRestaurantLoading(false);
        }
      }
    };

    fetchRestaurant();

    return () => {
      isMounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, activeRestaurantId]);

  // Admin alerts audio trigger helper
  const triggerAlarmSound = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav');
      audioRef.current.loop = true;
    }
    audioRef.current.play().catch(e => console.warn('Audio play blocked:', e));
  };

  const stopAlarmSound = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    stopAlarmSound();
    try {
      const { error } = await supabase
        .from('admin_alerts')
        .update({ status: 'resolved' })
        .eq('id', alertId);

      if (error) throw error;
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      setActiveAlert(null);
      toast.success('Alerta marcada como resuelta.');
    } catch (err) {
      console.error('Error resolving alert:', err);
      toast.error('No se pudo resolver la alerta.');
    }
  };

  // Subscribe to high-priority admin alerts
  useEffect(() => {
    if (!activeRestaurantId) return;

    // Fetch initial pending alerts
    supabase
      .from('admin_alerts')
      .select('*')
      .eq('restaurant_id', activeRestaurantId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setAlerts(data);
          setActiveAlert(data[0]);
          triggerAlarmSound();
        }
      });

    // Subscribe to new inserts
    const channel = supabase
      .channel(`admin-alerts-${activeRestaurantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_alerts',
          filter: `restaurant_id=eq.${activeRestaurantId}`,
        },
        (payload) => {
          const newAlert = payload.new as any;
          if (newAlert.status === 'pending') {
            setAlerts(prev => [newAlert, ...prev]);
            setActiveAlert(newAlert);
            triggerAlarmSound();
            toast.warning(`🚨 ¡ALERTA! Nueva solicitud: ${newAlert.title}`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      stopAlarmSound();
    };
  }, [activeRestaurantId]);

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
          restaurant_id: restaurant?.id || activeRestaurantId || '',
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
    // Liberar mesa si el pedido se marca como entregado o cancelado
    if (status === 'delivered' || status === 'cancelled') {
      try {
        const { data: orderData, error: orderErr } = await supabase
          .from('orders')
          .select('table_number, restaurant_id, branch_id')
          .eq('id', orderId)
          .single();
        if (!orderErr && orderData?.table_number) {
          await supabase
            .from('restaurant_tables')
            .update({ status: 'free', current_order_id: null })
            .eq('restaurant_id', orderData.restaurant_id)
            .eq('branch_id', orderData.branch_id)
            .eq('table_number', orderData.table_number);
        }
      } catch (e) {
        console.error(`Error liberando mesa para el pedido ${orderId}:`, e);
      }
    }
    return success;
  }

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

      const res = await fetch(`/api/admin/users?restaurantId=${activeRestaurantId}`, {
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
  }, [activeRestaurantId]);

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
        .eq('restaurant_id', restaurant?.id || activeRestaurantId)
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
          restaurantId: activeRestaurantId,
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
        restaurantId: activeRestaurantId,
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

      const res = await fetch(`/api/admin/users/${memberId}?restaurantId=${activeRestaurantId}`, {
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
        icon: React.createElement(Bell, { className: 'h-5 w-5 animate-pulse text-emerald-500' })
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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch('/api/bootstrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (data.success) {
        setRestaurant(data.restaurant);
        toast.success('Base de datos inicializada correctamente');
      } else {
        toast.error('Error: ' + (data.error || 'Error desconocido'));
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
        .eq('restaurant_id', restaurant?.id || activeRestaurantId)
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

  // Fetch settings for active restaurant
  const fetchSettings = React.useCallback(async () => {
    if (!restaurant?.id) return;
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('ai_system_instruction')
        .eq('restaurant_id', restaurant?.id || activeRestaurantId)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching settings:', error);
      } else if (data) {
        setAiSystemInstruction(data.ai_system_instruction || '');
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  }, [restaurant?.id]);

  const fetchBranches = React.useCallback(async () => {
    if (!restaurant?.id) return;
    setBranchesLoading(true);
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('name', { ascending: true });
      if (error) throw error;
      setBranches(data || []);
    } catch (err) {
      console.error('Error fetching branches:', err);
    } finally {
      setBranchesLoading(false);
    }
  }, [restaurant?.id]);

  useEffect(() => {
    if (activeTab === 'settings' && restaurant?.id) {
      fetchSettings();
      fetchBranches();
    }
  }, [activeTab, restaurant?.id, fetchSettings, fetchBranches]);

  const handleUpdateAiInstruction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant?.id) return;
    
    setAiSystemInstructionLoading(true);
    setAiMessage(null);
    try {
      const { error } = await supabase
        .from('settings')
        .update({ ai_system_instruction: aiSystemInstruction })
        .eq('restaurant_id', restaurant?.id || activeRestaurantId);
        
      if (error) throw error;
      
      setAiMessage({ type: 'success', text: 'Prompt de la IA actualizado correctamente.' });
      setTimeout(() => setAiMessage(null), 3000);
    } catch (err) {
      console.error('Error updating AI instruction:', err);
      setAiMessage({ type: 'error', text: 'Error al actualizar el prompt.' });
    } finally {
      setAiSystemInstructionLoading(false);
    }
  };

  const handleUpdateSriSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant?.id) return;

    setSriLoading(true);
    setSriMessage(null);
    try {
      let metadata: any = {};

      // Si se subio nueva firma, extraer metadatos via API (no lanzar error si falla - es opcional)
      if (newP12Uploaded && sriP12B64 && sriP12Pwd) {
        try {
          const res = await fetch('/api/sri/metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ p12B64: sriP12B64, pwd: sriP12Pwd })
          });
          const json = await res.json();
          if (res.ok) {
            metadata.sri_firma_razon = json.razon;
            metadata.sri_firma_expira = json.expira;
            setSriFirmaRazon(json.razon);
            setSriFirmaExpira(json.expira);
          }
        } catch (_e) {
          // Metadatos son opcionales
        }
        setNewP12Uploaded(false);
      }

      // Una sola llamada guarda TODO: p12, configuracion general y metadatos
      // sri_p12_b64 siempre incluido para que setRestaurant actualice el estado local correctamente
      const updates: any = {
        ruc: sriRuc.trim() || null,
        sri_dir_matriz: sriDirMatriz.trim() || null,
        sri_dir_estab: sriDirEstab.trim() || null,
        sri_estab: sriEstab.trim() || '001',
        sri_pto_emi: sriPtoEmi.trim() || '001',
        sri_obligado_contab: sriObligadoContab,
        sri_rimpe: sriRimpe || null,
        sri_agente_retencion: sriAgenteRetencion.trim() || null,
        sri_contrib_especial: sriContribEspecial.trim() || null,
        sri_ambiente: Number(sriAmbiente),
        sri_p12_b64: sriP12B64 || null,
        sri_p12_pwd: sriP12Pwd || null,
        sri_email_envio: sriEmailEnvio.trim() || null,
        smtp_host: smtpHost.trim() || null,
        smtp_port: smtpPort ? parseInt(smtpPort) : 587,
        smtp_user: smtpUser.trim() || null,
        smtp_pass: smtpPass || null,
        smtp_from: smtpFrom.trim() || null,
        sri_iva_rate: Number(sriIvaRate),
        sri_iva_temporal: sriIvaTemporal ? Number(sriIvaTemporal) : null,
        sri_iva_temporal_inicio: sriIvaTemporalInicio || null,
        sri_iva_temporal_fin: sriIvaTemporalFin || null,
        ...metadata,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('restaurants')
        .update(updates)
        .eq('id', restaurant.id);

      if (error) throw error;

      await supabase.rpc('sri_set_secuencial', {
        p_restaurant_id: restaurant.id,
        p_doc_type: 'factura',
        p_estab: sriEstab.trim() || '001',
        p_pto_emi: sriPtoEmi.trim() || '001',
        p_next_number: Math.max(1, Number(sriSecuencialInicio) || 1)
      });

      // Actualizar estado local incluyendo p12 para que el useEffect no sobreescriba con null
      setRestaurant(prev => prev ? { ...prev, ...updates } : null);
      setSriMessage({ type: 'success', text: 'Configuracion de facturacion SRI guardada.' });
      setTimeout(() => setSriMessage(null), 3000);
    } catch (err: any) {
      console.error('Error updating SRI settings:', err);
      setSriMessage({ type: 'error', text: err.message || 'Error al guardar.' });
    } finally {
      setSriLoading(false);
    }
  };

  const [sriTesting, setSriTesting] = useState(false);

  const handleTestSriConnection = async () => {
    if (!sriP12B64 || !sriP12Pwd) {
      setSriMessage({ 
        type: 'error', 
        text: 'Por favor, carga una firma digital (.p12) e ingresa la contraseña para realizar la prueba.' 
      });
      return;
    }
    setSriTesting(true);
    setSriMessage(null);
    try {
      const res = await fetch('/api/sri/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p12B64: sriP12B64, pwd: sriP12Pwd, ambiente: sriAmbiente })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Fallo de conexión o certificado no válido.');
      }
      
      const expDate = new Date(data.certificate.expira).toLocaleDateString();
      setSriMessage({
        type: 'success',
        text: `✓ Conexión exitosa con el SRI en ambiente de ${sriAmbiente === 2 ? 'PRODUCCIÓN' : 'PRUEBAS'}. Firmante: ${data.certificate.subject}. Vence el: ${expDate}.`
      });
    } catch (err: any) {
      console.error(err);
      setSriMessage({ type: 'error', text: `Error de prueba: ${err.message}` });
    } finally {
      setSriTesting(false);
    }
  };

  const handleActivateSignature = async (firmaId: string) => {
    if (!restaurant?.id) return;
    try {
      setSriLoading(true);
      setSriMessage(null);
      
      // 1. Deactivate all other signatures
      await supabase
        .from('sri_firmas')
        .update({ esta_activa: false })
        .eq('restaurant_id', restaurant.id);

      // 2. Activate selected signature
      const { data: activated, error: actErr } = await supabase
        .from('sri_firmas')
        .update({ esta_activa: true })
        .eq('id', firmaId)
        .select()
        .single();

      if (actErr || !activated) throw actErr || new Error('No se pudo activar la firma.');

      // 3. Update legacy fields on restaurant
      const updates = {
        sri_p12_b64: activated.archivo_base64,
        sri_p12_pwd: activated.clave,
        sri_firma_razon: activated.razon_social,
        sri_firma_expira: activated.expiracion
      };

      const { error: restErr } = await supabase
        .from('restaurants')
        .update(updates)
        .eq('id', restaurant.id);

      if (restErr) throw restErr;

      // 4. Update UI states
      setSriP12B64(activated.archivo_base64 || '');
      setSriP12Pwd(activated.clave || '');
      setSriFirmaRazon(activated.razon_social || '');
      setSriFirmaExpira(activated.expiracion || '');
      setRestaurant(prev => prev ? { ...prev, ...updates } : null);

      await fetchSriFirmas(restaurant.id);
      setSriMessage({ type: 'success', text: 'Firma electrónica activada con éxito.' });
      setTimeout(() => setSriMessage(null), 3000);
    } catch (err: any) {
      console.error('Error activating signature:', err);
      setSriMessage({ type: 'error', text: `Error al activar firma: ${err.message}` });
    } finally {
      setSriLoading(false);
    }
  };

  const handleDeleteSignature = async (firmaId: string) => {
    if (!restaurant?.id) return;
    if (!confirm('¿Está seguro de eliminar esta firma electrónica permanentemente?')) return;
    try {
      setSriLoading(true);
      setSriMessage(null);
      
      const target = sriFirmas.find(f => f.id === firmaId);
      const wasActive = target?.esta_activa;

      const { error } = await supabase
        .from('sri_firmas')
        .delete()
        .eq('id', firmaId);

      if (error) throw error;

      if (wasActive) {
        const updates = {
          sri_p12_b64: null,
          sri_p12_pwd: null,
          sri_firma_razon: null,
          sri_firma_expira: null
        };
        await supabase.from('restaurants').update(updates).eq('id', restaurant.id);
        setSriP12B64('');
        setSriP12Pwd('');
        setSriFirmaRazon('');
        setSriFirmaExpira('');
        setRestaurant(prev => prev ? { ...prev, ...updates } : null);
      }

      await fetchSriFirmas(restaurant.id);
      setSriMessage({ type: 'success', text: 'Firma electrónica eliminada.' });
      setTimeout(() => setSriMessage(null), 3000);
    } catch (err: any) {
      console.error('Error deleting signature:', err);
      setSriMessage({ type: 'error', text: `Error al eliminar firma: ${err.message}` });
    } finally {
      setSriLoading(false);
    }
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurant?.id) return;
    if (!branchName.trim()) {
      toast.error('El nombre de la sucursal es obligatorio.');
      return;
    }

    setBranchSubmitting(true);
    try {
      if (editingBranch) {
        const { error } = await supabase
          .from('branches')
          .update({
            name: branchName.trim(),
            address: branchAddress.trim() || null,
            phone: branchPhone.trim() || null,
            is_active: branchIsActive
          })
          .eq('id', editingBranch.id);
        if (error) throw error;
        toast.success('Sucursal actualizada con éxito.');
      } else {
        const { error } = await supabase
          .from('branches')
          .insert({
            restaurant_id: restaurant.id,
            name: branchName.trim(),
            address: branchAddress.trim() || null,
            phone: branchPhone.trim() || null,
            is_active: branchIsActive
          });
        if (error) throw error;
        toast.success('Sucursal creada con éxito.');
      }

      setBranchName('');
      setBranchAddress('');
      setBranchPhone('');
      setBranchIsActive(true);
      setShowAddBranch(false);
      setEditingBranch(null);
      await fetchBranches();
    } catch (err) {
      console.error('Error saving branch:', err);
      toast.error('Error al guardar la sucursal.');
    } finally {
      setBranchSubmitting(false);
    }
  };

  const handleDeleteBranch = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta sucursal?')) return;
    try {
      const { error } = await supabase
        .from('branches')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast.success('Sucursal eliminada.');
      await fetchBranches();
    } catch (err) {
      console.error('Error deleting branch:', err);
      toast.error('Error al eliminar la sucursal.');
    }
  };

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
  // ALSO: If auth is done but there is NO activeRestaurantId, don't block.
  if (authLoading || (restaurantLoading && activeRestaurantId)) {
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


  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 flex flex-col md:flex-row antialiased transition-colors duration-300">
      
      {/* Alarm notification popup */}
      {activeAlert && (
        <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-950 border-2 border-red-500/80 max-w-md w-full rounded-3xl p-7 text-center space-y-6 shadow-[0_0_50px_rgba(239,68,68,0.35)]">
            <div className="flex justify-center">
              <div className="p-4 bg-red-500/10 text-red-500 border border-red-500/30 rounded-full animate-bounce">
                <Bell className="h-10 w-10" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-lg font-black text-red-500 uppercase tracking-widest">
                🚨 ALERTA DE ALTA PRIORIDAD 🚨
              </h2>
              <h3 className="text-base font-bold text-zinc-100">{activeAlert.title}</h3>
              <p className="text-xs text-zinc-400 font-medium leading-relaxed">{activeAlert.message}</p>
            </div>

            <div className="bg-zinc-900/60 border border-zinc-850 p-4 rounded-2xl text-left text-xs space-y-2">
              <div className="flex justify-between text-zinc-400 font-semibold">
                <span>Cliente:</span>
                <span className="text-zinc-200">{activeAlert.customer_name || 'N/D'}</span>
              </div>
              <div className="flex justify-between text-zinc-400 font-semibold">
                <span>Teléfono:</span>
                <span className="text-zinc-200">+{activeAlert.customer_phone}</span>
              </div>
              <div className="flex justify-between text-zinc-400 font-semibold">
                <span>Fecha/Hora:</span>
                <span className="text-zinc-200">{new Date(activeAlert.created_at).toLocaleTimeString()}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  stopAlarmSound();
                  window.open(`https://wa.me/${activeAlert.customer_phone}`, '_blank');
                }}
                className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer shadow-lg flex items-center justify-center gap-1.5 border border-transparent"
              >
                <Smartphone className="h-4 w-4" /> Chatear WhatsApp
              </button>
              
              <button
                onClick={() => handleResolveAlert(activeAlert.id)}
                className="flex-1 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold rounded-xl text-xs transition-all border border-zinc-800 hover:border-zinc-700 cursor-pointer"
              >
                Resolver
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Sidebar */}
      <aside className="w-full md:w-64 bg-zinc-950 border-r border-zinc-900 flex flex-col shrink-0">
        {/* Restaurant Header — shows selector when user has multiple restaurants */}
        <div className="p-4 border-b border-zinc-900">
          {restaurantAccess.length > 1 ? (
            /* Multi-restaurant selector */
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div className="h-7 w-7 rounded-lg bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <Utensils className="h-3.5 w-3.5 text-emerald-400" />
                </div>
                <p className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">Restaurante activo</p>
              </div>
              <select
                value={activeRestaurantId || ''}
                onChange={(e) => {
                  setActiveRestaurantId(e.target.value);
                  setActiveTab('orders');
                }}
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs font-semibold rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                {restaurantAccess.map(a => (
                  <option key={a.restaurantId} value={a.restaurantId}>
                    {restaurantNames[a.restaurantId] || `Restaurante ${a.restaurantId.substring(0, 8)}...`}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            /* Single restaurant — simple header */
            <div className="flex items-center gap-3 px-1">
              <div className="h-9 w-9 rounded-xl bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <Utensils className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-zinc-100 truncate">{restaurant?.name || 'Sin Restaurante'}</h1>
                <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 uppercase tracking-wider mt-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  SaaS Live Panel
                </p>
              </div>
            </div>
          )}
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
            <>
              <button
                onClick={() => setActiveTab('take_order')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  activeTab === 'take_order'
                    ? 'bg-zinc-900 text-emerald-400 border border-zinc-800'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
                }`}
              >
                <Utensils className="h-4.5 w-4.5" />
                <span>Tomar Pedido</span>
              </button>

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
            </>
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
                  {role === 'camarero' && 'Camarero / Mesero'}
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
              ID Local: {restaurant?.id?.substring(0, 8) || 'N/A'}...
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
          {activeTab === 'take_order' && activeRestaurantId && (
            <TakeOrderPanel
              restaurantId={restaurant?.id || activeRestaurantId || ''}
              activeBranchId={branchId}
            />
          )}

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
              restaurantAddress={restaurant?.address || ''}
              onRefresh={refreshOrders}
            />
          ) : null}

          {activeTab === 'customers' && (
            <CustomersPanel 
              restaurantId={activeRestaurantId || ''}
              orders={orders} 
              loading={ordersLoading} 
            />
          )}

          {activeTab === 'reports' && (
            <ReportsPanel 
              orders={orders} 
              loading={ordersLoading} 
              restaurantId={restaurant?.id || activeRestaurantId || ''}
            />
          )}

          {activeTab === 'menu' && (
            <MenuPanel 
              restaurantId={restaurant?.id || activeRestaurantId || ''} 
              readOnly={activePermissions.menu === 'read'}
            />
          )}

          {activeTab === 'simulator' && activeRestaurantId && restaurant && (
            <SimulatorPanel 
              restaurantId={restaurant?.id || activeRestaurantId || ''} 
            />
          )}

          {activeTab === 'saas' && (
            <SaaSAdminPanel
              onAccessRestaurant={(id: string) => {
                setActiveRestaurantId(id);
                setActiveTab('orders');
              }}
            />
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
                            : member.role === 'camarero'
                            ? 'bg-cyan-50 dark:bg-cyan-950/20 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-900/40'
                            : 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-650 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/40'
                        }`}>
                          {member.role === 'admin_general' && 'Admin General'}
                          {member.role === 'vendedor_cajero' && 'Vendedor / Cajero'}
                          {member.role === 'cocinero' && 'Cocinero'}
                          {member.role === 'repartidor' && 'Repartidor'}
                          {member.role === 'camarero' && 'Camarero / Mesero'}
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
                  <div className="bg-zinc-950 border border-zinc-900 max-w-lg w-full rounded-3xl p-6.5 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="bg-emerald-500/10 p-2 rounded-xl text-emerald-500">
                            <UserPlus className="h-5 w-5" />
                          </div>
                          <h4 className="text-lg font-bold text-zinc-100">Agregar Nuevo Personal</h4>
                        </div>
                        <p className="text-sm text-zinc-500 mt-1">
                          Crea una cuenta para un miembro del equipo en <span className="font-bold text-emerald-500">{restaurant?.name}</span>.
                        </p>
                      </div>
                      <button 
                        onClick={() => setShowAddStaffModal(false)}
                        className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-zinc-250 hover:bg-zinc-800 border border-zinc-850 cursor-pointer transition-all"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    {addStaffError && (
                      <div className="bg-rose-950/20 border border-rose-900/40 p-4 rounded-xl text-rose-400 text-sm flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                        <span>{addStaffError}</span>
                      </div>
                    )}

                    <form onSubmit={handleAddStaff} className="space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-1.5 text-sm">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[11px] ml-1">Nombre Completo</label>
                          <input
                            type="text"
                            required
                            value={staffFullName}
                            onChange={(e) => setStaffFullName(e.target.value)}
                            placeholder="Ej. María Clara Gómez"
                            className="w-full bg-zinc-900/40 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-3 rounded-xl text-zinc-100 outline-none transition-all placeholder:text-zinc-600"
                          />
                        </div>

                        <div className="space-y-1.5 text-sm">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[11px] ml-1">Correo Electrónico</label>
                          <input
                            type="email"
                            required
                            value={staffEmail}
                            onChange={(e) => setStaffEmail(e.target.value)}
                            placeholder="ejemplo@restaurante.com"
                            className="w-full bg-zinc-900/40 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-3 rounded-xl text-zinc-100 outline-none transition-all placeholder:text-zinc-600"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-1.5 text-sm">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[11px] ml-1 flex items-center gap-1.5">
                            Contraseña Inicial
                          </label>
                          <input
                            type="password"
                            required
                            value={staffPassword}
                            onChange={(e) => setStaffPassword(e.target.value)}
                            placeholder="Mínimo 6 caracteres"
                            className="w-full bg-zinc-900/40 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-3 rounded-xl text-zinc-100 outline-none transition-all placeholder:text-zinc-600"
                          />
                        </div>

                        <div className="space-y-1.5 text-sm">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[11px] ml-1 flex items-center gap-1.5">
                            Rol del Usuario
                          </label>
                          <select
                            value={staffRole}
                            onChange={(e) => handleRoleChange(e.target.value as any)}
                            className="w-full bg-zinc-900/80 border border-zinc-800 focus:border-emerald-500 p-3 rounded-xl text-zinc-100 outline-none transition-all cursor-pointer font-medium"
                          >
                            <option value="admin_general">Administrador General</option>
                            <option value="vendedor_cajero">Vendedor / Cajero</option>
                            <option value="cocinero">Cocinero</option>
                            <option value="repartidor">Repartidor</option>
                            <option value="camarero">Camarero / Mesero</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-3.5 border-t border-zinc-900/65 pt-5 mt-2">
                        <label className="font-bold text-zinc-400 uppercase tracking-wider text-[11px] ml-1 flex items-center gap-1.5">
                          <ShieldCheck className="h-4 w-4 text-amber-500" /> Permisos del Sistema
                        </label>
                        <div className="space-y-2.5 max-h-[30vh] overflow-y-auto pr-2 custom-scrollbar">
                          {modulesConfig.map(({ key, label, desc }) => {
                            const val = staffPermissions[key];
                            return (
                              <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-zinc-900/30 border border-zinc-800/80 gap-3 hover:border-zinc-700 transition-colors">
                                <div className="min-w-0">
                                  <span className="text-sm font-semibold text-zinc-100 block">{label}</span>
                                  <span className="text-[11px] text-zinc-500 block truncate leading-tight mt-0.5">{desc}</span>
                                </div>
                                <div className="flex gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-850 shrink-0 self-start sm:self-center shadow-inner">
                                  {(['write', 'read', 'none'] as const).map((level) => (
                                    <button
                                      key={level}
                                      type="button"
                                      onClick={() => setStaffPermissions(prev => ({ ...prev, [key]: level }))}
                                      className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all cursor-pointer ${
                                        val === level
                                          ? level === 'write'
                                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                                            : level === 'read'
                                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm'
                                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-sm'
                                          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 border border-transparent'
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
                          <option value="camarero">Camarero / Mesero</option>
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

              {/* Branch Management Section */}
              {role === 'admin_general' && (
                <div className="bg-zinc-950/40 border border-zinc-900 p-6 rounded-2xl space-y-6 animate-in fade-in-50 duration-200">
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-200 font-bold">Sucursales de la Empresa</h4>
                      <p className="text-xs text-zinc-500">Configura y gestiona las sucursales físicas de tu restaurante.</p>
                    </div>
                    {!showAddBranch && !editingBranch && (
                      <button
                        onClick={() => {
                          setEditingBranch(null);
                          setBranchName('');
                          setBranchAddress('');
                          setBranchPhone('');
                          setBranchIsActive(true);
                          setShowAddBranch(true);
                        }}
                        className="flex items-center gap-1 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" /> Nueva Sucursal
                      </button>
                    )}
                  </div>

                  {/* Add / Edit Form */}
                  {(showAddBranch || editingBranch) && (
                    <form onSubmit={handleSaveBranch} className="bg-zinc-900/40 border border-zinc-850 p-4 rounded-xl space-y-4 animate-in slide-in-from-top-4 duration-200">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                        {editingBranch ? 'Editar Sucursal' : 'Nueva Sucursal'}
                      </h5>
                      <div className="space-y-3">
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Nombre de Sucursal</label>
                          <input
                            type="text"
                            required
                            placeholder="Ej. Sucursal Norte"
                            value={branchName}
                            onChange={(e) => setBranchName(e.target.value)}
                            className="w-full bg-zinc-900/60 border border-zinc-805 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1 text-xs">
                            <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Teléfono</label>
                            <input
                              type="text"
                              placeholder="Ej. +593999999999"
                              value={branchPhone}
                              onChange={(e) => setBranchPhone(e.target.value)}
                              className="w-full bg-zinc-900/60 border border-zinc-805 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                            />
                          </div>
                          <div className="space-y-1 text-xs">
                            <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Dirección</label>
                            <input
                              type="text"
                              placeholder="Ej. Av. de la República"
                              value={branchAddress}
                              onChange={(e) => setBranchAddress(e.target.value)}
                              className="w-full bg-zinc-900/60 border border-zinc-805 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs pt-1">
                          <input
                            type="checkbox"
                            id="branch_is_active"
                            checked={branchIsActive}
                            onChange={(e) => setBranchIsActive(e.target.checked)}
                            className="rounded border-zinc-800 text-emerald-600 focus:ring-emerald-500 bg-zinc-900 h-4 w-4 cursor-pointer"
                          />
                          <label htmlFor="branch_is_active" className="text-zinc-350 cursor-pointer font-semibold">
                            Sucursal Activa (Se mostrará en la toma de pedidos)
                          </label>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 text-xs pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddBranch(false);
                            setEditingBranch(null);
                          }}
                          className="px-3 py-2 border border-zinc-800 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200 rounded-xl font-bold transition-all cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={branchSubmitting}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white rounded-xl font-bold transition-all flex items-center gap-1 cursor-pointer"
                        >
                          {branchSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
                          {editingBranch ? 'Guardar Cambios' : 'Crear Sucursal'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Branches List */}
                  {branchesLoading ? (
                    <div className="flex justify-center items-center py-6 gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                      <span className="text-xs text-zinc-500">Cargando sucursales...</span>
                    </div>
                  ) : branches.length > 0 ? (
                    <div className="space-y-3">
                      {branches.map((b) => (
                        <div key={b.id} className="bg-zinc-900/30 border border-zinc-900 p-4 rounded-xl flex items-center justify-between gap-4 hover:border-zinc-800/80 transition-colors animate-in fade-in duration-150">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-zinc-200 truncate">{b.name}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                b.is_active 
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' 
                                  : 'bg-zinc-800 text-zinc-500 border border-zinc-850'
                              }`}>
                                {b.is_active ? 'Activa' : 'Inactiva'}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5 text-[11px] text-zinc-500 font-medium">
                              {b.address && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 text-zinc-600 shrink-0" /> {b.address}
                                </span>
                              )}
                              {b.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3 text-zinc-600 shrink-0" /> {b.phone}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => {
                                setEditingBranch(b);
                                setBranchName(b.name);
                                setBranchAddress(b.address || '');
                                setBranchPhone(b.phone || '');
                                setBranchIsActive(b.is_active);
                                setShowAddBranch(false);
                              }}
                              className="p-1.5 rounded-lg bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-transparent hover:border-zinc-850 cursor-pointer"
                              title="Editar"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteBranch(b.id)}
                              className="p-1.5 rounded-lg bg-zinc-900 text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-950/20 cursor-pointer"
                              title="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 border border-dashed border-zinc-900 rounded-xl space-y-2">
                      <MapPin className="h-8 w-8 text-zinc-700 mx-auto" />
                      <p className="text-xs text-zinc-500">No hay sucursales registradas aún.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Facturación Electrónica SRI (Ecuador) */}
              {role === 'admin_general' && (
                <div className="bg-zinc-950/40 border border-zinc-900 p-6 rounded-2xl space-y-6 animate-in fade-in-50 duration-200 lg:col-span-2">
                  <div className="border-b border-zinc-900 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-zinc-200 font-bold flex items-center gap-2">
                        <Utensils className="h-4 w-4 text-emerald-500" /> Facturación Electrónica SRI (Ecuador)
                      </h4>
                      <p className="text-xs text-zinc-500">Configura los parámetros para la emisión de facturas electrónicas válidas ante el SRI.</p>
                    </div>
                    {sriFirmaExpira && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Firma Válida hasta: {new Date(sriFirmaExpira).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {sriMessage && (
                    <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                      sriMessage.type === 'success' ? 'bg-emerald-950/15 border border-emerald-900/30 text-emerald-400' : 'bg-rose-950/15 border border-rose-900/30 text-rose-455'
                    }`}>
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{sriMessage.text}</span>
                    </div>
                  )}

                  <form onSubmit={handleUpdateSriSettings} className="space-y-6">
                    {/* Sección 1: Datos Emisor */}
                    <div className="space-y-4">
                      <h5 className="text-xs font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-900 pb-1">1. Datos del Emisor</h5>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">RUC de la Empresa</label>
                          <input
                            type="text"
                            required
                            maxLength={13}
                            disabled={activePermissions.settings === 'read' || sriLoading}
                            placeholder="Ej. 1790000000001"
                            value={sriRuc}
                            onChange={(e) => setSriRuc(e.target.value.replace(/\D/g, ''))}
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                          />
                        </div>
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Código Establecimiento</label>
                          <input
                            type="text"
                            required
                            maxLength={3}
                            disabled={activePermissions.settings === 'read' || sriLoading}
                            placeholder="Ej. 001"
                            value={sriEstab}
                            onChange={(e) => setSriEstab(e.target.value.replace(/\D/g, ''))}
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Punto de Emisión</label>
                          <input
                            type="text"
                            required
                            maxLength={3}
                            disabled={activePermissions.settings === 'read' || sriLoading}
                            placeholder="Ej. 001"
                            value={sriPtoEmi}
                            onChange={(e) => setSriPtoEmi(e.target.value.replace(/\D/g, ''))}
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs font-mono"
                          />
                        </div>
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">
                            Secuencial Desde
                            <span className="ml-1 text-zinc-600 normal-case font-normal">(próximo número a emitir)</span>
                          </label>
                          <input
                            type="number"
                            min={1}
                            disabled={activePermissions.settings === 'read' || sriLoading}
                            placeholder="1"
                            value={sriSecuencialInicio}
                            onChange={(e) => setSriSecuencialInicio(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Dirección Matriz</label>
                          <input
                            type="text"
                            required
                            disabled={activePermissions.settings === 'read' || sriLoading}
                            placeholder="Ej. Av. Amazonas 123 y Colón"
                            value={sriDirMatriz}
                            onChange={(e) => setSriDirMatriz(e.target.value)}
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                          />
                        </div>
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Dirección Establecimiento (Opcional)</label>
                          <input
                            type="text"
                            disabled={activePermissions.settings === 'read' || sriLoading}
                            placeholder="Ej. Centro Comercial El Recreo, Local 15"
                            value={sriDirEstab}
                            onChange={(e) => setSriDirEstab(e.target.value)}
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                        <div className="flex items-center gap-2 text-xs pt-4">
                          <input
                            type="checkbox"
                            id="sri_obligado_contab"
                            disabled={activePermissions.settings === 'read' || sriLoading}
                            checked={sriObligadoContab}
                            onChange={(e) => setSriObligadoContab(e.target.checked)}
                            className="rounded border-zinc-800 text-emerald-600 focus:ring-emerald-500 bg-zinc-900 h-4 w-4 cursor-pointer"
                          />
                          <label htmlFor="sri_obligado_contab" className="text-zinc-350 cursor-pointer font-semibold">
                            Obligado a llevar Contabilidad
                          </label>
                        </div>
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Régimen RIMPE (Opcional)</label>
                          <select
                            value={sriRimpe}
                            disabled={activePermissions.settings === 'read' || sriLoading}
                            onChange={(e) => setSriRimpe(e.target.value)}
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                          >
                            <option value="">Ninguno / Régimen General</option>
                            <option value="CONTRIBUYENTE RÉGIMEN RIMPE">RIMPE Emprendedor/Popular</option>
                            <option value="RIMPE EMPRENDEDOR">RIMPE Emprendedor (Detallado)</option>
                            <option value="RIMPE POPULAR">RIMPE Popular (Detallado)</option>
                          </select>
                        </div>
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Resolución Agente Retención (Opcional)</label>
                          <input
                            type="text"
                            disabled={activePermissions.settings === 'read' || sriLoading}
                            placeholder="Ej. NAC-DNCRASC20-00000001"
                            value={sriAgenteRetencion}
                            onChange={(e) => setSriAgenteRetencion(e.target.value)}
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                          />
                        </div>
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Nro. Contribuyente Especial (Opcional)</label>
                          <input
                            type="text"
                            disabled={activePermissions.settings === 'read' || sriLoading}
                            placeholder="Ej. 1234"
                            value={sriContribEspecial}
                            onChange={(e) => setSriContribEspecial(e.target.value)}
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Sección 2: Configuración del IVA */}
                    <div className="space-y-4">
                      <h5 className="text-xs font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-900 pb-1">2. Configuración de IVA (Ecuador)</h5>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Porcentaje IVA General (%)</label>
                          <input
                            type="number"
                            step="0.01"
                            required
                            min="0"
                            max="100"
                            disabled={activePermissions.settings === 'read' || sriLoading}
                            value={sriIvaRate}
                            onChange={(e) => setSriIvaRate(Number(e.target.value))}
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                          />
                        </div>
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Porcentaje IVA Temporal (%)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            disabled={activePermissions.settings === 'read' || sriLoading}
                            placeholder="Ninguno"
                            value={sriIvaTemporal}
                            onChange={(e) => setSriIvaTemporal(e.target.value)}
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                          />
                        </div>
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Inicio IVA Temporal</label>
                          <input
                            type="date"
                            disabled={activePermissions.settings === 'read' || sriLoading}
                            value={sriIvaTemporalInicio}
                            onChange={(e) => setSriIvaTemporalInicio(e.target.value)}
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                          />
                        </div>
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Fin IVA Temporal</label>
                          <input
                            type="date"
                            disabled={activePermissions.settings === 'read' || sriLoading}
                            value={sriIvaTemporalFin}
                            onChange={(e) => setSriIvaTemporalFin(e.target.value)}
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-500">
                        El IVA temporal anulará el IVA General únicamente durante el rango de fechas indicado (inclusive).
                      </p>
                    </div>

                    {/* Sección 3: Firma Electrónica y Ambiente */}
                    <div className="space-y-4">
                      <h5 className="text-xs font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-900 pb-1">3. Firma Electrónica (.p12) y Ambiente</h5>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Ambiente SRI</label>
                          <select
                            required
                            disabled={activePermissions.settings === 'read' || sriLoading}
                            value={sriAmbiente}
                            onChange={(e) => setSriAmbiente(Number(e.target.value))}
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                          >
                            <option value={1}>PRUEBAS (Test)</option>
                            <option value={2}>PRODUCCIÓN (Real)</option>
                          </select>
                        </div>
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] flex items-center justify-between">
                            <span>Archivo Firma Digital (.p12) {sriP12B64 ? '✓ Cargado' : ''}</span>
                            <a href="/guardar_firma.html" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 underline font-normal normal-case text-[10px]">
                              ¿Problemas al guardar? Usar herramienta directa
                            </a>
                          </label>
                          <input
                            type="file"
                            accept=".p12"
                            disabled={activePermissions.settings === 'read' || sriLoading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const result = ev.target?.result as string;
                                const base64 = result.split(',')[1] || result;
                                setSriP12B64(base64);
                                setNewP12Uploaded(true);
                              };
                              reader.readAsDataURL(file);
                            }}
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2 rounded-xl text-zinc-400 outline-none text-xs file:bg-zinc-800 file:border-0 file:rounded-lg file:text-zinc-200 file:text-[10px] file:font-bold file:px-3 file:py-1.5 file:mr-3 file:cursor-pointer hover:file:bg-zinc-700"
                          />
                        </div>
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Contraseña de la Firma</label>
                          <input
                            type="password"
                            disabled={activePermissions.settings === 'read' || sriLoading}
                            placeholder={sriP12Pwd ? "••••••••••••" : "Ingresar contraseña"}
                            value={sriP12Pwd}
                            onChange={(e) => setSriP12Pwd(e.target.value)}
                            className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                          />
                        </div>
                      </div>

                      {/* ── Configuración SMTP por restaurante ── */}
                      <div className="mt-2 border border-zinc-800 rounded-xl p-4 space-y-3">
                        <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-1">Configuración de Correo (SMTP)</div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1 text-xs md:col-span-2">
                            <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Servidor SMTP (Host)</label>
                            <input
                              type="text"
                              disabled={activePermissions.settings === 'read' || sriLoading}
                              placeholder="smtp.gmail.com"
                              value={smtpHost}
                              onChange={(e) => setSmtpHost(e.target.value)}
                              className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                            />
                          </div>
                          <div className="space-y-1 text-xs">
                            <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Puerto</label>
                            <input
                              type="number"
                              disabled={activePermissions.settings === 'read' || sriLoading}
                              placeholder="587"
                              value={smtpPort}
                              onChange={(e) => setSmtpPort(e.target.value)}
                              className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-1 text-xs">
                            <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Usuario / Correo remitente</label>
                            <input
                              type="email"
                              disabled={activePermissions.settings === 'read' || sriLoading}
                              placeholder="facturas@restaurante.com"
                              value={smtpUser}
                              onChange={(e) => { setSmtpUser(e.target.value); if (!smtpFrom) setSmtpFrom(e.target.value); }}
                              className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                            />
                          </div>
                          <div className="space-y-1 text-xs">
                            <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Contraseña / App Password</label>
                            <input
                              type="password"
                              disabled={activePermissions.settings === 'read' || sriLoading}
                              placeholder="contraseña o app password de 16 dígitos"
                              value={smtpPass}
                              onChange={(e) => setSmtpPass(e.target.value)}
                              className="w-full bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-2.5 rounded-xl text-zinc-200 outline-none text-xs"
                            />
                          </div>
                        </div>
                        <div className="text-[10px] text-zinc-500">Para Gmail: activa verificación en 2 pasos → Cuenta Google → Seguridad → Contraseñas de aplicaciones → genera una de 16 dígitos.</div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1 text-xs" style={{display:'none'}}>
                          {/* sri_email_envio legacy — ya no se muestra */}
                          <input type="hidden" value={sriEmailEnvio} onChange={(e) => setSriEmailEnvio(e.target.value)} />
                        </div>
                        {sriFirmaRazon && (
                          <div className="space-y-1 text-xs">
                            <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Firmante / Razón Social Firma</label>
                            <input
                              type="text"
                              readOnly
                              value={sriFirmaRazon}
                              className="w-full bg-zinc-900/30 border border-zinc-850 p-2.5 rounded-xl text-zinc-500 outline-none select-all"
                            />
                          </div>
                        )}
                      </div>

                      {/* Visual Table showing stored signature details */}
                      <div className="mt-4 border border-zinc-900 rounded-xl overflow-hidden bg-zinc-950/20 max-w-2xl">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-zinc-900/60 border-b border-zinc-800 text-[10px] text-zinc-400">
                              <th className="p-2">Razón Social</th>
                              <th className="p-2">Expira</th>
                              <th className="p-2">Activa</th>
                              <th className="p-2">Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sriFirmas.map(firma => (
                              <tr key={firma.id} className="border-b border-zinc-800 hover:bg-zinc-900/30">
                                <td className="p-2">{firma.razon_social}</td>
                                <td className="p-2">{firma.expiracion ? new Date(firma.expiracion).toLocaleDateString() : '-'}</td>
                                <td className="p-2">{firma.esta_activa ? 'Sí' : 'No'}</td>
                                <td className="p-2 flex gap-2">
                                  <button onClick={() => handleActivateSignature(firma.id)} disabled={sriLoading || activePermissions.settings === 'read'} className="bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded">Activar</button>
                                  <button onClick={() => handleDeleteSignature(firma.id)} disabled={sriLoading || activePermissions.settings === 'read'} className="bg-rose-600 hover:bg-rose-500 text-white px-2 py-1 rounded">Eliminar</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-wrap gap-3">
                      <button
                        type="submit"
                        disabled={sriLoading || activePermissions.settings === 'read'}
                        className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-850 disabled:text-zinc-555 text-white font-semibold py-2.5 px-6 rounded-xl shadow-lg transition-all cursor-pointer text-xs w-full sm:w-auto"
                      >
                        {sriLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar Ajustes Facturación'}
                      </button>
                      <button
                        type="button"
                        onClick={handleTestSriConnection}
                        disabled={sriTesting || !sriP12B64 || !sriP12Pwd}
                        className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 border border-zinc-800 font-semibold py-2.5 px-6 rounded-xl transition-all cursor-pointer text-xs w-full sm:w-auto"
                      >
                        {sriTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" /> : 'Probar Firma y Conexión SRI'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* AI Assistant Settings */}
              <div className="bg-zinc-950/40 border border-zinc-900 p-6 rounded-2xl space-y-6 animate-in fade-in-50 duration-200 delay-100">
                <div className="border-b border-zinc-900 pb-4">
                  <h4 className="text-sm font-semibold text-zinc-200 font-bold">Personalidad de la Inteligencia Artificial</h4>
                  <p className="text-xs text-zinc-500">Define cómo debe hablar el asistente virtual en este restaurante (Prompt del Sistema).</p>
                </div>

                {aiMessage && (
                  <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                    aiMessage.type === 'success' ? 'bg-emerald-950/15 border border-emerald-900/30 text-emerald-400' : 'bg-rose-950/15 border border-rose-900/30 text-rose-455'
                  }`}>
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{aiMessage.text}</span>
                  </div>
                )}

                <form onSubmit={handleUpdateAiInstruction} className="space-y-4">
                  <div className="space-y-1">
                    <label className="font-bold text-zinc-400 uppercase tracking-wider text-[10px]">Instrucción del Sistema (Prompt)</label>
                    <textarea 
                      required
                      disabled={activePermissions.settings === 'read'}
                      value={aiSystemInstruction}
                      onChange={(e) => setAiSystemInstruction(e.target.value)}
                      placeholder="Ej: Eres Appy, un asistente amable para un restaurante de comida rápida..."
                      className="w-full h-48 bg-zinc-900/60 border border-zinc-850 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 p-3 rounded-xl text-zinc-200 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed resize-y text-sm font-mono"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Esta instrucción reemplazará el comportamiento por defecto de la IA. Usa variables como el menú y las órdenes se inyectan automáticamente.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={aiSystemInstructionLoading || activePermissions.settings === 'read'}
                    className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-850 disabled:text-zinc-555 text-white font-semibold py-2.5 px-4 rounded-xl shadow-lg transition-all cursor-pointer text-xs w-full sm:w-auto"
                  >
                    {aiSystemInstructionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar Prompt'}
                  </button>
                </form>
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
