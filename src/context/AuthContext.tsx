'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  is_super_admin?: boolean;
}

export type UserRole = 'admin_general' | 'vendedor_cajero' | 'cocinero' | 'repartidor' | 'camarero';

export interface StaffPermissions {
  orders: 'write' | 'read' | 'none';
  customers: 'write' | 'read' | 'none';
  menu: 'write' | 'read' | 'none';
  simulator: 'write' | 'read' | 'none';
  logs: 'write' | 'read' | 'none';
  reports: 'write' | 'read' | 'none';
  staff: 'write' | 'read' | 'none';
  settings: 'write' | 'read' | 'none';
}

export const getDefaultPermissions = (role: UserRole | null): StaffPermissions => {
  const defaults: Record<UserRole, StaffPermissions> = {
    admin_general: {
      orders: 'write',
      customers: 'write',
      menu: 'write',
      simulator: 'write',
      logs: 'write',
      reports: 'write',
      staff: 'write',
      settings: 'write'
    },
    vendedor_cajero: {
      orders: 'write',
      customers: 'write',
      menu: 'read',
      simulator: 'write',
      logs: 'none',
      reports: 'none',
      staff: 'none',
      settings: 'read'
    },
    cocinero: {
      orders: 'write',
      customers: 'none',
      menu: 'read',
      simulator: 'none',
      logs: 'none',
      reports: 'none',
      staff: 'none',
      settings: 'read'
    },
    repartidor: {
      orders: 'write',
      customers: 'none',
      menu: 'none',
      simulator: 'none',
      logs: 'none',
      reports: 'none',
      staff: 'none',
      settings: 'read'
    },
    camarero: {
      orders: 'write',
      customers: 'read',
      menu: 'read',
      simulator: 'none',
      logs: 'none',
      reports: 'none',
      staff: 'none',
      settings: 'read'
    }
  };

  return role && defaults[role] ? defaults[role] : {
    orders: 'none',
    customers: 'none',
    menu: 'none',
    simulator: 'none',
    logs: 'none',
    reports: 'none',
    staff: 'none',
    settings: 'none'
  };
};

// Maps a restaurant_id to the user's role and permissions in that restaurant
export interface RestaurantAccess {
  restaurantId: string;
  role: UserRole;
  permissions: StaffPermissions;
  branchId?: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  restaurantId: string | null;           // Active restaurant ID
  restaurantAccess: RestaurantAccess[];  // All restaurants this user can access
  activeRestaurantId: string | null;     // Currently selected restaurant
  setActiveRestaurantId: (id: string) => void;
  isSuperAdmin: boolean;
  permissions: StaffPermissions | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string, role: UserRole) => Promise<{ error: any }>;
  logout: () => Promise<void>;
  branchId: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACTIVE_RESTAURANT_KEY = 'activeRestaurantId';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantAccess, setRestaurantAccess] = useState<RestaurantAccess[]>([]);
  const [activeRestaurantId, setActiveRestaurantIdState] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [permissions, setPermissions] = useState<StaffPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchId, setBranchId] = useState<string | null>(null);

  const [sessionChecked, setSessionChecked] = useState(false);

  // Refs to always have current values inside async callbacks (avoids stale closures)
  const userRef = useRef<User | null>(null);
  const roleRef = useRef<UserRole | null>(null);
  const fetchUserDataPromiseRef = useRef<Promise<void> | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { roleRef.current = role; }, [role]);

  // Public setter: persists to localStorage so selection survives page refresh
  const setActiveRestaurantId = (id: string) => {
    setActiveRestaurantIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_RESTAURANT_KEY, id);
    }
    // Update role and permissions to match the newly selected restaurant
    const access = restaurantAccess.find(a => a.restaurantId === id);
    if (access) {
      setRole(access.role);
      setPermissions(access.permissions);
      setRestaurantId(id);
      setBranchId(access.branchId || null);
    }
  };

  const fetchUserData = async (currentUser: User) => {
    if (fetchUserDataPromiseRef.current) {
      console.log('fetchUserData already in progress, returning active promise');
      return fetchUserDataPromiseRef.current;
    }

    const promise = (async () => {
      let timeoutId: NodeJS.Timeout | undefined;
      try {
        // Fetch ALL restaurants this user has access to (no limit)
        const fetchPromise = Promise.all([
          supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single(),
          supabase
            .from('restaurant_staff')
            .select('role, restaurant_id, permissions, branch_id')
            .eq('profile_id', currentUser.id)
            // No .limit(1) — fetch ALL restaurants for this user
        ]);

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Timeout fetching user data')), 10000);
        });

        const [profileResponse, staffResponse] = await Promise.race([
          fetchPromise,
          timeoutPromise
        ]);

        const { data: profileData, error: profileErr } = profileResponse;
        const { data: staffData, error: staffErr } = staffResponse;

        if (profileErr) {
          console.error('Error fetching profile:', profileErr);
        } else {
          setProfile(profileData);
          const superAdmin = profileData?.is_super_admin || false;
          setIsSuperAdmin(superAdmin);
        }

        if (staffErr) {
          console.error('Error fetching staff info:', staffErr);
        } else {
          const superAdmin = profileData?.is_super_admin || false;
          let effectiveStaffData = staffData || [];

          // If super admin and no explicit staff assignments, grant access to the first available restaurant
          if (superAdmin && effectiveStaffData.length === 0) {
            const { data: allRest } = await supabase.from('restaurants').select('id').limit(1);
            if (allRest && allRest.length > 0) {
              effectiveStaffData = [{
                restaurant_id: allRest[0].id,
                role: 'admin_general',
                permissions: null,
                branch_id: null
              }];
            }
          }

          if (effectiveStaffData && effectiveStaffData.length > 0) {
            // Build the full access map for all restaurants
            const allAccess: RestaurantAccess[] = effectiveStaffData.map((s: any) => {
              const userRole = s.role as UserRole;
              const customPermissions = s.permissions || {};
              const defaultPerms = getDefaultPermissions(userRole);
              return {
                restaurantId: s.restaurant_id,
                role: userRole,
                permissions: {
                  orders: customPermissions.orders || defaultPerms.orders,
                  customers: customPermissions.customers || defaultPerms.customers,
                  menu: customPermissions.menu || defaultPerms.menu,
                  simulator: customPermissions.simulator || defaultPerms.simulator,
                  logs: customPermissions.logs || defaultPerms.logs,
                  reports: customPermissions.reports || defaultPerms.reports,
                  staff: customPermissions.staff || defaultPerms.staff,
                  settings: customPermissions.settings || defaultPerms.settings
                },
                branchId: s.branch_id || null
              };
            });

            setRestaurantAccess(allAccess);

            // Determine which restaurant to activate:
            // 1. Use persisted selection from localStorage if still valid
            // 2. Otherwise use the first one
            let savedId: string | null = null;
            if (typeof window !== 'undefined') {
              savedId = localStorage.getItem(ACTIVE_RESTAURANT_KEY);
            }

            const validSaved = savedId && allAccess.find(a => a.restaurantId === savedId);
            const activeAccess = validSaved
              ? allAccess.find(a => a.restaurantId === savedId)!
              : allAccess[0];

            setActiveRestaurantIdState(activeAccess.restaurantId);
            setRestaurantId(activeAccess.restaurantId);
            setRole(activeAccess.role);
            setPermissions(activeAccess.permissions);
            setBranchId(activeAccess.branchId || null);

            // Persist the active selection
            if (typeof window !== 'undefined') {
              localStorage.setItem(ACTIVE_RESTAURANT_KEY, activeAccess.restaurantId);
            }
          }
        }
      } catch (e) {
        console.error('Error loading user data:', e);
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        fetchUserDataPromiseRef.current = null;
      }
    })();

    fetchUserDataPromiseRef.current = promise;
    return promise;
  };

  // useEffect 1: Runs once on mount to check initial session sequentially
  useEffect(() => {
    // Safety fallback: force loading to false after 10 seconds no matter what
    const safetyTimer = setTimeout(() => {
      setLoading(false);
      setSessionChecked(true);
    }, 10000);

    const checkSession = async () => {
      let timeoutId: NodeJS.Timeout | undefined;
      try {
        const fetchSessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Session timeout')), 8000);
        });
        
        const { data: { session } } = await Promise.race([fetchSessionPromise, timeoutPromise]) as any;
        
        if (session?.user) {
          setUser(session.user);
          await fetchUserData(session.user);
        }
      } catch (e) {
        console.error('Session retrieval error:', e);
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        setLoading(false);
        clearTimeout(safetyTimer);
        setSessionChecked(true);
      }
    };

    checkSession();
  }, []);

  // useEffect 2: Registers auth state change listener only after checkSession is done
  useEffect(() => {
    if (!sessionChecked) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          setUser(session.user);
          if (!roleRef.current) {
            await fetchUserData(session.user);
          }
        }
        return;
      }

      if (event === 'SIGNED_IN') {
        const isSameUser = session?.user?.id === userRef.current?.id;
        if (!isSameUser) {
          setLoading(true);
        }
        if (session?.user) {
          setUser(session.user);
          await fetchUserData(session.user);
        }
        if (!isSameUser) {
          setLoading(false);
        }
        return;
      }

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setRole(null);
        setRestaurantId(null);
        setRestaurantAccess([]);
        setActiveRestaurantIdState(null);
        setIsSuperAdmin(false);
        setPermissions(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem(ACTIVE_RESTAURANT_KEY);
        }
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        if (session?.user) {
          setUser(session.user);
        }
        window.location.href = '/update-password';
        return;
      }

      if (session?.user) {
        setUser(session.user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [sessionChecked]);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string, targetRole: UserRole) => {
    try {
      // 1. Sign up user
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) return { error };
      if (!data.user) return { error: new Error('Registration failed') };

      // 2. Link to default restaurant (or first restaurant found)
      const { data: restaurants } = await supabase.from('restaurants').select('id').limit(1);
      let restId = restaurants?.[0]?.id;

      if (!restId) {
        // Fallback: create restaurant if none exists
        const { data: newRest, error: restErr } = await supabase
          .from('restaurants')
          .insert({
            name: 'Restaurante Sabor Latino',
            slug: 'sabor-latino',
            address: 'Av. de la República N32-123 y Eloy Alfaro',
            phone: '+593987654321',
            email: 'sabor@latino.com',
          })
          .select('id')
          .single();

        if (restErr) throw restErr;
        restId = newRest.id;
      }

      // 3. Insert user into restaurant_staff with target role
      const { error: staffErr } = await supabase.from('restaurant_staff').insert({
        restaurant_id: restId,
        profile_id: data.user.id,
        role: targetRole,
      });

      if (staffErr) {
        console.error('Error inserting staff role:', staffErr);
        return { error: staffErr };
      }

      return { error: null };
    } catch (err: any) {
      console.error('Error during sign up process:', err);
      return { error: err };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Supabase signOut failed:', err);
    } finally {
      setUser(null);
      setProfile(null);
      setRole(null);
      setRestaurantId(null);
      setRestaurantAccess([]);
      setActiveRestaurantIdState(null);
      setIsSuperAdmin(false);
      setPermissions(null);
      setBranchId(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(ACTIVE_RESTAURANT_KEY);
        window.location.href = '/login';
      }
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      role,
      restaurantId,
      restaurantAccess,
      activeRestaurantId,
      setActiveRestaurantId,
      isSuperAdmin,
      permissions,
      loading,
      login,
      signUp,
      logout,
      branchId
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
