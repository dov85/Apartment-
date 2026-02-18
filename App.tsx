
import React, { useState, useEffect, useRef } from 'react';
import { Property, PropertyStatus } from './types.ts';
import PropertyCard from './components/PropertyCard.tsx';
import MapView from './components/MapView';
import { saveImageDataUrl, deleteImageKey, getImageObjectURL } from './utils/idbImages';

const SYNC_SERVICE_URL = 'https://api.keyvalue.xyz'; 

const App: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [showMobileLink, setShowMobileLink] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [syncCode, setSyncCode] = useState<string>(localStorage.getItem('syncCode') || '');
  const [isSyncing, setIsSyncing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  
  // Manual form states
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);  // display URLs (data: or blob:)
  const [imageRefs, setImageRefs] = useState<string[]>([]);          // storage refs (idb:// or data:)
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [title, setTitle] = useState('');
  // const [address, setAddress] = useState('');
  const [price, setPrice] = useState('');
  const [rooms, setRooms] = useState('');
  const [phone, setPhone] = useState('');
  const [link, setLink] = useState('');

  const pollInterval = useRef<any>(null);
  const modalOverlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('apartments');
    if (saved) setProperties(JSON.parse(saved));
  }, []);

  // migrate old saved data which used `address` into `street`/`city`
  useEffect(() => {
    const saved = localStorage.getItem('apartments');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as any[];
      const migrated = parsed.map(item => {
        if (item.address && !item.street && !item.city) {
          // best-effort split: split by comma
          const parts = item.address.split(',').map((p: string) => p.trim());
          return { ...item, street: parts[0] || '', city: parts[1] || '' };
        }
        return item;
      });
      setProperties(migrated);
      localStorage.setItem('apartments', JSON.stringify(migrated));
    } catch (e) {}
  }, []);

  const fetchRemoteData = async (code: string) => {
    if (!code) return;
    try {
      const response = await fetch(`${SYNC_SERVICE_URL}/${code}`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setProperties(data);
          localStorage.setItem('apartments', JSON.stringify(data));
        }
      }
    } catch (e) {}
  };

  const pushDataToRemote = async (code: string, data: Property[]) => {
    if (!code) return;
    try {
      await fetch(`${SYNC_SERVICE_URL}/${code}`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (e) {}
  };

  useEffect(() => {
    if (syncCode) {
      setIsSyncing(true);
      fetchRemoteData(syncCode);
      pollInterval.current = setInterval(() => fetchRemoteData(syncCode), 5000);
    } else {
      setIsSyncing(false);
      if (pollInterval.current) clearInterval(pollInterval.current);
    }
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [syncCode]);

  useEffect(() => {
    if (isAdding && modalOverlayRef.current) {
      // focus overlay so paste (Ctrl+V) is captured
      modalOverlayRef.current.focus();
    }
  }, [isAdding]);

  const saveProperties = (newProps: Property[]) => {
    console.log('saveProperties: saving', newProps.length, 'items');
    setProperties(newProps);
    try {
      localStorage.setItem('apartments', JSON.stringify(newProps));
    } catch (err) {
      console.error('localStorage setItem failed:', err);
      // Fallback: try to save metadata without images to avoid exceeding quota
      try {
        const fallback = newProps.map(p => ({ ...p, images: [] }));
        localStorage.setItem('apartments', JSON.stringify(fallback));
        setProperties(fallback as Property[]);
        alert('לא ניתן לשמור את התמונות בשל מגבלת שטח האחסון בדפדפן; שמרתי את המודעות ללא התמונות כדי שלא ייעלמו.');
      } catch (err2) {
        console.error('localStorage fallback also failed:', err2);
        alert('שגיאה בשמירת המודעות ב-localStorage. בדוק שטח אחסון בדפדפן.');
      }
    }
    if (syncCode) pushDataToRemote(syncCode, newProps);
  };

  const handleImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setImagePreviews(prev => [...prev, dataUrl]);
        setImageRefs(prev => [...prev, dataUrl]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items) {
      let handled = false;
      let added = 0;
      Array.from(items).forEach((item) => {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              setImagePreviews(prev => [...prev, dataUrl]);
              setImageRefs(prev => [...prev, dataUrl]);
            };
            reader.readAsDataURL(file);
            handled = true;
            added += 1;
          }
        }
      });
      if (handled) e.preventDefault();
      return;
    }

    // Fallback: check files list
    const files = (e.nativeEvent as any).clipboardData?.files as FileList | undefined;
    if (files && files.length) {
      Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            setImagePreviews(prev => [...prev, dataUrl]);
            setImageRefs(prev => [...prev, dataUrl]);
          };
          reader.readAsDataURL(file);
        }
      });
    }
  };

  const removeImage = (index: number) => {
    // Revoke blob URL if applicable
    const displayUrl = imagePreviews[index];
    if (displayUrl && displayUrl.startsWith('blob:')) URL.revokeObjectURL(displayUrl);
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
    setImageRefs(prev => prev.filter((_, i) => i !== index));
  };

  const handleEdit = async (id: string) => {
    console.log('handleEdit:', id);
    const prop = properties.find(p => p.id === id);
    if (!prop) return;
    setEditingId(id);
    setTitle(prop.title || '');
    setStreet(prop.street || '');
    setCity(prop.city || '');
    setPrice(String(prop.price || ''));
    setRooms(prop.rooms || '');
    setPhone(prop.phone || '');
    setLink(prop.link || '');

    // Resolve idb:// keys to blob URLs for display, keep original refs
    const refs = prop.images || [];
    const displayUrls: string[] = [];
    for (const ref of refs) {
      if (typeof ref === 'string' && ref.startsWith('idb://')) {
        try {
          const blobUrl = await getImageObjectURL(ref.replace('idb://', ''));
          displayUrls.push(blobUrl || '');
        } catch (e) {
          console.error('Failed to resolve idb image:', e);
          displayUrls.push('');
        }
      } else {
        displayUrls.push(ref as string);
      }
    }
    setImagePreviews(displayUrls.filter(Boolean));
    setImageRefs(refs.filter((_, i) => displayUrls[i] !== ''));
    setIsAdding(true);
  };

  const handleFinalSave = () => {
    console.log('handleFinalSave - editingId:', editingId);
    const newPropBase = {
      id: Date.now().toString(),
      title: title || 'דירה חדשה',
      street: street || '',
      city: city || '',
      price: parseInt(price) || 0,
      phone: phone || '',
      rooms: rooms || '',
      images: imageRefs,
      link: link || '',
      status: PropertyStatus.NEW,
      createdAt: Date.now(),
    } as any;

    // try to geocode, move images to IndexedDB (so we can store many), then save
    (async () => {
      const coords = await geocodeAddress(newPropBase.street, newPropBase.city);
      if (coords) {
        newPropBase.lat = coords.lat;
        newPropBase.lon = coords.lon;
      }

      // process images: convert data URLs to IDB keys, keep existing idb:// keys
      const finalImageRefs: string[] = [];
      for (const img of newPropBase.images || []) {
        if (typeof img === 'string' && img.startsWith('idb://')) {
          finalImageRefs.push(img);
        } else if (typeof img === 'string') {
          try {
            const key = await saveImageDataUrl(img);
            finalImageRefs.push('idb://' + key);
          } catch (e) {
            console.error('saveImageDataUrl failed', e);
          }
        }
      }

      const newProp: Property = { ...newPropBase, images: finalImageRefs } as Property;

      let updated: Property[] = [];
      if (editingId) {
        // delete any old idb images that were removed
        const existing = properties.find(p => p.id === editingId);
        const oldImgs: string[] = existing?.images || [];
        const toDelete = oldImgs.filter(i => i && i.startsWith('idb://') && !newProp.images.includes(i));
        for (const d of toDelete) {
          try { await deleteImageKey(d.replace('idb://', '')); } catch (e) { console.error('deleteImageKey failed', e); }
        }

        updated = properties.map(p => p.id === editingId ? { ...p, ...newProp, id: editingId } : p);
      } else {
        updated = [newProp, ...properties];
      }
      saveProperties(updated);
      resetForm();
    })();
  };

  const resetForm = () => {
    setIsAdding(false);
    // Revoke any blob URLs created for edit previews
    imagePreviews.forEach(url => { if (url && url.startsWith('blob:')) URL.revokeObjectURL(url); });
    setImagePreviews([]);
    setImageRefs([]);
    setTitle('');
    setStreet('');
    setCity('');
    setPrice('');
    setRooms('');
    setPhone('');
    setLink('');
    setEditingId(null);
  };

  // Simple Nominatim geocoding (free). Query: street + city + Israel.
  const geocodeAddress = async (streetQ: string, cityQ: string) => {
    const q = [streetQ, cityQ, 'Israel'].filter(Boolean).join(', ');
    if (!q.trim()) return null;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=il` , {
        headers: { 'Accept-Language': 'en-US', 'User-Agent': 'ApartmentHunter/1.0 (+https://example.com)'} as any
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      }
    } catch (e) {}
    return null;
  };

  const [previewCoords, setPreviewCoords] = useState<{lat:number,lon:number}|null>(null);

  const handleFindAddress = async () => {
    const coords = await geocodeAddress(street, city);
    if (coords) {
      setPreviewCoords(coords);
      alert('כתובת נמצאה — הסמן יעודכן על המפה.');
    } else {
      alert('לא נמצאה כתובת. נסה לשנות את הטקסט.');
    }
  };

  const handleSyncSetup = () => {
    const code = prompt('הזן קוד סנכרון משותף (למשל מספר הטלפון שלך או מילה סודית):', syncCode);
    if (code !== null) {
      const cleanedCode = code.trim();
      setSyncCode(cleanedCode);
      localStorage.setItem('syncCode', cleanedCode);
    }
  };

  const copyAppLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const deleteProperty = (id: string) => {
    console.log('deleteProperty:', id);
    const prop = properties.find(p => p.id === id);
    const updated = properties.filter(p => p.id !== id);
    saveProperties(updated);
    // async cleanup of images stored in IDB
    (async () => {
      if (prop?.images && prop.images.length) {
        for (const img of prop.images) {
          if (typeof img === 'string' && img.startsWith('idb://')) {
            try { await deleteImageKey(img.replace('idb://', '')); } catch (e) { console.error('deleteImageKey failed', e); }
          }
        }
      }
    })();
  };

  const updateStatus = (id: string, status: PropertyStatus | 'DELETE') => {
    if (status === 'DELETE') {
      deleteProperty(id);
    } else {
      const updated = properties.map(p => p.id === id ? { ...p, status } : p);
      saveProperties(updated);
    }
  };

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.href)}`;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 px-4 md:px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-800 leading-none">Apartment Hunter</h1>
            <div className="flex items-center gap-1.5 mt-1">
              <div className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`}></div>
              <span className="text-[9px] text-slate-400 font-bold uppercase">
                {isSyncing ? `סנכרון: ${syncCode}` : 'מצב מקומי'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-1.5">
          <button 
            onClick={() => setShowMobileLink(true)}
            className="p-2.5 rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all active:scale-90 flex items-center gap-2"
            title="פתח בטלפון"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span className="hidden sm:block text-[10px] font-black uppercase tracking-wider">פתח בנייד</span>
          </button>

          <button 
            onClick={handleSyncSetup}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all active:scale-90"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </button>
          
          <button 
            onClick={() => setIsAdding(true)}
            className="bg-indigo-600 text-white p-2.5 rounded-xl font-black transition-all shadow-lg active:scale-95 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:block text-[10px] font-black tracking-widest uppercase">הוסף</span>
          </button>
          {/* Excel export removed — data stored locally in browser localStorage only */}
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-6">
        <MapView properties={properties} previewCoords={previewCoords} />
        {properties.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
            {properties.map(property => (
              <PropertyCard 
                key={property.id} 
                property={property} 
                onStatusChange={updateStatus}
                  onEdit={handleEdit}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 md:py-40 px-6">
            <div className="bg-indigo-50 w-24 h-24 md:w-32 md:h-32 rounded-[2rem] flex items-center justify-center mx-auto mb-8 text-indigo-400 shadow-inner">
              <svg className="w-12 h-12 md:w-16 md:h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-800 mb-3">המאגר שלכם ריק</h2>
            <p className="text-slate-400 max-w-sm mx-auto mb-10 font-bold text-sm md:text-base">הוסיפו מודעה ידנית או סרקו את הקוד QR כדי לפתוח בטלפון.</p>
            {!syncCode && (
              <button onClick={handleSyncSetup} className="text-indigo-600 font-black text-xs md:text-sm uppercase tracking-wider hover:underline">
                חבר מכשיר נוסף לסנכרון
              </button>
            )}
          </div>
        )}
      </main>

      {/* QR Code / Mobile Link Modal */}
      {showMobileLink && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md shadow-2xl overflow-hidden modal-animate">
            <div className="p-8 text-center">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-slate-800">פתח בטלפון הנייד</h2>
                <button onClick={() => setShowMobileLink(false)} className="bg-slate-100 p-2 rounded-xl text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="bg-slate-50 p-6 rounded-[2rem] mb-6 inline-block">
                <img src={qrUrl} alt="QR Code" className="w-48 h-48 mx-auto mix-blend-multiply" />
              </div>
              
              <p className="text-slate-500 font-bold mb-8 text-sm leading-relaxed">
                סרקו את הקוד עם המצלמה בטלפון כדי לפתוח את האפליקציה מיד.
              </p>

              <div className="space-y-4">
                <button 
                  onClick={copyAppLink}
                  className={`w-full py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all ${copySuccess ? 'bg-green-500 text-white' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'}`}
                >
                  {copySuccess ? 'הקישור הועתק!' : 'העתק קישור לשליחה'}
                  {!copySuccess && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  )}
                </button>

                <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 text-right">
                  <h4 className="text-amber-800 font-black text-xs uppercase mb-2">טיפ להתקנה:</h4>
                  <p className="text-amber-700 text-[11px] leading-tight font-bold">
                    לאחר פתיחת הקישור בטלפון, לחצו על <strong>"הוספה למסך הבית"</strong> בתפריט הדפדפן כדי להשתמש בזה כאפליקציה רגילה.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {isAdding && (
      <div ref={modalOverlayRef} onPaste={handlePaste} tabIndex={0} className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[2rem] md:rounded-[3rem] w-full max-w-2xl shadow-2xl overflow-hidden my-auto modal-animate">
            <div className="p-6 md:p-8 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl md:text-2xl font-black text-slate-800">הוספת מודעה חדשה</h2>
              <button 
                onClick={resetForm}
                className="bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl p-2.5 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 md:p-8 space-y-6 md:space-y-8">
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">תמונות וצילומי מסך</label>
                <div className="flex flex-wrap gap-3 md:gap-4">
                  {imagePreviews.map((src, index) => (
                    <div key={index} className="relative w-20 h-20 md:w-24 md:h-24 rounded-xl md:rounded-2xl overflow-hidden border-2 border-slate-100 group">
                      <img src={src} className="w-full h-full object-cover" />
                      <button 
                        onClick={() => removeImage(index)}
                        className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-lg opacity-90 group-hover:opacity-100 transition-opacity"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <label className="w-20 h-20 md:w-24 md:h-24 rounded-xl md:rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all text-slate-400 hover:text-indigo-500">
                    <input type="file" className="hidden" accept="image/*" multiple onChange={handleImagesChange} />
                    <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-[9px] font-black uppercase">הוסף</span>
                  </label>
                  <div className="w-full text-[10px] text-slate-400 font-bold mt-2">או הדבק צילום מסך מהמחשב (Ctrl+V / ⌘+V) בתוך החלון</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">כותרת</label>
                  <input 
                    type="text"
                    placeholder="למשל: דירת 4 חדרים מדהימה"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl p-3 md:p-4 text-slate-800 font-bold focus:border-indigo-500 focus:bg-white outline-none transition-all"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">רחוב</label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="רחוב ומספר"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl p-3 md:p-4 text-slate-800 font-bold focus:border-indigo-500 focus:bg-white outline-none transition-all"
                    />
                    <button onClick={handleFindAddress} className="px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold">מצא</button>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">עיר</label>
                  <input 
                    type="text"
                    placeholder="עיר"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl p-3 md:p-4 text-slate-800 font-bold focus:border-indigo-500 focus:bg-white outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">מחיר (₪)</label>
                  <input 
                    type="number"
                    placeholder="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl p-3 md:p-4 text-indigo-600 font-black focus:border-indigo-500 focus:bg-white outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">חדרים</label>
                  <input 
                    type="text"
                    placeholder="3.5"
                    value={rooms}
                    onChange={(e) => setRooms(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl p-3 md:p-4 text-slate-800 font-bold focus:border-indigo-500 focus:bg-white outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">טלפון</label>
                  <input 
                    type="tel"
                    placeholder="05x-xxxxxxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl p-3 md:p-4 text-slate-800 font-bold focus:border-indigo-500 focus:bg-white outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">קישור</label>
                  <input 
                    type="text"
                    placeholder="הדבקו לינק"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl md:rounded-2xl p-3 md:p-4 text-slate-800 font-bold focus:border-indigo-500 focus:bg-white outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-2">
                <button 
                  onClick={handleFinalSave}
                  className="flex-1 bg-indigo-600 text-white font-black py-4 md:py-5 rounded-xl md:rounded-2xl shadow-xl hover:bg-indigo-700 transition-all active:scale-95 text-base md:text-lg"
                >
                  שמור מודעה
                </button>
                <button 
                  onClick={resetForm}
                  className="px-6 md:px-8 bg-slate-100 text-slate-500 font-black py-4 md:py-5 rounded-xl md:rounded-2xl hover:bg-slate-200 transition-all"
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
