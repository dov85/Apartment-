
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
  rating?: number;  // 1-10
  notes?: string;
  images: string[];
  link: string;
  status: PropertyStatus;
  createdAt: number;
}
