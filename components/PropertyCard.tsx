
import React from 'react';
import { Property, PropertyStatus } from '../types.ts';

interface PropertyCardProps {
  property: Property;
  onStatusChange: (id: string, status: PropertyStatus | 'DELETE') => void;
}

const PropertyCard: React.FC<PropertyCardProps> = ({ property, onStatusChange }) => {
  const getStatusColor = (status: PropertyStatus) => {
    switch (status) {
      case PropertyStatus.NEW: return 'bg-blue-100 text-blue-800';
      case PropertyStatus.FAVORITE: return 'bg-yellow-100 text-yellow-800';
      case PropertyStatus.REJECTED: return 'bg-gray-100 text-gray-500';
      case PropertyStatus.VISITED: return 'bg-green-100 text-green-800';
      default: return 'bg-indigo-100 text-indigo-800';
    }
  };

  const mainImage = property.images && property.images.length > 0 ? property.images[0] : null;

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-xl transition-all group flex flex-col h-full">
      <div className="relative h-64 bg-slate-100 shrink-0">
        {mainImage ? (
          <img 
            src={mainImage} 
            alt={property.title} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-300">
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        
        {property.images && property.images.length > 1 && (
          <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-lg">
            +{property.images.length - 1} תמונות נוספות
          </div>
        )}

        <div className="absolute top-4 right-4">
          <span className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg backdrop-blur-md ${getStatusColor(property.status)}`}>
            {property.status}
          </span>
        </div>
      </div>
      
      <div className="p-6 flex flex-col flex-1">
        <div className="mb-4">
          <h3 className="font-black text-2xl text-slate-800 truncate mb-1">
            {property.title || 'ללא כותרת'}
          </h3>
          <p className="text-slate-500 text-sm font-bold flex items-center">
            <svg className="w-4 h-4 ml-1 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
            {property.address || 'לא צויינה כתובת'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">מחיר</span>
            <span className="text-xl font-black text-indigo-600">₪{property.price?.toLocaleString() || '0'}</span>
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
            <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">חדרים</span>
            <span className="text-xl font-black text-slate-800">{property.rooms || '-'}</span>
          </div>
        </div>

        <div className="space-y-3 mt-auto">
          <div className="flex gap-2">
            {property.link && (
              <a 
                href={property.link.startsWith('http') ? property.link : `https://${property.link}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex-1 bg-slate-900 text-white text-center py-3 rounded-xl font-black text-sm hover:bg-black transition-all"
              >
                קישור למודעה
              </a>
            )}
            {property.phone && (
              <a 
                href={`tel:${property.phone}`}
                className="flex-1 bg-indigo-50 text-indigo-600 text-center py-3 rounded-xl font-black text-sm hover:bg-indigo-100 transition-all"
              >
                חיוג {property.phone}
              </a>
            )}
          </div>

          <div className="flex gap-2">
            <select 
              className="flex-1 bg-white border-2 border-slate-100 text-slate-700 text-sm font-bold rounded-xl p-3 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              value={property.status}
              onChange={(e) => onStatusChange(property.id, e.target.value as PropertyStatus)}
            >
              {Object.values(PropertyStatus).map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <button 
               onClick={() => { if(confirm('למחוק את המודעה?')) onStatusChange(property.id, 'DELETE') }}
               className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertyCard;
