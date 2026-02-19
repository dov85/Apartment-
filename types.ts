
export enum PropertyStatus {
  NEW = 'חדש',
  CALLED = 'בוצעה שיחה',
  VIEWING_SCHEDULED = 'נקבע סיור',
  VISITED = 'ביקרתי',
  REJECTED = 'לא רלוונטי',
  FAVORITE = 'מועדף ⭐'
}

export interface Property {
  id: string;
  title: string;
  street: string;
  city: string;
  lat?: number;
  lon?: number;
  price: number;
  phone: string;
  rooms: string;
  floor?: number;
  hasElevator?: boolean;
  hasBalcony?: boolean;
  hasParking?: boolean;
  hasBrokerFee?: boolean;
  rating?: number;       // 1-10 דירוג דובי
  ratingRotem?: number;  // 1-10 דירוג רותם
  notes?: string;
  entryDate?: string;     // month+year string e.g. '2026-03' (year-month)
  reminderDate?: string;  // ISO date string e.g. '2026-02-20'
  reminderText?: string;  // reminder note e.g. 'לדבר עם בעל הדירה'
  images: string[];
  link: string;
  status: PropertyStatus;
  createdAt: number;
}
