import { z } from 'zod'

const zipRegex = /^\d{5}(-\d{4})?$/
const phoneRegex = /^\(\d{3}\) \d{3}-\d{4}$/

export const propertySchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  address: z.string().min(1, 'Address is required').max(300),
  city: z.string().min(1, 'City is required').max(100),
  state: z.string().min(2, 'State is required').max(2),
  zip: z.string().regex(zipRegex, 'Invalid ZIP code (e.g. 78701 or 78701-1234)'),
  propertyType: z.enum(['single_family', 'multi_family', 'condo', 'townhouse', 'apartment', 'commercial', 'other']).optional(),
  sqft: z.number().int().min(0).optional(),
  amenities: z.array(z.string()).optional(),
  purchasePrice: z.number().min(0).optional(),
  purchaseDate: z.string().optional(),
  insuranceProvider: z.string().max(200).optional(),
  insurancePolicyNumber: z.string().max(100).optional(),
  insuranceExpiry: z.string().optional(),
  notes: z.string().max(2000).optional(),
})

export const unitSchema = z.object({
  propertyId: z.string().min(1),
  name: z.string().min(1, 'Unit name is required').max(100),
  bedrooms: z.number().int().min(0, 'Must be 0 or more'),
  bathrooms: z.number().min(0, 'Must be 0 or more'),
  sqft: z.number().int().min(0).optional(),
  monthlyRent: z.number().min(0, 'Rent must be 0 or more'),
  deposit: z.number().min(0).optional(),
  available: z.boolean(),
  notes: z.string().max(2000).optional(),
})

export const tenantSchema = z.object({
  unitId: z.string().min(1),
  propertyId: z.string().min(1),
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Invalid email address').max(200).optional().or(z.literal('')),
  phone: z.string().regex(phoneRegex, 'Invalid phone (use (555) 123-4567 format)').optional().or(z.literal('')),
  leaseStart: z.string().min(1, 'Lease start date is required'),
  leaseEnd: z.string().min(1, 'Lease end date is required'),
  monthlyRent: z.number().min(0, 'Rent must be 0 or more'),
  deposit: z.number().min(0).optional(),
  gracePeriodDays: z.number().int().min(0).max(60).optional(),
  lateFeeAmount: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
}).refine(
  (data) => !data.leaseStart || !data.leaseEnd || data.leaseEnd >= data.leaseStart,
  { message: 'Lease end must be after lease start', path: ['leaseEnd'] }
)

export const expenseSchema = z.object({
  propertyId: z.string().min(1),
  unitId: z.string().optional(),
  category: z.enum(['mortgage', 'insurance', 'taxes', 'utilities', 'maintenance', 'repairs', 'management', 'legal', 'other']),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  date: z.string().min(1, 'Date is required'),
  description: z.string().min(1, 'Description is required').max(500),
  recurring: z.boolean().optional(),
  vendorId: z.string().optional(),
})

export const paymentSchema = z.object({
  tenantId: z.string().min(1),
  unitId: z.string().min(1),
  propertyId: z.string().min(1),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  date: z.string().min(1, 'Date is required'),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  method: z.enum(['check', 'transfer', 'cash', 'other']).optional(),
  notes: z.string().max(500).optional(),
  lateFee: z.number().min(0).optional(),
})

export const vendorSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  phone: z.string().regex(phoneRegex, 'Invalid phone format').optional().or(z.literal('')),
  email: z.string().email('Invalid email address').max(200).optional().or(z.literal('')),
  specialty: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
})

export const maintenanceSchema = z.object({
  propertyId: z.string().min(1),
  unitId: z.string().optional(),
  tenantId: z.string().optional(),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(2000),
  priority: z.enum(['low', 'medium', 'high', 'emergency']),
  status: z.enum(['open', 'in_progress', 'completed']),
  category: z.enum(['plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'pest', 'other']),
  vendorId: z.string().optional(),
  cost: z.number().min(0).optional(),
  scheduledDate: z.string().optional(),
  recurrence: z.enum(['none', 'monthly', 'quarterly', 'semi_annual', 'annual']).optional(),
  notes: z.string().max(2000).optional(),
})

export const communicationLogSchema = z.object({
  tenantId: z.string().min(1),
  propertyId: z.string().min(1),
  type: z.enum(['call', 'email', 'text', 'in_person', 'letter', 'other']),
  date: z.string().min(1, 'Date is required'),
  subject: z.string().min(1, 'Subject is required').max(200),
  notes: z.string().max(2000).optional(),
})

export const activityLogSchema = z.object({
  entityType: z.enum(['property', 'unit', 'tenant']),
  entityId: z.string().min(1),
  note: z.string().min(1, 'Note is required').max(2000),
  date: z.string().min(1, 'Date is required'),
})

const backupItemSchema = z.object({ id: z.string() }).passthrough()
const backupArraySchema = z.array(backupItemSchema).default([])

export const backupSchema = z.object({
  properties: backupArraySchema,
  units: backupArraySchema,
  tenants: backupArraySchema,
  expenses: backupArraySchema,
  payments: backupArraySchema,
  maintenanceRequests: backupArraySchema,
  activityLogs: backupArraySchema,
  vendors: backupArraySchema,
  communicationLogs: backupArraySchema,
  documents: backupArraySchema,
  emailTemplates: backupArraySchema,
})

export type ValidationErrors = Record<string, string>

export function extractErrors(error: z.ZodError): ValidationErrors {
  const errors: ValidationErrors = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (!errors[key]) errors[key] = issue.message
  }
  return errors
}
