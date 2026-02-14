export type Id = string;

export type PropertyType =
  | 'single_family'
  | 'multi_family'
  | 'condo'
  | 'townhouse'
  | 'apartment'
  | 'commercial'
  | 'other';

export interface Property {
  id: Id;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  propertyType?: PropertyType;
  sqft?: number;
  amenities?: string[];
  purchasePrice?: number;
  purchaseDate?: string;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceExpiry?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Unit {
  id: Id;
  propertyId: Id;
  name: string; // e.g. "Unit 1", "Apt 2B"
  bedrooms: number;
  bathrooms: number;
  sqft?: number;
  monthlyRent: number;
  deposit?: number;
  available: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RentChange {
  date: string;
  oldRent: number;
  newRent: number;
}

export interface Tenant {
  id: Id;
  unitId: Id;
  propertyId: Id;
  name: string;
  email?: string;
  phone?: string;
  leaseStart: string;
  leaseEnd: string;
  monthlyRent: number;
  deposit?: number;
  depositReturned?: number;
  depositDeductions?: string;
  gracePeriodDays?: number;
  lateFeeAmount?: number;
  moveInDate?: string;
  moveOutDate?: string;
  moveInNotes?: string;
  moveOutNotes?: string;
  notes?: string;
  rentHistory?: RentChange[];
  createdAt: string;
  updatedAt: string;
}

export type ExpenseCategory =
  | 'mortgage'
  | 'insurance'
  | 'taxes'
  | 'utilities'
  | 'maintenance'
  | 'repairs'
  | 'management'
  | 'legal'
  | 'other';

export interface Expense {
  id: Id;
  propertyId: Id;
  unitId?: Id;
  category: ExpenseCategory;
  amount: number;
  date: string;
  description: string;
  recurring?: boolean;
  vendorId?: Id;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: Id;
  tenantId: Id;
  unitId: Id;
  propertyId: Id;
  amount: number;
  date: string;
  periodStart: string;
  periodEnd: string;
  method?: 'check' | 'transfer' | 'cash' | 'other';
  notes?: string;
  lateFee?: number;
  createdAt: string;
  updatedAt: string;
}

// Maintenance
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'emergency';
export type MaintenanceStatus = 'open' | 'in_progress' | 'completed';
export type MaintenanceCategory = 'plumbing' | 'electrical' | 'hvac' | 'appliance' | 'structural' | 'pest' | 'other';

export type MaintenanceRecurrence = 'none' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual';

export interface MaintenanceRequest {
  id: Id;
  propertyId: Id;
  unitId?: Id;
  tenantId?: Id;
  title: string;
  description: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  category: MaintenanceCategory;
  vendorId?: Id;
  cost?: number;
  scheduledDate?: string;
  recurrence?: MaintenanceRecurrence;
  resolvedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Activity / Notes log
export type ActivityEntityType = 'property' | 'unit' | 'tenant';

export interface ActivityLog {
  id: Id;
  entityType: ActivityEntityType;
  entityId: Id;
  note: string;
  date: string;
  createdAt: string;
}

// Communication log
export type CommunicationType = 'call' | 'email' | 'text' | 'in_person' | 'letter' | 'other';

export interface CommunicationLog {
  id: Id;
  tenantId: Id;
  propertyId: Id;
  type: CommunicationType;
  date: string;
  subject: string;
  notes?: string;
  createdAt: string;
}

// Vendor / contractor
export interface Vendor {
  id: Id;
  name: string;
  phone?: string;
  email?: string;
  specialty?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Computed / display types
export interface PropertySummary {
  property: Property;
  unitCount: number;
  occupiedUnits: number;
  totalMonthlyRent: number;
  collectedThisMonth: number;
  expensesThisMonth: number;
  netThisMonth: number;
  occupancyRate: number;
}

export interface DashboardStats {
  totalProperties: number;
  totalUnits: number;
  occupiedUnits: number;
  occupancyRate: number;
  expectedMonthlyRent: number;
  collectedThisMonth: number;
  expensesThisMonth: number;
  netCashFlow: number;
  ytdIncome: number;
  ytdExpenses: number;
}
