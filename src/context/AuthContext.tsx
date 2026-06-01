'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

export type UserRole = 'admin_general' | 'vendedor_cajero' | 'cocinero' | 'repartidor';

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

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  restaurantId: string | null;
  permissions: StaffPermissions | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string, role: UserRole) => Promise<{ error: any }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<StaffPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  // Ref to always have the current user ID inside async callbacks (avoids stale closures)
  const userRef = useRef<User | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);

  const fetchUserData = async (currentUser: User) => {
    try {
      // 1. Fetch profile
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

      if (profileErr) {
        console.error('Error fetching profile:', profileErr);
      } else {
        setProfile(profileData);
      }

      // 2. Fetch role, restaurant, and custom permissions
      const { data: staffData, error: staffErr } = await supabase
        .from('restaurant_staff')
        .select('role, restaurant_id, permissions')
        .eq('profile_id', currentUser.id)
        .limit(1);

      if (staffErr) {
        console.error('Error fetching staff info:', staffErr);
      } else if (staffData && staffData.length > 0) {
        const userRole = staffData[0].role as UserRole;
        setRole(userRole);
        setRestaurantId(staffData[0].restaurant_id);

        const customPermissions = staffData[0].permissions || {};
        const defaultPerms = getDefaultPermissions(userRole);

        setPermissions({
          orders: customPermissions.orders || defaultPerms.orders,
          customers: customPermissions.customers || defaultPerms.customers,
          menu: customPermissions.menu || defaultPerms.menu,
          simulator: customPermissions.simulator || defaultPerms.simulator,
          logs: customPermissions.logs || defaultPerms.logs,
          reports: customPermissions.reports || defaultPerms.reports,
          staff: customPermissions.staff || defaultPerms.staff,
          settings: customPermissions.settings || defaultPerms.settings
        });
      }
    } catch (e) {
      console.error('Error loading user data:', e);
    }
  };

  useEffect(() => {
    // Check active session on mount
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          await fetchUserData(session.user);
        }
      } catch (e) {
        console.error('Session retrieval error:', e);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Listen for auth state changes.
    // IMPORTANT: TOKEN_REFRESHED fires every time the browser regains focus
    // (Supabase refreshes tokens silently in the background).
    // We must NOT set loading=true for that event — it would show the full
    // splash screen every time the user switches back to this tab/window.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        // Silent token refresh — just update the user object, no loading flash
        if (session?.user) {
          setUser(session.user);
        }
        return;
      }

      if (event === 'SIGNED_IN') {
        // If it's the same user already loaded, refresh silently without loading screen.
        // SIGNED_IN can fire on focus recovery when the session is rehydrated.
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
        setPermissions(null);
        // No loading state needed — redirect to /login will handle UI
        return;
      }

      // Any other event (USER_UPDATED, PASSWORD_RECOVERY, etc.)
      // silently update the user without showing the loading screen
      if (session?.user) {
        setUser(session.user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
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
      // Fetch any restaurant
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

      // 3. Insert user into restaurant_staff with target role.
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
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, role, restaurantId, permissions, loading, login, signUp, logout }}>
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
