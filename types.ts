
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
  address: string;
  price: number;
  phone: string;
  rooms: string;
  images: string[]; // Changed from 'image' to 'images' array
  link: string;
  status: PropertyStatus;
  createdAt: number;
}
