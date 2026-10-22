export const ErrorCodes = {
  // Auth
  AUTH_001: 'Invalid credentials',
  AUTH_002: 'Token expired',
  AUTH_003: 'Token revoked',
  AUTH_004: 'Insufficient permissions',
  ACCOUNT_LOCKED: 'Account locked — reset your password to recover',
  PASSWORD_REUSED: 'Cannot reuse a recent password',
  ORGANIZATION_INACTIVE: 'Organization is deactivated',
  PROVIDER_NO_ACCOUNT: 'No account for this social identity — an invitation is required',
  PROVIDER_ALREADY_LINKED: 'This social identity is already linked to another account',
  LAST_LOGIN_METHOD: 'Cannot remove your only login method',

  // Stock
  STOCK_001: 'Insufficient stock',
  STOCK_002: 'Reservation failed',
  STOCK_003: 'Concurrent modification',
  STOCK_004: 'Invalid byproduct for produced recipe',

  // Email
  EMAIL_SEND_FAILED: 'Email could not be sent (SMTP/provider error)',

  // Sales deductions (scădere stoc din vânzări)
  SALES_001: 'Sold quantity exceeds stock — confirm clamping to 0 or override the stock',
  SALES_002: 'Sales deduction already confirmed or cancelled',

  // Task
  TASK_001: 'Invalid state transition',
  TASK_002: 'Task already assigned',
  TASK_003: 'Cannot cancel completed task',
  TASK_BLOCKED_INSUFFICIENT_STOCK: 'Cannot start task — insufficient stock (task moved to BLOCAT)',

  // Recipe
  RECIPE_001: 'Circular dependency detected',
  RECIPE_002: 'Max recursion depth exceeded',
  RECIPE_003: 'Invalid ingredient reference',
} as const;

export type ErrorCode = keyof typeof ErrorCodes;
