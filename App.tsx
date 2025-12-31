import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { extractCardData } from './services/geminiService';
import { BusinessCard, ViewState, AppSettings } from './types';
import { downloadVCard, shareCard, sendSMS, fileToBase64, sendToGoogleSheet, downloadCSV, backupToSheet, restoreFromSheet, testSheetConnection } from './services/exportService';
import { CameraIcon, PlusIcon, PhoneIcon, ShareIcon, SettingsIcon, ChevronLeftIcon, SheetIcon, ChatIcon, LinkIcon, SearchIcon, BellIcon, UserGroupIcon, MenuIcon } from './components/Icons';

const TARGET_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbyX9Ar8el5BpWNDjqaKQQjFiRq1kGJB3dpJ0uZIrXL1gJXrwukQXodUXdiCCBl8pGXw/exec";

const resizeImage = (base64Str: string, maxWidth = 800): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${base64Str}`;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scaleSize = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * scaleSize;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      // Use higher quality for OCR accuracy (0.85)
      const resizedBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      resolve(resizedBase64);
    };
    img.onerror = () => resolve("");
  });
};

function App() {
  const [cards, setCards] = useState<BusinessCard[]>([]);
  const [view, setView] = useState<ViewState>(ViewState.LIST);
  const [selectedCard, setSelectedCard] = useState<BusinessCard | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tempData, setTempData] = useState<Partial<BusinessCard> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isInitialMount = useRef(true);

  const mapFields = (item: any): BusinessCard => {
    const findValue = (possibleKeys: string[]) => {
      const keysInItem = Object.keys(item);
      for (const pKey of possibleKeys) {
        const foundKey = keysInItem.find(k => k.toLowerCase() === pKey.toLowerCase());
        if (foundKey && item[foundKey] !== undefined && item[foundKey] !== null) {
          return String(item[foundKey]).trim();
        }
      }
      return '';
    };

    const parseDate = (val: any) => {
      if (!val) return new Date().toISOString();
      const d = new Date(val);
      return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    };

    return {
      id: findValue(['id', 'uuid', 'A']) || uuidv4(),
      name: findValue(['name', 'Name', 'B', '이름']) || '이름 없음',
      jobTitle: findValue(['jobTitle', 'Title', 'C', '직책']),
      company: findValue(['company', 'Company', 'D', '회사']),
      phone: findValue(['phone', 'Phone', 'E', '전화']),
      email: findValue(['email', 'Email', 'F', '이메일']),
      address: findValue(['address', 'Address', 'G', '주소']),
      website: findValue(['website', 'Website', 'H', '웹사이트']),
      scannedAt: parseDate(findValue(['date', 'Date', 'scannedAt', 'I', '등록일'])),
      notes: findValue(['notes', 'Notes', '메모', 'J']),
      imageUrl: item.imageUrl || item.Image || undefined
    };
  };

  const autoSync = async () => {
    setIsLoading(true);
    try {
      const rawData = await restoreFromSheet(TARGET_WEBAPP_URL);
      if (Array.isArray(rawData)) {
        const sanitized = rawData.map(mapFields);
        setCards(sanitized);
        localStorage.setItem('smartcards', JSON.stringify(sanitized));
      }
    } catch (e) {
      console.error("Auto-Sync failed:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const savedCards = localStorage.getItem('smartcards');
    if (savedCards) {
      try {
        setCards(JSON.parse(savedCards));
      } catch(e) { console.error(e); }
    }
    autoSync();
  }, []);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    localStorage.setItem('smartcards', JSON.stringify(cards));
  }, [cards]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setIsProcessing(true);
      try {
        const fullBase64 = await fileToBase64(file);
        // Use a slightly larger resize for better OCR detail
        const ocrImageBase64 = await resizeImage(fullBase64, 1024);
        const displayImageBase64 = await resizeImage(fullBase64, 400);
        
        const extractedData = await extractCardData(ocrImageBase64);
        
        setTempData({
          ...extractedData,
          id: uuidv4(),
          scannedAt: new Date().toISOString(),
          imageUrl: displayImageBase64 // Store smaller version for UI
        });
        setView(ViewState.EDIT);
      } catch (err) {
        alert("명함 정보를 읽는 데 실패했습니다. 다시 시도해 주세요.");
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const saveCard = () => {
    if (tempData) {
      const newCard = tempData as BusinessCard;
      if (!selectedCard) setCards([newCard, ...cards]);
      else setCards(cards.map(c => c.id === newCard.id ? newCard : c));
      setTempData(null);
      setSelectedCard(null);
      setView(ViewState.LIST);
    }
  };

  const getGroupedCards = () => {
    const query = searchQuery.toLowerCase();
    const filtered = cards.filter(c => 
      c.name.toLowerCase().includes(query) || 
      c.company.toLowerCase().includes(query)
    );

    const groups: { [key: string]: BusinessCard[] } = { '오늘': [], '최근': [], '이전': [] };
    const today = new Date().setHours(0,0,0,0);
    const weekAgo = today - (7 * 86400000);

    filtered.forEach(card => {
      const date = new Date(card.scannedAt).getTime();
      if (date >= today) groups['오늘'].push(card);
      else if (date >= weekAgo) groups['최근'].push(card);
      else groups['이전'].push(card);
    });
    return groups;
  };

  const renderList = () => {
    const grouped = getGroupedCards();
    return (
      <div className="bg-[#f3f4f6] min-h-screen pb-24">
        <header className="sticky top-0 z-20 bg-[#2d2d2d] text-white shadow-md">
          <div className="flex justify-between items-center px-4 h-14">
            <div className="text-xl font-bold tracking-tight text-[#00c7ae]">SmartCard AI</div>
            <div className="flex gap-4">
              <button onClick={autoSync} className="text-gray-300 active:text-white p-1">
                <PlusIcon className={`w-6 h-6 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setView(ViewState.SETTINGS)} className="p-1">
                <MenuIcon className="w-6 h-6 text-gray-300" />
              </button>
            </div>
          </div>
          <div className="px-3 pb-3">
            <div className="bg-white/10 rounded-lg flex items-center px-3 h-10 border border-white/10">
              <SearchIcon className="w-5 h-5 text-gray-400 mr-2" />
              <input 
                type="text" 
                placeholder="이름이나 회사 검색..."
                className="flex-1 bg-transparent outline-none text-white text-sm placeholder-gray-400"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </header>

        {cards.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-[70vh] text-gray-400">
            <CameraIcon className="w-16 h-16 mb-4 opacity-20" />
            <p className="font-medium">저장된 명함이 없습니다.</p>
            <p className="text-xs mt-1">우측 하단 버튼으로 촬영을 시작하세요.</p>
          </div>
        ) : (
          <div className="animate-fade-in">
            {Object.entries(grouped).map(([label, groupCards]) => (
              groupCards.length > 0 && (
                <div key={label} className="mt-4">
                  <div className="px-4 py-1 text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</div>
                  <div className="bg-white border-y border-gray-200 divide-y divide-gray-100">
                    {groupCards.map(card => (
                      <div key={card.id} onClick={() => { setSelectedCard(card); setView(ViewState.EDIT); }} className="flex p-4 gap-4 active:bg-gray-50 cursor-pointer">
                        <div className="w-20 h-12 bg-gray-100 rounded overflow-hidden flex-shrink-0 border border-gray-200">
                          {card.imageUrl ? <img src={`data:image/jpeg;base64,${card.imageUrl}`} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><CameraIcon className="w-5 h-5" /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="font-bold text-gray-900 truncate">{card.name}</span>
                            <span className="text-xs text-gray-500 truncate">{card.jobTitle}</span>
                          </div>
                          <div className="text-sm text-[#00c7ae] font-medium truncate">{card.company}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>
        )}

        <div className="fixed bottom-8 right-6 z-30">
          <label className="flex flex-col items-center justify-center w-16 h-16 bg-[#00c7ae] text-white rounded-full shadow-2xl cursor-pointer hover:scale-110 active:scale-95 transition-all">
            <input type="file" accept="image/*" capture="environment" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            {isProcessing ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <CameraIcon className="w-8 h-8" />}
          </label>
        </div>
      </div>
    );
  };

  const renderEdit = () => {
    const data = (selectedCard || tempData) as BusinessCard;
    if (!data) return null;

    return (
      <div className="min-h-screen bg-white flex flex-col">
        <header className="h-14 bg-[#2d2d2d] text-white px-4 flex justify-between items-center sticky top-0 z-30">
          <button onClick={() => { setView(ViewState.LIST); setSelectedCard(null); setTempData(null); }} className="flex items-center gap-1"><ChevronLeftIcon className="w-5 h-5" /> 목록</button>
          <div className="font-bold">명함 정보 확인</div>
          <button onClick={saveCard} className="text-[#00c7ae] font-bold">저장</button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div className="bg-gray-100 rounded-xl overflow-hidden shadow-inner flex justify-center p-4">
            {data.imageUrl ? <img src={`data:image/jpeg;base64,${data.imageUrl}`} className="max-h-48 rounded shadow-md" /> : <div className="h-32 flex items-center text-gray-300 font-bold uppercase tracking-widest">No Image</div>}
          </div>
          {selectedCard && (
            <div className="grid grid-cols-4 gap-2">
              <a href={`tel:${data.phone}`} className="flex flex-col items-center p-3 bg-gray-50 rounded-xl border border-gray-100 active:bg-gray-200">
                <PhoneIcon className="w-5 h-5 text-green-600 mb-1" />
                <span className="text-[10px] font-bold text-gray-600">통화</span>
              </a>
              <button onClick={() => sendSMS(data)} className="flex flex-col items-center p-3 bg-gray-50 rounded-xl border border-gray-100 active:bg-gray-200">
                <ChatIcon className="w-5 h-5 text-blue-500 mb-1" />
                <span className="text-[10px] font-bold text-gray-600">메시지</span>
              </button>
              <button onClick={() => downloadVCard(data)} className="flex flex-col items-center p-3 bg-gray-50 rounded-xl border border-gray-100 active:bg-gray-200">
                <PlusIcon className="w-5 h-5 text-purple-600 mb-1" />
                <span className="text-[10px] font-bold text-gray-600">연락처</span>
              </button>
              <button onClick={() => shareCard(data)} className="flex flex-col items-center p-3 bg-gray-50 rounded-xl border border-gray-100 active:bg-gray-200">
                <ShareIcon className="w-5 h-5 text-orange-500 mb-1" />
                <span className="text-[10px] font-bold text-gray-600">공유</span>
              </button>
            </div>
          )}
          <div className="space-y-4">
            {[
              { label: '이름', key: 'name' },
              { label: '회사', key: 'company' },
              { label: '직책', key: 'jobTitle' },
              { label: '전화', key: 'phone' },
              { label: '이메일', key: 'email' },
              { label: '주소', key: 'address' },
              { label: '웹사이트', key: 'website' },
              { label: '메모', key: 'notes' }
            ].map((field) => (
              <div key={field.key} className="space-y-1">
                <label className="text-[11px] font-bold text-gray-400 uppercase ml-1">{field.label}</label>
                {field.key === 'notes' ? (
                  <textarea 
                    value={(data as any)[field.key] || ''} 
                    onChange={e => setTempData({...data, [field.key]: e.target.value})} 
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#00c7ae] h-24 text-sm" 
                  />
                ) : (
                  <input 
                    type="text" 
                    value={(data as any)[field.key] || ''} 
                    onChange={e => setTempData({...data, [field.key]: e.target.value})} 
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-[#00c7ae] text-sm" 
                  />
                )}
              </div>
            ))}
            {selectedCard && (
              <button 
                onClick={() => { if(confirm('이 명함을 삭제할까요?')) { setCards(cards.filter(c => c.id !== data.id)); setView(ViewState.LIST); } }} 
                className="w-full py-4 text-red-500 font-bold"
              >
                명함 삭제
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="min-h-screen bg-gray-50">
      <header className="h-14 bg-[#2d2d2d] text-white px-4 flex items-center gap-4">
        <button onClick={() => setView(ViewState.LIST)}><ChevronLeftIcon className="w-6 h-6" /></button>
        <span className="font-bold">설정</span>
      </header>
      <div className="p-6 space-y-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="font-bold mb-4 flex items-center gap-2 text-gray-800"><SheetIcon className="w-5 h-5 text-green-600" /> 구글 시트 연동</h2>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">연동된 Web App URL</p>
            <code className="block p-3 bg-gray-50 rounded-lg text-[10px] break-all border border-gray-100 text-gray-600 leading-relaxed">{TARGET_WEBAPP_URL}</code>
            <div className="bg-green-50 p-3 rounded-lg border border-green-100">
              <p className="text-[11px] text-green-700 font-medium">※ 시트 구조 안내 (B열부터):</p>
              <p className="text-[10px] text-green-600 mt-1">Name | Title | Company | Phone | Email | Address | Website | Date</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="font-bold mb-4 text-gray-800">데이터 관리</h2>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => backupToSheet(cards, TARGET_WEBAPP_URL)} className="p-4 bg-blue-50 text-blue-700 rounded-xl text-center active:bg-blue-100 transition-colors">
              <div className="text-xl mb-1">📤</div>
              <div className="text-xs font-bold">전체 백업</div>
              <p className="text-[9px] mt-1 opacity-70">폰 → 시트</p>
            </button>
            <button onClick={autoSync} className="p-4 bg-orange-50 text-orange-700 rounded-xl text-center active:bg-orange-100 transition-colors">
              <div className="text-xl mb-1">🔄</div>
              <div className="text-xs font-bold">동기화</div>
              <p className="text-[9px] mt-1 opacity-70">시트 → 폰</p>
            </button>
          </div>
          <button onClick={() => downloadCSV(cards)} className="w-full mt-3 p-3 bg-gray-100 text-gray-700 rounded-xl font-bold text-xs flex items-center justify-center gap-2 active:bg-gray-200">
            <SheetIcon className="w-4 h-4" /> CSV 파일 다운로드
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto shadow-2xl min-h-screen bg-white relative no-scrollbar overflow-x-hidden">
      {isLoading && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white px-6 py-4 rounded-2xl shadow-2xl flex flex-col items-center animate-fade-in">
            <div className="w-10 h-10 border-4 border-[#00c7ae] border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-sm font-bold text-gray-700">시트와 동기화 중...</p>
          </div>
        </div>
      )}
      {view === ViewState.LIST && renderList()}
      {view === ViewState.EDIT && renderEdit()}
      {view === ViewState.SETTINGS && renderSettings()}
    </div>
  );
}

export default App;