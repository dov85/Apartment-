
import React, { useState, useEffect, useRef } from 'react';
import { Property, PropertyStatus } from './types.ts';
import PropertyCard from './components/PropertyCard.tsx';

const SYNC_SERVICE_URL = 'https://api.keyvalue.xyz'; 

const App: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [showMobileLink, setShowMobileLink] = useState(false);
  const [syncCode, setSyncCode] = useState<string>(localStorage.getItem('syncCode') || '');
  const [isSyncing, setIsSyncing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  
  // Manual form states
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [price, setPrice] = useState('');
  const [rooms, setRooms] = useState('');
  const [phone, setPhone] = useState('');
  const [link, setLink] = useState('');

  const pollInterval = useRef<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem('apartments');
    if (saved) setProperties(JSON.parse(saved));
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

  const saveProperties = (newProps: Property[]) => {
    setProperties(newProps);
    localStorage.setItem('apartments', JSON.stringify(newProps));
    if (syncCode) pushDataToRemote(syncCode, newProps);
  };

  const handleImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setImagePreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleFinalSave = () => {
    const newProp: Property = {
      id: Date.now().toString(),
      title: title || 'דירה חדשה',
      address: address || '',
      price: parseInt(price) || 0,
      phone: phone || '',
      rooms: rooms || '',
      images: imagePreviews,
      link: link || '',
      status: PropertyStatus.NEW,
      createdAt: Date.now(),
    };

    const updated = [newProp, ...properties];
    saveProperties(updated);
    resetForm();
  };

  const resetForm = () => {
    setIsAdding(false);
    setImagePreviews([]);
    setTitle('');
    setAddress('');
    setPrice('');
    setRooms('');
    setPhone('');
    setLink('');
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
    const updated = properties.filter(p => p.id !== id);
    saveProperties(updated);
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
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-6">
        {properties.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
            {properties.map(property => (
              <PropertyCard 
                key={property.id} 
                property={property} 
                onStatusChange={updateStatus}
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
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-50 flex items-center justify-center p-4 overflow-y-auto">
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
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 px-1">כתובת</label>
                  <input 
                    type="text"
                    placeholder="רחוב, עיר..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
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
