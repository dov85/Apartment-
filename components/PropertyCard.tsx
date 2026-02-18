
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Property, PropertyStatus } from '../types.ts';
import { getImageObjectURL } from '../utils/idbImages';

interface PropertyCardProps {
  property: Property;
  onStatusChange: (id: string, status: PropertyStatus | 'DELETE') => void;
  onEdit?: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<Property>) => void;
}

/** Build a display title: user title → street+city → fallback */
function displayTitle(p: Property): string {
  if (p.title && p.title !== 'דירה חדשה') return p.title;
  const parts = [p.street, p.city].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'ללא כותרת';
}

const PropertyCard: React.FC<PropertyCardProps> = ({ property, onStatusChange, onEdit, onUpdate }) => {
  const [showNotes, setShowNotes] = useState(false);
  const [localNotes, setLocalNotes] = useState(property.notes || '');
  const [expanded, setExpanded] = useState(false);
  const notesTimer = React.useRef<any>(null);

  // Sync local notes when property changes externally
  useEffect(() => { setLocalNotes(property.notes || ''); }, [property.notes]);

  const handleNotesChange = (val: string) => {
    setLocalNotes(val);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      onUpdate && onUpdate(property.id, { notes: val });
    }, 600);
  };

  const handleRatingClick = (star: number) => {
    const newRating = property.rating === star ? 0 : star;
    onUpdate && onUpdate(property.id, { rating: newRating || undefined });
  };
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

  // Pinch-to-zoom state
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomTranslate, setZoomTranslate] = useState({ x: 0, y: 0 });
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const imgContainerRef = useRef<HTMLDivElement>(null);

  // Reset zoom when changing image
  useEffect(() => { setZoomScale(1); setZoomTranslate({ x: 0, y: 0 }); }, [galleryIndex]);

  const getTouchDist = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      pinchRef.current = { startDist: getTouchDist(e.touches[0], e.touches[1]), startScale: zoomScale };
    } else if (e.touches.length === 1 && zoomScale > 1) {
      panRef.current = { lastX: e.touches[0].clientX, lastY: e.touches[0].clientY };
    }
  }, [zoomScale]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const dist = getTouchDist(e.touches[0], e.touches[1]);
      const newScale = Math.min(5, Math.max(1, pinchRef.current.startScale * (dist / pinchRef.current.startDist)));
      setZoomScale(newScale);
      if (newScale <= 1) setZoomTranslate({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && panRef.current && zoomScale > 1) {
      const dx = e.touches[0].clientX - panRef.current.lastX;
      const dy = e.touches[0].clientY - panRef.current.lastY;
      panRef.current = { lastX: e.touches[0].clientX, lastY: e.touches[0].clientY };
      setZoomTranslate(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    }
  }, [zoomScale]);

  const handleTouchEnd = useCallback(() => {
    pinchRef.current = null;
    panRef.current = null;
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (zoomScale > 1) {
      setZoomScale(1);
      setZoomTranslate({ x: 0, y: 0 });
    } else {
      setZoomScale(3);
    }
  }, [zoomScale]);

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
            alt={displayTitle(property)} 
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
        {/* Always visible: title + address + price + rooms */}
        <div className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="mb-4">
            <h3 className="font-black text-2xl text-slate-800 truncate mb-1">
              {displayTitle(property)}
            </h3>
            {/* Show address line only if title is custom (not same as address) */}
            {property.title && property.title !== 'דירה חדשה' && (property.street || property.city) && (
              <p className="text-slate-500 text-sm font-bold flex items-center">
                <svg className="w-4 h-4 ml-1 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                {((property.street || '') + (property.city ? (', ' + property.city) : '')) || 'לא צויינה כתובת'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">מחיר</span>
              <span className="text-xl font-black text-indigo-600">₪{property.price?.toLocaleString() || '0'}</span>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
              <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">חדרים</span>
              <span className="text-xl font-black text-slate-800">{property.rooms || '-'}</span>
            </div>
          </div>

          {/* Expand/collapse indicator */}
          <div className="flex justify-center">
            <svg className={`w-5 h-5 text-slate-300 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 animate-[fadeIn_0.2s_ease-out]">
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
          {property.hasParking && (
            <span className="bg-purple-50 text-purple-700 px-2.5 py-1 rounded-lg">🅿️ חניה</span>
          )}
          {property.hasBrokerFee && (
            <span className="bg-red-50 text-red-700 px-2.5 py-1 rounded-lg">💰 תיווך</span>
          )}
        </div>

        {/* Interactive rating stars */}
        <div className="flex items-center gap-0.5 mb-3" dir="ltr">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(star => (
            <button
              key={star}
              onClick={() => handleRatingClick(star)}
              className={`text-lg transition-all hover:scale-125 ${star <= (property.rating || 0) ? 'text-yellow-400 drop-shadow-sm' : 'text-slate-200 hover:text-yellow-300'}`}
            >
              ★
            </button>
          ))}
          {(property.rating || 0) > 0 && (
            <span className="text-xs font-black text-slate-500 mr-1">{property.rating}/10</span>
          )}
        </div>

        {/* Notes toggle + area */}
        <div className="mb-3">
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-indigo-500 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            {showNotes ? 'הסתר הערות' : (localNotes ? 'הערות ✏️' : 'הוסף הערה')}
          </button>
          {showNotes && (
            <textarea
              value={localNotes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="רשום הערות על הדירה..."
              className="mt-2 w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm text-slate-700 font-medium focus:border-indigo-400 focus:bg-white outline-none transition-all resize-none"
              rows={3}
              dir="rtl"
            />
          )}
          {!showNotes && localNotes && (
            <p className="mt-1 text-xs text-slate-400 truncate max-w-full">{localNotes}</p>
          )}
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
        )}
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

        {/* Main image — pinch-to-zoom + double-tap */}
        <div
          ref={imgContainerRef}
          className="flex-1 flex items-center justify-center w-full px-4 sm:px-16 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={handleDoubleClick}
          style={{ touchAction: zoomScale > 1 ? 'none' : 'pan-y' }}
        >
          <img
            src={resolvedGalleryImages[galleryIndex]}
            alt={`${displayTitle(property)} - ${galleryIndex + 1}`}
            className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl select-none"
            style={{
              transform: `scale(${zoomScale}) translate(${zoomTranslate.x / zoomScale}px, ${zoomTranslate.y / zoomScale}px)`,
              transition: pinchRef.current ? 'none' : 'transform 0.2s ease-out',
            }}
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
