import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { extractCardData } from './services/geminiService';
import { BusinessCard, ViewState, AppSettings } from './types';
import { downloadVCard, shareCard, sendSMS, fileToBase64, sendToGoogleSheet, downloadCSV, backupToSheet, restoreFromSheet, testSheetConnection } from './services/exportService';
import { CameraIcon, PlusIcon, PhoneIcon, ShareIcon, SettingsIcon, ChevronLeftIcon, SheetIcon, ChatIcon, LinkIcon, SearchIcon, BellIcon, UserGroupIcon, MenuIcon } from './components/Icons';

// Helper to resize image for storage (create thumbnail)
const resizeImage = (base64Str: string, maxWidth = 400): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${base64Str}`;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scaleSize = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * scaleSize;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      const resizedBase64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1]; // Lower quality for better storage
      resolve(resizedBase64);
    };
  });
};

function App() {
  // State
  const [cards, setCards] = useState<BusinessCard[]>([]);
  const [view, setView] = useState<ViewState>(ViewState.LIST);
  const [selectedCard, setSelectedCard] = useState<BusinessCard | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tempData, setTempData] = useState<Partial<BusinessCard> | null>(null);
  const [settings, setSettings] = useState<AppSettings>({ googleSheetWebhookUrl: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [testStatus, setTestStatus] = useState<{success: boolean, msg: string} | null>(null);
  
  // Restore Debug State
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreReport, setRestoreReport] = useState<{ total: number; sample?: BusinessCard } | null>(null);
  
  // This is the sheet URL provided by the user
  const TARGET_SHEET_URL = "https://docs.google.com/spreadsheets/d/1htCJZHxYxM2ocK5YnpFTB86nloeKYycCViWvzCqWLck/edit?gid=0#gid=0";

  // Ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load data on mount
  useEffect(() => {
    const savedCards = localStorage.getItem('smartcards');
    const savedSettings = localStorage.getItem('smartcard_settings');
    if (savedCards) {
      setCards(JSON.parse(savedCards));
    }
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  // Save data on change
  useEffect(() => {
    try {
      localStorage.setItem('smartcards', JSON.stringify(cards));
    } catch (e) {
      setErrorMessage("저장 공간이 부족합니다. 불필요한 명함을 삭제해주세요.");
    }
  }, [cards]);

  useEffect(() => {
    localStorage.setItem('smartcard_settings', JSON.stringify(settings));
  }, [settings]);

  // Handlers
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setIsProcessing(true);
      setErrorMessage(null);
      try {
        const fullBase64 = await fileToBase64(file);
        // Resize for storage to avoid localStorage limits
        const thumbBase64 = await resizeImage(fullBase64);
        
        const data = await extractCardData(fullBase64);
        setTempData({
          ...data,
          id: uuidv4(),
          scannedAt: new Date().toISOString(),
          imageUrl: thumbBase64
        });
        setView(ViewState.EDIT);
      } catch (err) {
        setErrorMessage("명함을 읽는데 실패했습니다. 다시 시도해주세요.");
      } finally {
        setIsProcessing(false);
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const saveCard = () => {
    if (tempData) {
      const newCard = tempData as BusinessCard;
      if (!selectedCard) {
        // Create
        setCards([newCard, ...cards]);
      } else {
        // Update
        setCards(cards.map(c => c.id === newCard.id ? newCard : c));
      }
      setTempData(null);
      setSelectedCard(null);
      setView(ViewState.LIST);
    }
  };

  const deleteCard = (id: string) => {
    if(confirm('정말 삭제하시겠습니까?')) {
      setCards(cards.filter(c => c.id !== id));
      setSelectedCard(null);
      setView(ViewState.LIST);
    }
  };

  const handleExportSheet = async (card: BusinessCard) => {
    if (!settings.googleSheetWebhookUrl) {
      if(confirm("구글 시트 연동 설정이 필요합니다. 설정 페이지로 이동하시겠습니까?")) {
        setView(ViewState.SETTINGS);
      }
      return;
    }
    const success = await sendToGoogleSheet(card, settings.googleSheetWebhookUrl);
    if (success) alert("구글 시트로 전송되었습니다.");
    else alert("전송에 실패했습니다. Webhook URL을 확인해주세요.");
  };

  const handleBackup = async () => {
    if (!settings.googleSheetWebhookUrl) {
      alert("설정에서 Web App URL을 먼저 입력해주세요.");
      return;
    }
    if (!confirm("현재 저장된 모든 명함을 구글 시트로 백업하시겠습니까? \n(기존 시트 데이터는 덮어씌워집니다)")) return;

    setIsLoading(true);
    const success = await backupToSheet(cards, settings.googleSheetWebhookUrl);
    setIsLoading(false);

    if (success) alert("백업 요청이 완료되었습니다. 잠시 후 시트를 확인해주세요.");
    else alert("백업에 실패했습니다. URL을 확인하거나 잠시 후 다시 시도해주세요.");
  };

  const handleRestore = async () => {
    if (!settings.googleSheetWebhookUrl) {
      alert("설정에서 Web App URL을 먼저 입력해주세요.");
      return;
    }
    if (!confirm("구글 시트 데이터를 불러와 현재 데이터를 덮어씁니다.\n진행하시겠습니까?")) return;

    setIsLoading(true);
    try {
      const rawCards = await restoreFromSheet(settings.googleSheetWebhookUrl);
      
      // Data Sanitization and Transformation
      const sanitizedCards: BusinessCard[] = rawCards.map((c: any) => {
         // Fix Invalid Date Issue
         let dateStr = c.scannedAt;
         if (!dateStr || isNaN(Date.parse(dateStr))) {
            dateStr = new Date().toISOString();
         }

         return {
           id: c.id || uuidv4(),
           name: c.name || '이름 없음',
           jobTitle: c.jobTitle || '',
           company: c.company || '',
           phone: c.phone || '',
           email: c.email || '',
           address: c.address || '',
           website: c.website || '',
           scannedAt: dateStr,
           notes: c.notes || '',
           imageUrl: c.imageUrl || undefined // Image might be empty on sheet
         };
      });

      if (sanitizedCards.length > 0) {
        setCards(sanitizedCards);
        // Show Report Modal
        setRestoreReport({
           total: sanitizedCards.length,
           sample: sanitizedCards[0]
        });
        setShowRestoreModal(true);
      } else {
        alert("성공적으로 연결되었으나 시트에 데이터가 없습니다.");
      }
    } catch (e: any) {
      console.error(e);
      let msg = "데이터를 불러오는데 실패했습니다.";
      if (e.message) msg += `\n\n오류 내용: ${e.message}`;
      msg += "\n\nTip: Apps Script 배포 시 '새 배포'를 했는지 확인하세요.";
      alert(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTestStatus(null);
    if (!settings.googleSheetWebhookUrl) {
      setTestStatus({ success: false, msg: "URL을 입력해주세요." });
      return;
    }
    setIsLoading(true);
    const result = await testSheetConnection(settings.googleSheetWebhookUrl);
    setTestStatus({ success: result.success, msg: result.message });
    setIsLoading(false);
  };

  // Group cards by date
  const getGroupedCards = () => {
    const filtered = cards.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.company.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const groups: { [key: string]: BusinessCard[] } = {
      '오늘': [],
      '어제': [],
      '일주일 전': [],
      '이전': []
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const weekAgo = today - 86400000 * 7;

    filtered.forEach(card => {
      // Validate date
      const timestamp = Date.parse(card.scannedAt);
      const cardDate = isNaN(timestamp) ? 0 : timestamp; // Fallback to 0 (oldest) if invalid

      if (cardDate >= today) groups['오늘'].push(card);
      else if (cardDate >= yesterday) groups['어제'].push(card);
      else if (cardDate >= weekAgo) groups['일주일 전'].push(card);
      else groups['이전'].push(card);
    });

    return groups;
  };

  const renderRestoreModal = () => {
    if (!showRestoreModal || !restoreReport) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
          <div className="bg-[#00c7ae] p-4 text-white text-center">
            <h3 className="font-bold text-lg">복원 완료 리포트</h3>
          </div>
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="text-4xl font-bold text-gray-800 mb-1">{restoreReport.total}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">불러온 명함 개수</div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-3 text-xs border border-gray-100 mb-6">
              <p className="font-bold text-gray-600 mb-2 border-b border-gray-200 pb-1">첫 번째 데이터 샘플</p>
              {restoreReport.sample ? (
                <div className="space-y-1 text-gray-600">
                  <p><span className="text-gray-400">이름:</span> {restoreReport.sample.name}</p>
                  <p><span className="text-gray-400">회사:</span> {restoreReport.sample.company}</p>
                  <p><span className="text-gray-400">날짜:</span> {new Date(restoreReport.sample.scannedAt).toLocaleDateString()}</p>
                </div>
              ) : (
                <p className="text-gray-400 italic">샘플 데이터 없음</p>
              )}
            </div>

            <button 
              onClick={() => { setShowRestoreModal(false); setView(ViewState.LIST); }}
              className="w-full bg-[#333] text-white font-bold py-3 rounded-lg hover:bg-black transition-colors"
            >
              확인 (목록 보기)
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderList = () => {
    const grouped = getGroupedCards();
    const hasCards = cards.length > 0;

    return (
      <div className="bg-[#f0f0f0] min-h-screen pb-24 font-sans">
        {/* Dark Header */}
        <header className="sticky top-0 z-20 bg-[#3a3a3a] text-white">
          <div className="flex justify-between items-center px-4 h-14">
             <div className="text-xl font-serif italic font-bold tracking-wide">SmartCard</div>
             <div className="flex items-center gap-4 text-gray-300">
               <UserGroupIcon className="w-6 h-6" />
               <BellIcon className="w-6 h-6" />
               <button onClick={() => setView(ViewState.SETTINGS)}>
                 <MenuIcon className="w-6 h-6" />
               </button>
             </div>
          </div>
          
          {/* Search Bar Strip */}
          <div className="bg-[#4a4a4a] px-3 py-2 flex gap-2">
            <div className="flex-1 bg-white rounded flex items-center px-2 h-9">
              <SearchIcon className="w-5 h-5 text-gray-400 mr-2" />
              <input 
                type="text" 
                placeholder="이름, 소속, 직책 등 키워드로 검색"
                className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="bg-[#3a3a3a] text-gray-300 px-3 text-xs rounded border border-gray-600 whitespace-nowrap">
              등록일순 ▼
            </button>
          </div>
        </header>

        {!hasCards ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center px-6">
            <div className="bg-gray-200 p-6 rounded-full mb-6">
              <CameraIcon className="w-12 h-12 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-700 mb-2">명함을 추가해보세요</h2>
            <p className="text-gray-500 text-sm max-w-xs">우측 하단 카메라 버튼을 눌러 명함을 촬영하면 자동으로 정보가 입력됩니다.</p>
          </div>
        ) : (
          <div className="pt-2">
            {Object.entries(grouped).map(([label, groupCards]) => {
              if (groupCards.length === 0) return null;
              return (
                <div key={label}>
                  <div className="px-4 py-2 text-xs text-gray-500 bg-[#f0f0f0] font-medium">{label}</div>
                  <ul className="bg-white border-t border-b border-gray-200 divide-y divide-gray-100">
                    {groupCards.map(card => (
                      <li key={card.id} 
                          onClick={() => { setSelectedCard(card); setView(ViewState.EDIT); }}
                          className="flex p-3 gap-3 active:bg-gray-50 cursor-pointer">
                        
                        {/* Card Image Thumbnail */}
                        <div className="w-24 h-14 bg-gray-100 border border-gray-200 flex-shrink-0 rounded overflow-hidden relative">
                          {card.imageUrl ? (
                            <img src={`data:image/jpeg;base64,${card.imageUrl}`} alt="Card" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                              <CameraIcon className="w-6 h-6" />
                            </div>
                          )}
                        </div>

                        {/* Card Details */}
                        <div className="flex-1 flex flex-col justify-center min-w-0">
                          <div className="flex items-end gap-2 mb-0.5">
                            <h3 className="font-bold text-gray-900 text-lg leading-none truncate">{card.name}</h3>
                            <span className="text-xs text-gray-500 truncate pb-0.5">{card.jobTitle}</span>
                          </div>
                          <div className="text-[#00c7ae] text-sm font-medium truncate">{card.company}</div>
                        </div>

                        {/* Right Actions/Icons */}
                        {card.website && (
                           <div className="flex items-center">
                              <div className="bg-green-100 text-green-600 text-[10px] px-1.5 py-0.5 rounded font-bold">LINK</div>
                           </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {/* Teal FAB */}
        <div className="fixed bottom-6 right-6 z-20">
          <label className="flex flex-col items-center justify-center w-16 h-16 bg-[#00c7ae] text-white rounded-full shadow-lg shadow-teal-500/30 cursor-pointer hover:bg-[#00b59f] transition-all hover:scale-105 active:scale-95">
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            {isProcessing ? (
               <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <CameraIcon className="w-7 h-7 mb-0.5" />
                <span className="text-[9px] font-bold">명함촬영</span>
              </>
            )}
          </label>
        </div>
      </div>
    );
  };

  const renderEdit = () => {
    const data = (selectedCard || tempData) as BusinessCard;
    if (!data) return null;

    return (
      <div className="min-h-screen bg-white animate-in slide-in-from-bottom-5 duration-300 flex flex-col">
        {/* Edit Header */}
        <header className="sticky top-0 z-10 bg-[#3a3a3a] text-white border-b border-gray-600 px-4 h-14 flex justify-between items-center">
          <button onClick={() => { setView(ViewState.LIST); setTempData(null); setSelectedCard(null); }} className="p-2 -ml-2 text-white">
             <div className="flex items-center gap-1 font-medium"><ChevronLeftIcon className="w-5 h-5" /> 뒤로</div>
          </button>
          <div className="font-semibold">{selectedCard ? '상세 정보' : '새 명함'}</div>
          <button onClick={saveCard} className="text-[#00c7ae] font-bold px-2 py-1">저장</button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Top Card Visual Area */}
          <div className="bg-[#4a4a4a] p-6 flex justify-center items-center shadow-inner min-h-[200px]">
            {data.imageUrl ? (
               <img src={`data:image/jpeg;base64,${data.imageUrl}`} className="max-w-full max-h-[220px] rounded shadow-lg object-contain bg-white" alt="card" />
            ) : (
               <div className="w-full max-w-sm aspect-[1.58] bg-white/10 rounded border border-white/20 flex items-center justify-center text-white/50">
                 이미지 없음
               </div>
            )}
          </div>

          <div className="p-5 space-y-6 max-w-lg mx-auto pb-32">
            {/* Quick Actions Bar */}
            {selectedCard && (
              <div className="grid grid-cols-5 gap-2 mb-6">
                <a href={`tel:${data.phone}`} className="flex flex-col items-center gap-1 p-2 bg-gray-50 rounded-lg border border-gray-100 hover:bg-green-50 active:bg-green-100 transition-colors">
                  <PhoneIcon className="w-5 h-5 text-green-600" />
                  <span className="text-[10px] text-gray-600 font-medium">전화</span>
                </a>
                <button onClick={() => sendSMS(data)} className="flex flex-col items-center gap-1 p-2 bg-gray-50 rounded-lg border border-gray-100 hover:bg-yellow-50 active:bg-yellow-100 transition-colors">
                  <ChatIcon className="w-5 h-5 text-yellow-600" />
                  <span className="text-[10px] text-gray-600 font-medium">문자</span>
                </button>
                <button onClick={() => shareCard(data)} className="flex flex-col items-center gap-1 p-2 bg-gray-50 rounded-lg border border-gray-100 hover:bg-blue-50 active:bg-blue-100 transition-colors">
                  <ShareIcon className="w-5 h-5 text-blue-600" />
                  <span className="text-[10px] text-gray-600 font-medium">공유</span>
                </button>
                <button onClick={() => downloadVCard(data)} className="flex flex-col items-center gap-1 p-2 bg-gray-50 rounded-lg border border-gray-100 hover:bg-purple-50 active:bg-purple-100 transition-colors">
                  <PlusIcon className="w-5 h-5 text-purple-600" />
                  <span className="text-[10px] text-gray-600 font-medium">연락처</span>
                </button>
                 <button onClick={() => handleExportSheet(data)} className="flex flex-col items-center gap-1 p-2 bg-gray-50 rounded-lg border border-gray-100 hover:bg-green-50 active:bg-green-100 transition-colors">
                  <SheetIcon className="w-5 h-5 text-green-600" />
                  <span className="text-[10px] text-gray-600 font-medium">시트저장</span>
                </button>
              </div>
            )}

            {/* Fields */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">이름</label>
                <input
                  type="text"
                  value={data.name || ''}
                  onChange={e => setTempData({ ...data, name: e.target.value })}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-[#00c7ae] focus:ring-1 focus:ring-[#00c7ae] outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 uppercase">직책</label>
                  <input
                    type="text"
                    value={data.jobTitle || ''}
                    onChange={e => setTempData({ ...data, jobTitle: e.target.value })}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-[#00c7ae] focus:ring-1 focus:ring-[#00c7ae] outline-none transition-all"
                  />
                </div>
                <div className="space-y-1">
                   <label className="text-xs font-semibold text-gray-500 uppercase">회사</label>
                  <input
                    type="text"
                    value={data.company || ''}
                    onChange={e => setTempData({ ...data, company: e.target.value })}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-[#00c7ae] focus:ring-1 focus:ring-[#00c7ae] outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">전화번호</label>
                <div className="relative">
                  <input
                    type="tel"
                    value={data.phone || ''}
                    onChange={e => setTempData({ ...data, phone: e.target.value })}
                    className="w-full p-3 pl-10 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-[#00c7ae] focus:ring-1 focus:ring-[#00c7ae] outline-none transition-all"
                  />
                  <PhoneIcon className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">이메일</label>
                <input
                  type="email"
                  value={data.email || ''}
                  onChange={e => setTempData({ ...data, email: e.target.value })}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-[#00c7ae] focus:ring-1 focus:ring-[#00c7ae] outline-none transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">주소</label>
                <input
                  type="text"
                  value={data.address || ''}
                  onChange={e => setTempData({ ...data, address: e.target.value })}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-[#00c7ae] focus:ring-1 focus:ring-[#00c7ae] outline-none transition-all"
                />
              </div>
              
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">웹사이트</label>
                 <div className="relative">
                  <input
                    type="text"
                    value={data.website || ''}
                    onChange={e => setTempData({ ...data, website: e.target.value })}
                    className="w-full p-3 pl-10 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-[#00c7ae] focus:ring-1 focus:ring-[#00c7ae] outline-none transition-all"
                  />
                   <LinkIcon className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
                 </div>
              </div>

               <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">메모</label>
                <textarea
                  value={data.notes || ''}
                  onChange={e => setTempData({ ...data, notes: e.target.value })}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-[#00c7ae] focus:ring-1 focus:ring-[#00c7ae] outline-none transition-all h-24 resize-none"
                />
              </div>

              {selectedCard && (
                <div className="pt-6 border-t border-gray-100">
                  <button onClick={() => deleteCard(data.id)} className="w-full py-3 text-red-500 font-medium rounded-lg hover:bg-red-50 transition-colors">
                    명함 삭제
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-[#3a3a3a] text-white p-4 flex items-center sticky top-0 z-10 h-14">
          <button onClick={() => setView(ViewState.LIST)} className="mr-4">
            <ChevronLeftIcon className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold">설정</h1>
        </header>
        
        <div className="max-w-md mx-auto p-4 space-y-6">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
             <div className="flex items-center justify-between mb-4">
               <h2 className="font-bold flex items-center gap-2">
                 <SheetIcon className="w-5 h-5 text-green-600" />
                 구글 시트 연동
               </h2>
               <a 
                 href={TARGET_SHEET_URL} 
                 target="_blank" 
                 rel="noreferrer"
                 className="text-xs text-blue-600 underline"
               >
                 내 시트 열기
               </a>
             </div>
             
             <div className="space-y-2">
               <label className="text-xs text-gray-500 block">
                 Apps Script Web App URL
               </label>
               <div className="flex gap-2">
                 <input 
                   type="text" 
                   value={settings.googleSheetWebhookUrl}
                   onChange={(e) => {
                     setSettings({...settings, googleSheetWebhookUrl: e.target.value});
                     setTestStatus(null);
                   }}
                   placeholder="https://script.google.com/..."
                   className="flex-1 p-2 border rounded text-sm bg-gray-50 focus:bg-white outline-none focus:ring-1 focus:ring-[#00c7ae]"
                 />
                 <button 
                   onClick={handleTestConnection}
                   disabled={isLoading}
                   className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700 whitespace-nowrap disabled:opacity-50"
                 >
                   {isLoading ? '...' : '연동확인'}
                 </button>
               </div>

               {/* URL Validation Warning */}
               {settings.googleSheetWebhookUrl && !settings.googleSheetWebhookUrl.includes('script.google.com') && (
                 <p className="text-xs text-red-500 font-medium mt-1">
                   ⚠️ 구글 시트 주소가 아닌 '스크립트 배포 URL'을 입력해야 합니다.
                 </p>
               )}

               {/* Connection Test Result */}
               {testStatus && (
                 <div className={`text-xs p-2 rounded mt-2 border ${testStatus.success ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                   {testStatus.success ? '✅ ' : '❌ '}{testStatus.msg}
                 </div>
               )}
               
               <p className="text-[11px] text-gray-400 mt-1">
                 아래 Apps Script 코드를 시트의 '확장 프로그램 > Apps Script'에 붙여넣고 배포하세요.
               </p>
             </div>

             <details className="mt-4 text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-200">
               <summary className="cursor-pointer font-medium mb-2 hover:text-[#00c7ae]">Apps Script 코드 보기 (클릭)</summary>
               <div className="bg-gray-800 text-gray-200 p-2 rounded overflow-x-auto font-mono text-[10px] leading-relaxed select-all">
<pre>{`function doGet(e) {
  // 안정적인 데이터 조회를 위해 첫 번째 시트를 명시적으로 사용
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var rows = sheet.getDataRange().getValues();
  var data = [];
  
  // 헤더 제외하고 데이터 파싱
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if(row[0]) { // 이름이 있는 경우만
      data.push({
        name: String(row[0]),
        jobTitle: String(row[1]),
        company: String(row[2]),
        phone: String(row[3]),
        email: String(row[4]),
        address: String(row[5]),
        website: String(row[6]),
        scannedAt: String(row[7]),
        id: String(row[8] || '') // ID가 없을 수도 있음
      });
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var params = JSON.parse(e.postData.contents);
  
  // 백업 모드: 기존 데이터 지우고 전체 덮어쓰기
  if (params.action === 'backup' && params.data && Array.isArray(params.data)) {
    // 2행부터 끝까지 내용 삭제 (헤더 유지)
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 9).clearContent();
    }
    
    // 데이터가 있는 경우에만 쓰기
    if (params.data.length > 0) {
      var rows = params.data.map(function(card) {
        return [
          card.name, 
          card.jobTitle, 
          card.company, 
          card.phone, 
          card.email, 
          card.address, 
          card.website, 
          card.scannedAt,
          card.id
        ];
      });
      // 한 번에 쓰기 (Bulk write)
      sheet.getRange(2, 1, rows.length, 9).setValues(rows);
    }
    return ContentService.createTextOutput("Backup Success");
  }
  
  // 일반 모드: 한 줄 추가
  sheet.appendRow([
    params.name, 
    params.jobTitle, 
    params.company, 
    params.phone, 
    params.email, 
    params.address, 
    params.website, 
    params.scannedAt,
    params.id || ''
  ]);
  
  return ContentService.createTextOutput("Success");
}`}</pre>
               </div>
               <div className="mt-2 pl-2 border-l-2 border-red-400">
                  <p className="font-bold text-red-500">배포 시 주의사항!</p>
                  <ol className="list-decimal pl-4 space-y-1 mt-1">
                    <li>우측 상단 <b>[배포] &gt; [새 배포]</b> 클릭</li>
                    <li>유형 선택: <b>웹 앱</b></li>
                    <li>설명: (임의 입력, 예: v2)</li>
                    <li>액세스 권한: 반드시 <b>'모든 사용자(Anyone)'</b> 선택</li>
                    <li><b>[배포]</b> 버튼 클릭 후 생성된 URL을 복사</li>
                  </ol>
               </div>
             </details>
          </div>

          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
            <h2 className="font-bold mb-3 text-gray-700">데이터 관리</h2>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={handleBackup}
                disabled={isLoading}
                className="flex flex-col items-center justify-center p-4 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <span className="text-xl mb-1">☁️</span>
                <span className="text-sm font-bold text-blue-700">데이터 백업</span>
                <span className="text-[10px] text-blue-500">폰 → 구글시트</span>
              </button>
              
              <button 
                 onClick={handleRestore}
                 disabled={isLoading}
                 className="flex flex-col items-center justify-center p-4 bg-orange-50 border border-orange-100 rounded-lg hover:bg-orange-100 transition-colors"
              >
                <span className="text-xl mb-1">🔄</span>
                <span className="text-sm font-bold text-orange-700">데이터 복원</span>
                <span className="text-[10px] text-orange-500">구글시트 → 폰</span>
              </button>
            </div>
             {isLoading && <p className="text-center text-xs text-gray-500 mt-2">처리 중입니다...</p>}
          </div>

          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
             <h2 className="font-bold mb-3 text-gray-700">내보내기</h2>
             <button 
                onClick={() => downloadCSV(cards)}
                className="w-full p-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 text-sm flex items-center justify-center gap-2"
              >
                <SheetIcon className="w-4 h-4" /> CSV 파일로 저장
              </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {isLoading && (
         <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white p-4 rounded-xl shadow-xl flex flex-col items-center">
               <div className="w-8 h-8 border-4 border-[#00c7ae] border-t-transparent rounded-full animate-spin mb-2"></div>
               <span className="text-sm font-medium text-gray-700">잠시만 기다려주세요...</span>
            </div>
         </div>
      )}
      {renderRestoreModal()}
      {view === ViewState.LIST && renderList()}
      {view === ViewState.EDIT && renderEdit()}
      {view === ViewState.SETTINGS && renderSettings()}
    </>
  );
}

export default App;