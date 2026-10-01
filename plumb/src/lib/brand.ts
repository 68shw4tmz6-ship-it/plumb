/** Product name. The business name (shown on quotes, timesheets) comes from NEXT_PUBLIC_BUSINESS_NAME. */
export const APP_NAME = "Plumb";

export const BUSINESS_NAME = process.env.NEXT_PUBLIC_BUSINESS_NAME || APP_NAME;
