
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Property, PropertyStatus } from '../types.ts';
import { getImageObjectURL } from '../utils/idbImages';
import { getPublicImageUrl } from '../services/supabaseSync';

/** Compute a direct Supabase URL for a simple image key (non-idb, non-data). */
function directSupabaseUrl(key: string | undefined | null): string | null {
  if (!key || typeof key !== 'string') return null;
  if (key.startsWith('data:') || key.startsWith('blob:') || key.startsWith('idb-') || key.startsWith('idb://')) return null;
  return getPublicImageUrl(key.startsWith('file://') ? key.replace('file://', '') : key);
}

interface PropertyCardProps {
  property: Property;
  onStatusChange: (id: string, status: PropertyStatus | 'DELETE') => void;
  onEdit?: (id: string) => void;
  onUpdate?: (id: string, updates: Partial<Property>) => void;
  hoverInterval?: number;
}

/** Build a display title: user title → street+city → fallback */
function displayTitle(p: Property): string {
  if (p.title && p.title !== 'דירה חדשה') return p.title;
  const parts = [p.street, p.city].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'ללא כותרת';
}

/** Check reminder status */
function getReminderStatus(p: Property): 'none' | 'due' | 'upcoming' | 'past' {
  if (!p.reminderDate) return 'none';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reminder = new Date(p.reminderDate + 'T00:00:00');
  const diff = reminder.getTime() - today.getTime();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return 'past';
  if (days === 0) return 'due';
  return 'upcoming';
}

/** Format date for display in Hebrew-friendly format */
function formatReminderDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'היום';
  if (diff === 1) return 'מחר';
  if (diff === -1) return 'אתמול';
  if (diff < -1) return `לפני ${Math.abs(diff)} ימים`;
  if (diff <= 7) return `בעוד ${diff} ימים`;
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

/** Format month+year entry date for Hebrew display */
function formatEntryDate(entryDate: string): string {
  if (!entryDate) return '';
  const [year, month] = entryDate.split('-');
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
}

const PropertyCard: React.FC<PropertyCardProps> = ({ property, onStatusChange, onEdit, onUpdate, hoverInterval = 2000 }) => {
  const [showNotes, setShowNotes] = useState(false);
  const [localNotes, setLocalNotes] = useState(property.notes || '');
  const [detailOpen, setDetailOpen] = useState(false);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [reminderDateInput, setReminderDateInput] = useState(property.reminderDate || '');
  const [reminderTextInput, setReminderTextInput] = useState(property.reminderText || '');
  const notesTimer = React.useRef<any>(null);

  const reminderStatus = getReminderStatus(property);

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

  const handleRatingRotemClick = (star: number) => {
    const newRating = property.ratingRotem === star ? 0 : star;
    onUpdate && onUpdate(property.id, { ratingRotem: newRating || undefined });
  };

  const combinedRating = (property.rating || 0) + (property.ratingRotem || 0);
  const getStatusColor = (status: PropertyStatus) => {
    switch (status) {
      case PropertyStatus.NEW: return 'bg-blue-100 text-blue-800';
      case PropertyStatus.FAVORITE: return 'bg-yellow-100 text-yellow-800';
      case PropertyStatus.REJECTED: return 'bg-gray-100 text-gray-500';
      case PropertyStatus.VISITED: return 'bg-green-100 text-green-800';
      default: return 'bg-indigo-100 text-indigo-800';
    }
  };

  const [cardImageIndex, setCardImageIndex] = useState(0);
  const totalImages = property.images?.length || 0;
  // Clamp index if images array shrinks
  const safeCardIndex = totalImages > 0 ? Math.min(cardImageIndex, totalImages - 1) : 0;
  const currentImage = totalImages > safeCardIndex ? property.images![safeCardIndex] : null;
  const [resolvedMainImage, setResolvedMainImage] = useState<string | null>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [imageRetryCount, setImageRetryCount] = useState(0);

  // Synchronous fallback: compute Supabase URL directly for simple keys
  const fallbackImageUrl = directSupabaseUrl(currentImage);

  // Card image pinch-to-zoom state
  const [cardZoom, setCardZoom] = useState(1);
  const [cardZoomTranslate, setCardZoomTranslate] = useState({ x: 0, y: 0 });
  const cardPinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const cardPanRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const cardSwipeRef = useRef<{ startX: number; startY: number; startTime: number } | null>(null);
  const cardImgContainerRef = useRef<HTMLDivElement>(null);
  const hoverCycleRef = useRef<any>(null);

  // Reset card zoom when changing image
  useEffect(() => { setCardZoom(1); setCardZoomTranslate({ x: 0, y: 0 }); }, [safeCardIndex]);

  const cardHandleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      cardPinchRef.current = { startDist: getTouchDist(e.touches[0], e.touches[1]), startScale: cardZoom };
      cardSwipeRef.current = null;
    } else if (e.touches.length === 1) {
      if (cardZoom > 1) {
        cardPanRef.current = { lastX: e.touches[0].clientX, lastY: e.touches[0].clientY };
      } else {
        cardSwipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, startTime: Date.now() };
      }
    }
  }, [cardZoom]);

  const cardHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && cardPinchRef.current) {
      e.preventDefault();
      const dist = getTouchDist(e.touches[0], e.touches[1]);
      const newScale = Math.min(4, Math.max(1, cardPinchRef.current.startScale * (dist / cardPinchRef.current.startDist)));
      setCardZoom(newScale);
      if (newScale <= 1) setCardZoomTranslate({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && cardPanRef.current && cardZoom > 1) {
      const dx = e.touches[0].clientX - cardPanRef.current.lastX;
      const dy = e.touches[0].clientY - cardPanRef.current.lastY;
      cardPanRef.current = { lastX: e.touches[0].clientX, lastY: e.touches[0].clientY };
      setCardZoomTranslate(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    } else if (e.touches.length === 1 && cardSwipeRef.current) {
      // Mark as swiping if moved enough horizontally
      const dx = Math.abs(e.touches[0].clientX - cardSwipeRef.current.startX);
      if (dx > 10) {
        // prevent vertical scroll while swiping
        e.preventDefault();
      }
    }
  }, [cardZoom]);

  const cardHandleTouchEnd = useCallback((e: React.TouchEvent) => {
    cardPinchRef.current = null;
    cardPanRef.current = null;
    if (cardSwipeRef.current && cardZoom <= 1 && totalImages > 1) {
      const touch = e.changedTouches[0];
      const dx = touch.clientX - cardSwipeRef.current.startX;
      const dy = touch.clientY - cardSwipeRef.current.startY;
      const dt = Date.now() - cardSwipeRef.current.startTime;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx > 40 && absDx > absDy * 1.5 && dt < 500) {
        // Swipe detected
        if (dx > 0) {
          // Swipe right → previous image (RTL: left arrow)
          setCardImageIndex(i => Math.max(0, i - 1));
        } else {
          // Swipe left → next image
          setCardImageIndex(i => Math.min(totalImages - 1, i + 1));
        }
        cardSwipeRef.current = null;
        return;
      }
      // Tap (no significant movement)
      if (absDx < 15 && absDy < 15 && dt < 300 && cardImgContainerRef.current) {
        const rect = cardImgContainerRef.current.getBoundingClientRect();
        const tapX = touch.clientX - rect.left;
        const halfWidth = rect.width / 2;
        if (tapX < halfWidth) {
          // Tap left side → previous
          if (safeCardIndex > 0) { setCardImageIndex(i => i - 1); cardSwipeRef.current = null; return; }
        } else {
          // Tap right side → next
          if (safeCardIndex < totalImages - 1) { setCardImageIndex(i => i + 1); cardSwipeRef.current = null; return; }
        }
      }
    }
    cardSwipeRef.current = null;
  }, [cardZoom, totalImages, safeCardIndex]);

  const cardHandleDoubleClick = useCallback(() => {
    if (cardZoom > 1) {
      setCardZoom(1);
      setCardZoomTranslate({ x: 0, y: 0 });
    } else {
      setCardZoom(2.5);
    }
  }, [cardZoom]);

  const handleImageMouseEnter = useCallback(() => {
    if (totalImages <= 1) return;
    hoverCycleRef.current = setInterval(() => {
      setCardImageIndex(i => (i + 1) % totalImages);
    }, hoverInterval);
  }, [totalImages, hoverInterval]);

  const handleImageMouseLeave = useCallback(() => {
    if (hoverCycleRef.current) {
      clearInterval(hoverCycleRef.current);
      hoverCycleRef.current = null;
    }
  }, []);

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
    setImageLoadFailed(false);
    setImageRetryCount(0);
    const resolve = async () => {
      const img = currentImage;
      if (!img) { setResolvedMainImage(null); return; }
      if (typeof img === 'string' && img.startsWith('data:')) {
        if (active) setResolvedMainImage(img);
      } else if (typeof img === 'string') {
        const key = img.startsWith('idb://') ? img.replace('idb://', '') : img;
        try {
          const url = await getImageObjectURL(key);
          if (active) setResolvedMainImage(url);
        } catch (e) { console.error('Image resolve error:', e); if (active) setResolvedMainImage(null); }
      }
    };
    resolve();
    return () => { active = false; if (resolvedMainImage && resolvedMainImage.startsWith('blob:')) URL.revokeObjectURL(resolvedMainImage); };
  }, [property.images, safeCardIndex]);

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
            urls.push(url || directSupabaseUrl(img) || '');
          } catch { 
            urls.push(directSupabaseUrl(img) || ''); 
          }
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
    setGalleryIndex(safeCardIndex);
    setGalleryOpen(true);
  };

  const handleSetAsPrimary = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!property.images || safeCardIndex === 0) return;
    const newImages = [...property.images];
    const [moved] = newImages.splice(safeCardIndex, 1);
    newImages.unshift(moved);
    onUpdate && onUpdate(property.id, { images: newImages });
    setCardImageIndex(0);
  };

  return (
    <>
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-xl transition-all group flex flex-col h-full">
      <div
        ref={cardImgContainerRef}
        className="relative h-64 bg-slate-100 shrink-0 cursor-pointer overflow-hidden"
        onClick={cardZoom > 1 ? undefined : openGallery}
        onMouseEnter={totalImages > 1 ? handleImageMouseEnter : undefined}
        onMouseLeave={totalImages > 1 ? handleImageMouseLeave : undefined}
        onTouchStart={totalImages > 0 ? cardHandleTouchStart : undefined}
        onTouchMove={totalImages > 0 ? cardHandleTouchMove : undefined}
        onTouchEnd={totalImages > 0 ? cardHandleTouchEnd : undefined}
        onDoubleClick={totalImages > 0 ? cardHandleDoubleClick : undefined}
        style={{ touchAction: cardZoom > 1 ? 'none' : (totalImages > 1 ? 'pan-y' : 'auto') }}
      >
        {(resolvedMainImage || fallbackImageUrl) && !imageLoadFailed ? (
          <img 
            src={resolvedMainImage || fallbackImageUrl!} 
            alt={displayTitle(property)} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 select-none"
            draggable={false}
            style={cardZoom > 1 ? {
              transform: `scale(${cardZoom}) translate(${cardZoomTranslate.x / cardZoom}px, ${cardZoomTranslate.y / cardZoom}px)`,
              transition: cardPinchRef.current ? 'none' : 'transform 0.2s ease-out',
            } : undefined}
            onError={() => { 
              console.error('Image failed to load:', resolvedMainImage?.substring(0, 100)); 
              if (imageRetryCount === 0 && fallbackImageUrl && resolvedMainImage !== fallbackImageUrl) {
                // First failure: try Supabase direct URL instead of local server URL
                console.log('Falling back to Supabase URL:', fallbackImageUrl);
                setImageRetryCount(1);
                setResolvedMainImage(fallbackImageUrl);
              } else if (imageRetryCount < 3) {
                // Retry with cache-busting
                setImageRetryCount(prev => prev + 1);
                const sep = resolvedMainImage?.includes('?') ? '&' : '?';
                setResolvedMainImage(prev => prev + sep + '_r=' + Date.now());
              } else {
                setImageLoadFailed(true); 
              }
            }}
          />
        ) : imageLoadFailed ? (
          <div className="flex flex-col items-center justify-center h-full text-red-400 gap-2 p-4" onClick={(e) => { e.stopPropagation(); setImageLoadFailed(false); setImageRetryCount(0); }}>
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="text-xs text-center">שגיאה בטעינת תמונה</span>
            <span className="text-[10px] text-red-300">לחץ לנסות שוב</span>
          </div>
        ) : !resolvedMainImage && property.images && property.images.length > 0 ? (
          <div className="flex items-center justify-center h-full text-indigo-300">
            <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-300">
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        
        {/* Image navigation arrows */}
        {totalImages > 1 && (
          <>
            {safeCardIndex > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setCardImageIndex(i => Math.max(0, i - 1)); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/40 hover:bg-black/60 text-white w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
              </button>
            )}
            {safeCardIndex < totalImages - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); setCardImageIndex(i => Math.min(totalImages - 1, i + 1)); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-black/40 hover:bg-black/60 text-white w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
              </button>
            )}
          </>
        )}

        {/* Image counter + dots */}
        {totalImages > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
            {Array.from({ length: totalImages }, (_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setCardImageIndex(i); }}
                className={`rounded-full transition-all ${i === safeCardIndex ? 'w-2.5 h-2.5 bg-white shadow-lg' : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/80'}`}
              />
            ))}
          </div>
        )}

        {/* Set as primary image */}
        {totalImages > 1 && safeCardIndex > 0 && (
          <button
            onClick={handleSetAsPrimary}
            className="absolute bottom-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1"
            title="קבע כתמונה ראשית"
          >
            ★ ראשית
          </button>
        )}

        <div className="absolute top-4 right-4 flex items-center gap-2">
          {combinedRating > 0 && (
            <span className="px-3 py-2 rounded-2xl text-xs font-black shadow-lg backdrop-blur-md bg-yellow-400/90 text-yellow-900 flex items-center gap-1">
              <span className="text-sm">★</span> {combinedRating}/20
            </span>
          )}
          <span className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg backdrop-blur-md ${getStatusColor(property.status)}`}>
            {property.status}
          </span>
        </div>

        {/* Reminder badge on image — hidden once date has passed */}
        {(reminderStatus === 'due' || reminderStatus === 'upcoming') && (
          <div className={`absolute top-4 left-4 px-3 py-2 rounded-2xl text-xs font-black shadow-lg backdrop-blur-md flex items-center gap-1 ${
            reminderStatus === 'due' ? 'bg-red-500/90 text-white animate-pulse' :
            'bg-amber-400/90 text-amber-900'
          }`}>
            🔔 {formatReminderDate(property.reminderDate!)}
          </div>
        )}
      </div>
      
      <div className="p-6 flex flex-col flex-1">
        {/* Title + address */}
        <div className="mb-4 cursor-pointer" onClick={() => setDetailOpen(true)}>
          <h3 className="font-black text-2xl text-slate-800 truncate mb-1">
            {displayTitle(property)}
          </h3>
          {property.title && property.title !== 'דירה חדשה' && property.title !== '' && (property.street || property.city) && (
            <p className="text-slate-500 text-sm font-bold flex items-center">
              <svg className="w-4 h-4 ml-1 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              </svg>
              {((property.street || '') + (property.city ? (', ' + property.city) : ''))}
            </p>
          )}
        </div>

        {/* Price + Rooms */}
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

        {/* Floor / Elevator / Balcony / Parking / Broker row */}
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
          {property.entryDate && (
            <span className="bg-teal-50 text-teal-700 px-2.5 py-1 rounded-lg">📅 {formatEntryDate(property.entryDate)}</span>
          )}
        </div>

        {/* Interactive rating stars - Dubi */}
        <div className="mb-1">
          <span className="text-[10px] font-black text-slate-400">דובי</span>
          <div className="flex items-center gap-0.5" dir="ltr">
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
        </div>

        {/* Interactive rating stars - Rotem */}
        <div className="mb-1">
          <span className="text-[10px] font-black text-pink-400">רותם</span>
          <div className="flex items-center gap-0.5" dir="ltr">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(star => (
              <button
                key={star}
                onClick={() => handleRatingRotemClick(star)}
                className={`text-lg transition-all hover:scale-125 ${star <= (property.ratingRotem || 0) ? 'text-pink-400 drop-shadow-sm' : 'text-slate-200 hover:text-pink-300'}`}
              >
                ★
              </button>
            ))}
            {(property.ratingRotem || 0) > 0 && (
              <span className="text-xs font-black text-pink-500 mr-1">{property.ratingRotem}/10</span>
            )}
          </div>
        </div>

        {/* Combined rating */}
        {combinedRating > 0 && (
          <div className="mb-3 text-xs font-black text-indigo-600">משולב: {combinedRating}/20</div>
        )}

        {/* Notes preview */}
        {localNotes && (
          <p className="text-xs text-slate-400 truncate max-w-full mb-3">📝 {localNotes}</p>
        )}

        {/* Reminder section — hidden once date has passed */}
        {(reminderStatus === 'due' || reminderStatus === 'upcoming') && !showReminderForm && (
          <div className={`flex items-center gap-2 mb-3 p-2.5 rounded-xl text-xs font-bold ${
            reminderStatus === 'due' ? 'bg-red-50 text-red-700 border border-red-200' :
            'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            <span>🔔</span>
            <div className="flex-1 min-w-0">
              <span className="font-black">{formatReminderDate(property.reminderDate!)}</span>
              {property.reminderText && <span className="mr-1"> — {property.reminderText}</span>}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate && onUpdate(property.id, { reminderDate: undefined, reminderText: undefined }); }}
              className="text-xs opacity-60 hover:opacity-100 transition-opacity shrink-0"
              title="הסר תזכורת"
            >✕</button>
          </div>
        )}

        {/* Quick reminder form */}
        {showReminderForm && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-700">🔔 הגדר תזכורת</span>
              <button onClick={() => setShowReminderForm(false)} className="text-xs text-amber-500 hover:text-amber-700">✕</button>
            </div>
            <input
              type="date"
              value={reminderDateInput}
              onChange={(e) => setReminderDateInput(e.target.value)}
              className="w-full bg-white border border-amber-200 rounded-lg p-2 text-sm font-bold text-slate-800 outline-none focus:border-amber-400"
            />
            <input
              type="text"
              placeholder="על מה? (לדוגמא: להתקשר...)" 
              value={reminderTextInput}
              onChange={(e) => setReminderTextInput(e.target.value)}
              className="w-full bg-white border border-amber-200 rounded-lg p-2 text-sm font-bold text-slate-800 outline-none focus:border-amber-400"
              dir="rtl"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (reminderDateInput) {
                    onUpdate && onUpdate(property.id, { reminderDate: reminderDateInput, reminderText: reminderTextInput || undefined });
                  }
                  setShowReminderForm(false);
                }}
                disabled={!reminderDateInput}
                className="flex-1 bg-amber-500 text-white py-2 rounded-lg text-xs font-black hover:bg-amber-600 transition-all disabled:opacity-40"
              >
                שמור
              </button>
              {property.reminderDate && (
                <button
                  onClick={() => {
                    onUpdate && onUpdate(property.id, { reminderDate: undefined, reminderText: undefined });
                    setReminderDateInput('');
                    setReminderTextInput('');
                    setShowReminderForm(false);
                  }}
                  className="px-3 bg-red-50 text-red-500 py-2 rounded-lg text-xs font-black hover:bg-red-100 transition-all"
                >
                  הסר
                </button>
              )}
            </div>
          </div>
        )}

        {/* Action buttons */}
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
               onClick={() => setDetailOpen(true)}
               className="p-3 text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-colors"
               title="פרטים מלאים"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
            <button 
               onClick={() => { setReminderDateInput(property.reminderDate || ''); setReminderTextInput(property.reminderText || ''); setShowReminderForm(!showReminderForm); }}
               className={`p-3 rounded-xl transition-colors ${reminderStatus !== 'none' ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50' : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'}`}
               title="תזכורת"
            >
              <span className="text-lg">🔔</span>
            </button>
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

    {/* ───── Full-screen detail modal ───── */}
    {detailOpen && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-end sm:items-center justify-center" onClick={() => setDetailOpen(false)}>
        <div
          className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl max-h-[92vh] overflow-y-auto shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          dir="rtl"
        >
          {/* Detail header image */}
          {resolvedMainImage && (
            <div className="relative h-56 sm:h-72 cursor-pointer" onClick={openGallery}>
              <img src={resolvedMainImage} alt={displayTitle(property)} className="w-full h-full object-cover sm:rounded-t-3xl" />
              {property.images && property.images.length > 1 && (
                <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                  📷 {property.images.length} תמונות
                </div>
              )}
            </div>
          )}

          <div className="p-6 space-y-5">
            {/* Title + status */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-black text-2xl text-slate-800 mb-1">{displayTitle(property)}</h2>
                {(property.street || property.city) && (
                  <p className="text-slate-500 text-sm font-bold flex items-center gap-1">
                    📍 {[property.street, property.city].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
              <span className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-black ${getStatusColor(property.status)}`}>
                {property.status}
              </span>
            </div>

            {/* Price + Rooms + Floor */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">מחיר</span>
                <span className="text-lg font-black text-indigo-600">₪{property.price?.toLocaleString() || '0'}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">חדרים</span>
                <span className="text-lg font-black text-slate-800">{property.rooms || '-'}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                <span className="block text-[10px] font-black text-slate-400 uppercase mb-1">קומה</span>
                <span className="text-lg font-black text-slate-800">{property.floor != null ? property.floor : '-'}</span>
              </div>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              {property.hasElevator && <span className="bg-green-50 text-green-700 px-3 py-1.5 rounded-lg">🛗 מעלית</span>}
              {property.hasBalcony && <span className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg">🏞️ מרפסת</span>}
              {property.hasParking && <span className="bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg">🅿️ חניה</span>}
              {property.hasBrokerFee && <span className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg">💰 דמי תיווך</span>}
              {property.entryDate && <span className="bg-teal-50 text-teal-700 px-3 py-1.5 rounded-lg">📅 כניסה: {formatEntryDate(property.entryDate)}</span>}
              {!property.hasElevator && !property.hasBalcony && !property.hasParking && !property.hasBrokerFee && !property.entryDate && (
                <span className="text-slate-400">אין תגיות</span>
              )}
            </div>

            {/* Rating */}
            <div>
              <span className="block text-[10px] font-black text-slate-400 uppercase mb-2">דירוג דובי</span>
              <div className="flex items-center gap-0.5" dir="ltr">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(star => (
                  <button
                    key={star}
                    onClick={() => handleRatingClick(star)}
                    className={`text-xl transition-all hover:scale-125 ${star <= (property.rating || 0) ? 'text-yellow-400 drop-shadow-sm' : 'text-slate-200 hover:text-yellow-300'}`}
                  >
                    ★
                  </button>
                ))}
                {(property.rating || 0) > 0 && (
                  <span className="text-sm font-black text-slate-500 mr-2">{property.rating}/10</span>
                )}
              </div>
            </div>

            {/* Rating Rotem */}
            <div>
              <span className="block text-[10px] font-black text-pink-400 uppercase mb-2">דירוג רותם</span>
              <div className="flex items-center gap-0.5" dir="ltr">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(star => (
                  <button
                    key={star}
                    onClick={() => handleRatingRotemClick(star)}
                    className={`text-xl transition-all hover:scale-125 ${star <= (property.ratingRotem || 0) ? 'text-pink-400 drop-shadow-sm' : 'text-slate-200 hover:text-pink-300'}`}
                  >
                    ★
                  </button>
                ))}
                {(property.ratingRotem || 0) > 0 && (
                  <span className="text-sm font-black text-pink-500 mr-2">{property.ratingRotem}/10</span>
                )}
              </div>
            </div>

            {/* Combined rating */}
            {combinedRating > 0 && (
              <div className="bg-gradient-to-r from-yellow-50 to-pink-50 border border-yellow-100 rounded-xl p-3 text-center">
                <span className="text-[10px] font-black text-slate-400 uppercase">דירוג משולב</span>
                <span className="text-2xl font-black text-indigo-600 mr-2">{combinedRating}/20</span>
              </div>
            )}

            {/* Reminder in detail modal */}
            <div>
              <span className="block text-[10px] font-black text-slate-400 uppercase mb-2">🔔 תזכורת</span>
              {property.reminderDate && reminderStatus !== 'past' ? (
                <div className={`p-3 rounded-xl border-2 ${
                  reminderStatus === 'due' ? 'bg-red-50 border-red-200' :
                  'bg-amber-50 border-amber-200'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-black ${
                      reminderStatus === 'due' ? 'text-red-600' : 'text-amber-600'
                    }`}>{formatReminderDate(property.reminderDate)}</span>
                    <button
                      onClick={() => onUpdate && onUpdate(property.id, { reminderDate: undefined, reminderText: undefined })}
                      className="text-slate-400 hover:text-red-500 text-xs font-bold"
                    >✕ הסר</button>
                  </div>
                  {property.reminderText && (
                    <p className="text-xs text-slate-600 font-medium">{property.reminderText}</p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">{new Date(property.reminderDate + 'T00:00:00').toLocaleDateString('he-IL')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={reminderDateInput}
                      onChange={e => setReminderDateInput(e.target.value)}
                      className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-lg px-3 py-2 text-sm font-medium focus:border-amber-400 outline-none"
                    />
                    <button
                      onClick={() => {
                        if (reminderDateInput) {
                          onUpdate && onUpdate(property.id, { reminderDate: reminderDateInput, reminderText: reminderTextInput || undefined });
                          setReminderDateInput('');
                          setReminderTextInput('');
                        }
                      }}
                      disabled={!reminderDateInput}
                      className="px-4 py-2 bg-amber-500 text-white rounded-lg text-xs font-black hover:bg-amber-600 disabled:opacity-40 transition-all"
                    >הוסף</button>
                  </div>
                  <input
                    type="text"
                    value={reminderTextInput}
                    onChange={e => setReminderTextInput(e.target.value)}
                    placeholder="תוכן התזכורת (אופציונלי)..."
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-lg px-3 py-2 text-sm font-medium focus:border-amber-400 outline-none"
                    dir="rtl"
                  />
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <span className="block text-[10px] font-black text-slate-400 uppercase mb-2">הערות</span>
              <textarea
                value={localNotes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="רשום הערות על הדירה..."
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-sm text-slate-700 font-medium focus:border-indigo-400 focus:bg-white outline-none transition-all resize-none"
                rows={3}
                dir="rtl"
              />
            </div>

            {/* Action buttons */}
            <div className="space-y-3 pt-2">
              <div className="flex gap-2">
                {property.link && (
                  <a 
                    href={property.link.startsWith('http') ? property.link : `https://${property.link}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex-1 bg-slate-900 text-white text-center py-3 rounded-xl font-black text-sm hover:bg-black transition-all"
                  >
                    קישור למודעה
                  </a>
                )}
                {property.phone && (
                  <a href={`tel:${property.phone}`} className="flex-1 bg-indigo-50 text-indigo-600 text-center py-3 rounded-xl font-black text-sm hover:bg-indigo-100 transition-all">
                    📞 {property.phone}
                  </a>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setDetailOpen(false); onEdit && onEdit(property.id); }}
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-black text-sm hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" />
                  </svg>
                  עריכה
                </button>
                <button
                  onClick={() => { if(confirm('למחוק את המודעה?')) { setDetailOpen(false); onStatusChange(property.id, 'DELETE'); } }}
                  className="px-5 py-3 bg-red-50 text-red-500 rounded-xl font-black text-sm hover:bg-red-100 transition-all"
                >
                  מחיקה
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

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
          className="flex-1 flex items-center justify-center w-full overflow-hidden"
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
            className="object-contain select-none"
            style={{
              maxHeight: '85vh',
              maxWidth: '100vw',
              width: 'auto',
              height: 'auto',
              transform: `scale(${zoomScale}) translate(${zoomTranslate.x / zoomScale}px, ${zoomTranslate.y / zoomScale}px)`,
              transition: pinchRef.current ? 'none' : 'transform 0.2s ease-out',
            }}
            draggable={false}
            onError={(e) => {
              const img = property.images?.[galleryIndex];
              const fallback = img ? directSupabaseUrl(img) : null;
              if (fallback && (e.target as HTMLImageElement).src !== fallback) {
                (e.target as HTMLImageElement).src = fallback;
              }
            }}
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
                <img 
                  src={url} 
                  className="w-full h-full object-cover" 
                  alt=""
                  onError={(e) => {
                    const img = property.images?.[i];
                    const fallback = img ? directSupabaseUrl(img) : null;
                    if (fallback && (e.target as HTMLImageElement).src !== fallback) {
                      (e.target as HTMLImageElement).src = fallback;
                    }
                  }}
                />
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
