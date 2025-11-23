/**
 * User and authentication types for CompareIntel
 * 
 * These types define the structure of users, authentication credentials,
 * and user-related data throughout the application.
 */

import type { SubscriptionTier, SubscriptionStatus, SubscriptionPeriod, UserRole } from './config';
import type { UserId } from './branded';

/**
 * User entity representing a registered user
 */
export interface User {
  /** Unique user identifier */
  id: UserId;
  /** User's email address */
  email: string;
  /** Whether the user's email is verified */
  is_verified: boolean;
  /** Whether the user account is active */
  is_active: boolean;
  /** User's role in the system */
  role: UserRole;
  /** Whether the user has admin privileges */
  is_admin: boolean;
  /** User's subscription tier */
  subscription_tier: SubscriptionTier;
  /** Status of the subscription */
  subscription_status: SubscriptionStatus;
  /** Billing period (monthly or yearly) */
  subscription_period: SubscriptionPeriod;
  /** Extended tier usage count */
  daily_extended_usage: number;
  /** MODEL-BASED: counts overage model responses (legacy) */
  monthly_overage_count: number;
  /** CREDITS-BASED: Credits allocated for current billing period */
  monthly_credits_allocated?: number;
  /** CREDITS-BASED: Credits used in current billing period */
  credits_used_this_period?: number;
  /** CREDITS-BASED: Total credits used (lifetime) */
  total_credits_used?: number;
  /** CREDITS-BASED: When credits reset (ISO timestamp) */
  credits_reset_at?: string;
  /** CREDITS-BASED: Billing period start (ISO timestamp, for paid tiers) */
  billing_period_start?: string;
  /** CREDITS-BASED: Billing period end (ISO timestamp, for paid tiers) */
  billing_period_end?: string;
  /** Testing feature - use mock responses instead of API calls (admin only) */
  mock_mode_enabled: boolean;
  /** ISO timestamp when the user account was created */
  created_at: string;
}

/**
 * Login credentials
 */
export interface LoginCredentials {
  /** User's email address */
  email: string;
  /** User's password */
  password: string;
}

/**
 * Registration data
 */
export interface RegisterData {
  /** User's email address */
  email: string;
  /** User's password */
  password: string;
  /** Optional password confirmation */
  confirm_password?: string;
  /** reCAPTCHA v3 token */
  recaptcha_token?: string;
}

/**
 * Authentication tokens
 */
export interface AuthTokens {
  /** Access token for API authentication */
  access_token: string;
  /** Refresh token for obtaining new access tokens */
  refresh_token: string;
  /** Token type (typically 'bearer') */
  token_type: string;
}

/**
 * Authentication response from API
 */
export interface AuthResponse {
  /** Access token for API authentication */
  access_token: string;
  /** Refresh token for obtaining new access tokens */
  refresh_token: string;
  /** Token type (typically 'bearer') */
  token_type: string;
  /** User information */
  user: User;
}

/**
 * Authentication context type (for React context)
 */
export interface AuthContextType {
  /** Current user, or null if not authenticated */
  user: User | null;
  /** Whether the user is currently authenticated */
  isAuthenticated: boolean;
  /** Whether authentication state is being loaded */
  isLoading: boolean;
  /** Function to log in a user */
  login: (credentials: LoginCredentials) => Promise<void>;
  /** Function to register a new user */
  register: (data: RegisterData) => Promise<void>;
  /** Function to log out the current user */
  logout: () => void;
  /** Function to refresh the access token */
  refreshToken: () => Promise<void>;
  /** Function to update user data in context */
  updateUser: (user: User) => void;
  /** Function to refresh user data from API */
  refreshUser: () => Promise<void>;
}

/**
 * Usage statistics for a user
 */
export interface UsageStats {
  /** MODEL-BASED: number of model responses used today (legacy) */
  daily_usage: number;
  /** MODEL-BASED: total model responses allowed per day (legacy) */
  daily_limit: number;
  /** MODEL-BASED: remaining model responses (legacy) */
  remaining_usage: number;
  /** CREDITS-BASED: Credits allocated for current period */
  credits_allocated?: number;
  /** CREDITS-BASED: Credits used this period */
  credits_used_this_period?: number;
  /** CREDITS-BASED: Credits remaining */
  credits_remaining?: number;
  /** CREDITS-BASED: When credits reset (ISO timestamp) */
  credits_reset_date?: string;
  /** User's subscription tier */
  subscription_tier: string;
  /** Max models per comparison (uniform 9 for all tiers) */
  model_limit: number;
  /** Whether overage is allowed */
  overage_allowed: boolean;
  /** Price per additional model response (TBD) */
  overage_price: number | null;
  /** MODEL-BASED: overage model responses this month (legacy) */
  monthly_overage_count: number;
  /** ISO timestamp when usage resets */
  reset_time: string;
}

