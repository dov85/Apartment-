
import React, { useEffect, useState } from 'react';
import { Property, PropertyStatus } from '../types.ts';
import { getImageObjectURL } from '../utils/idbImages';

interface PropertyCardProps {
  property: Property;
  onStatusChange: (id: string, status: PropertyStatus | 'DELETE') => void;
  onEdit?: (id: string) => void;
}

const PropertyCard: React.FC<PropertyCardProps> = ({ property, onStatusChange, onEdit }) => {
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
  const [resolvedMainImage, setResolvedMainImage] = useState<string | null>(null);

  // Gallery lightbox state
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [resolvedGalleryImages, setResolvedGalleryImages] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const resolve = async () => {
      const img = property.images && property.images.length > 0 ? property.images[0] : null;
      if (!img) { setResolvedMainImage(null); return; }
      if (typeof img === 'string' && img.startsWith('data:')) {
        if (active) setResolvedMainImage(img);
      } else if (typeof img === 'string') {
        const key = img.startsWith('idb://') ? img.replace('idb://', '') : img;
        try {
          const url = await getImageObjectURL(key);
          if (active) setResolvedMainImage(url);
        } catch (e) { console.error(e); if (active) setResolvedMainImage(null); }
      }
    };
    resolve();
    return () => { active = false; if (resolvedMainImage && resolvedMainImage.startsWith('blob:')) URL.revokeObjectURL(resolvedMainImage); };
  }, [property.images]);

  // Resolve all images when gallery opens
  useEffect(() => {
    if (!galleryOpen) return;
    let active = true;
    const resolveAll = async () => {
      const imgs = property.images || [];
      const urls: string[] = [];
      for (const img of imgs) {
        if (typeof img === 'string' && img.startsWith('data:')) {
          urls.push(img);
        } else if (typeof img === 'string') {
          const key = img.startsWith('idb://') ? img.replace('idb://', '') : img;
          try {
            const url = await getImageObjectURL(key);
            urls.push(url || '');
          } catch { urls.push(''); }
        }
      }
      if (active) setResolvedGalleryImages(urls.filter(Boolean));
    };
    resolveAll();
    return () => {
      active = false;
      // revoke blob URLs when gallery closes
      resolvedGalleryImages.forEach(u => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); });
    };
  }, [galleryOpen, property.images]);

  // Keyboard navigation in gallery
  useEffect(() => {
    if (!galleryOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGalleryOpen(false);
      if (e.key === 'ArrowLeft') setGalleryIndex(i => Math.min(i + 1, resolvedGalleryImages.length - 1));
      if (e.key === 'ArrowRight') setGalleryIndex(i => Math.max(i - 1, 0));
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [galleryOpen, resolvedGalleryImages.length]);

  const openGallery = () => {
    if (!property.images || property.images.length === 0) return;
    setGalleryIndex(0);
    setGalleryOpen(true);
  };

  return (
    <>
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-xl transition-all group flex flex-col h-full">
      <div className="relative h-64 bg-slate-100 shrink-0 cursor-pointer" onClick={openGallery}>
        {resolvedMainImage ? (
          <img 
            src={resolvedMainImage} 
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

        <div className="absolute top-4 right-4 flex items-center gap-2">
          {property.rating != null && property.rating > 0 && (
            <span className="px-3 py-2 rounded-2xl text-xs font-black shadow-lg backdrop-blur-md bg-yellow-400/90 text-yellow-900 flex items-center gap-1">
              <span className="text-sm">★</span> {property.rating}/10
            </span>
          )}
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
            {((property.street || '') + (property.city ? (', ' + property.city) : '')) || 'לא צויינה כתובת'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">מחיר</span>
            <span className="text-xl font-black text-indigo-600">₪{property.price?.toLocaleString() || '0'}</span>
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
            <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">חדרים</span>
            <span className="text-xl font-black text-slate-800">{property.rooms || '-'}</span>
          </div>
        </div>

        {/* Floor / Elevator / Balcony row */}
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs font-bold">
          {property.floor != null && (
            <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg">🏢 קומה {property.floor}</span>
          )}
          {property.hasElevator && (
            <span className="bg-green-50 text-green-700 px-2.5 py-1 rounded-lg">🛗 מעלית</span>
          )}
          {property.hasBalcony && (
            <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg">🏞️ מרפסת</span>
          )}
        </div>

        {/* Rating stars */}
        {property.rating != null && property.rating > 0 && (
          <div className="flex items-center gap-1 mb-4" dir="ltr">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(star => (
              <span key={star} className={`text-sm ${star <= (property.rating || 0) ? 'text-yellow-400' : 'text-slate-200'}`}>★</span>
            ))}
            <span className="text-xs font-black text-slate-500 mr-1">{property.rating}/10</span>
          </div>
        )}

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
               onClick={() => onEdit && onEdit(property.id)}
               className="p-3 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-xl transition-colors"
               title="ערוך"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" />
              </svg>
            </button>
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

    {/* Full-screen image gallery lightbox */}
    {galleryOpen && resolvedGalleryImages.length > 0 && (
      <div
        className="fixed inset-0 bg-black/95 z-[100] flex flex-col items-center justify-center"
        onClick={() => setGalleryOpen(false)}
      >
        {/* Close button */}
        <button
          className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition-colors z-10"
          onClick={(e) => { e.stopPropagation(); setGalleryOpen(false); }}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Counter */}
        <div className="absolute top-5 left-1/2 -translate-x-1/2 text-white/70 text-sm font-bold">
          {galleryIndex + 1} / {resolvedGalleryImages.length}
        </div>

        {/* Main image */}
        <div className="flex-1 flex items-center justify-center w-full px-16" onClick={(e) => e.stopPropagation()}>
          <img
            src={resolvedGalleryImages[galleryIndex]}
            alt={`${property.title} - ${galleryIndex + 1}`}
            className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl select-none"
            draggable={false}
          />
        </div>

        {/* Prev button */}
        {galleryIndex > 0 && (
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/25 text-white p-3 rounded-full transition-colors"
            onClick={(e) => { e.stopPropagation(); setGalleryIndex(i => i - 1); }}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Next button */}
        {galleryIndex < resolvedGalleryImages.length - 1 && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/25 text-white p-3 rounded-full transition-colors"
            onClick={(e) => { e.stopPropagation(); setGalleryIndex(i => i + 1); }}
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Thumbnail strip */}
        {resolvedGalleryImages.length > 1 && (
          <div className="flex gap-2 py-4 px-4 overflow-x-auto max-w-full" onClick={(e) => e.stopPropagation()}>
            {resolvedGalleryImages.map((url, i) => (
              <button
                key={i}
                onClick={() => setGalleryIndex(i)}
                className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                  i === galleryIndex ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-80'
                }`}
              >
                <img src={url} className="w-full h-full object-cover" alt="" />
              </button>
            ))}
          </div>
        )}
      </div>
    )}
    </>
  );
};

export default PropertyCard;
