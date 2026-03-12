"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "groupware-profile-overrides";

export type ProfilePersonalOverride = Partial<{
  phone: string;
  email: string;
  address: string;
}>;

/** 고용정보 수정 시 저장 (C레벨 전용) */
export type ProfileEmploymentOverride = Partial<{
  type: string;
  joinDate: string;
  probationStart: string;
  probationEnd: string;
  tenure: string;
  status: string;
  contractStart: string;
  contractEnd: string;
}>;

/** 급여정보 수정 시 저장 (C레벨 전용) */
export type ProfilePayrollOverride = Partial<{
  salaryAccount: string;
  salaryType: string;
}>;

export type ProfileOverrideEntry = {
  personal?: ProfilePersonalOverride;
  employment?: ProfileEmploymentOverride;
  payroll?: ProfilePayrollOverride;
};

type OverridesState = Record<string, ProfileOverrideEntry>;

function loadOverrides(): OverridesState {
  if (typeof window === "undefined") return {};
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const parsed = JSON.parse(s) as OverridesState;
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    }
  } catch {}
  return {};
}

interface ProfileOverridesContextType {
  overrides: OverridesState;
  setOverride: (userId: string, data: ProfilePersonalOverride) => void;
  setEmploymentPayrollOverride: (
    userId: string,
    data: { employment?: ProfileEmploymentOverride; payroll?: ProfilePayrollOverride }
  ) => void;
  getOverride: (userId: string) => ProfileOverrideEntry | undefined;
}

const ProfileOverridesContext = createContext<ProfileOverridesContextType | undefined>(undefined);

export function ProfileOverridesProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<OverridesState>(loadOverrides);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch {}
  }, [overrides]);

  const setOverride = useCallback((userId: string, data: ProfilePersonalOverride) => {
    setOverrides((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        personal: { ...prev[userId]?.personal, ...data },
      },
    }));
  }, []);

  const setEmploymentPayrollOverride = useCallback(
    (
      userId: string,
      data: { employment?: ProfileEmploymentOverride; payroll?: ProfilePayrollOverride }
    ) => {
      setOverrides((prev) => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          ...(data.employment != null && { employment: { ...prev[userId]?.employment, ...data.employment } }),
          ...(data.payroll != null && { payroll: { ...prev[userId]?.payroll, ...data.payroll } }),
        },
      }));
    },
    []
  );

  const getOverride = useCallback(
    (userId: string) => overrides[userId],
    [overrides]
  );

  return (
    <ProfileOverridesContext.Provider
      value={{ overrides, setOverride, setEmploymentPayrollOverride, getOverride }}
    >
      {children}
    </ProfileOverridesContext.Provider>
  );
}

export function useProfileOverrides() {
  const context = useContext(ProfileOverridesContext);
  if (context === undefined) {
    return {
      overrides: {} as OverridesState,
      setOverride: () => {},
      setEmploymentPayrollOverride: () => {},
      getOverride: () => undefined as ProfileOverrideEntry | undefined,
    };
  }
  return context;
}

export function mergeProfileWithOverrides<T extends {
  personal: Record<string, unknown>;
  employment?: Record<string, unknown>;
  payroll?: Record<string, unknown>;
}>(
  profile: T,
  override?: ProfileOverrideEntry
): T {
  if (!override || Object.keys(override).length === 0) return profile;
  const next = { ...profile };
  if (override.personal && Object.keys(override.personal).length > 0) {
    next.personal = { ...profile.personal, ...override.personal } as T["personal"];
  }
  if (override.employment && Object.keys(override.employment).length > 0 && "employment" in profile) {
    next.employment = { ...profile.employment, ...override.employment } as T["employment"];
  }
  if (override.payroll && Object.keys(override.payroll).length > 0 && "payroll" in profile) {
    next.payroll = { ...profile.payroll, ...override.payroll } as T["payroll"];
  }
  return next;
}
