import { BusinessCard } from '../types';

// Convert image file to Base64
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data url prefix (e.g. "data:image/jpeg;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

// Generate VCF (vCard) content
export const generateVCard = (card: BusinessCard): string => {
  const vcard = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${card.name}`,
    `FN:${card.name}`,
    `ORG:${card.company}`,
    `TITLE:${card.jobTitle}`,
    `TEL;TYPE=WORK,VOICE:${card.phone}`,
    `EMAIL:${card.email}`,
    `ADR;TYPE=WORK:;;${card.address}`,
    `URL:${card.website}`,
    'END:VCARD'
  ].join('\n');
  return vcard;
};

// Trigger VCF Download
export const downloadVCard = (card: BusinessCard) => {
  const vcardContent = generateVCard(card);
  const blob = new Blob([vcardContent], { type: 'text/vcard' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${card.name}.vcf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Share via Web Share API
export const shareCard = async (card: BusinessCard) => {
  const text = `
[명함 정보]
이름: ${card.name}
직함: ${card.jobTitle}
회사: ${card.company}
전화: ${card.phone}
이메일: ${card.email}
주소: ${card.address}
웹사이트: ${card.website}
  `.trim();

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${card.name} 명함`,
        text: text,
      });
    } catch (err) {
      console.log('Share canceled or failed', err);
    }
  } else {
    // Fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(text);
      alert('명함 정보가 클립보드에 복사되었습니다. 카카오톡이나 메시지 앱을 열고 붙여넣기(Paste) 하세요.');
    } catch (err) {
      alert('공유 기능을 지원하지 않는 브라우저입니다.');
    }
  }
};

// Send via SMS / Messages
export const sendSMS = (card: BusinessCard) => {
  const text = `[명함공유]\n성함: ${card.name}\n회사: ${card.company}\n전화: ${card.phone}\n이메일: ${card.email}`;
  const encodedText = encodeURIComponent(text);
  
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod|macintosh/.test(ua);

  // iOS typically requires '&' for the body parameter if no recipient is specified,
  // whereas the standard (and Android) uses '?'.
  const url = isIOS 
    ? `sms:&body=${encodedText}` 
    : `sms:?body=${encodedText}`;
  
  // Use anchor click instead of window.location for better reliability
  const link = document.createElement('a');
  link.href = url;
  link.style.display = 'none';
  document.body.appendChild(link);
  
  try {
    link.click();
  } catch (e) {
    console.warn("SMS link trigger failed", e);
    alert("메시지 앱을 바로 열 수 없습니다. '공유' 버튼을 이용해보세요.");
  } finally {
    // Clean up
    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
    }, 200);
  }
};

// Send single card to Google Sheet (Legacy/Auto-save)
export const sendToGoogleSheet = async (card: BusinessCard, webhookUrl: string): Promise<boolean> => {
  if (!webhookUrl) return false;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(card),
    });
    return true;
  } catch (e) {
    console.error("Sheet Export Error", e);
    return false;
  }
};

// Backup ALL cards to Google Sheet
export const backupToSheet = async (cards: BusinessCard[], webhookUrl: string): Promise<boolean> => {
  if (!webhookUrl) return false;

  try {
    // Send with action: 'backup'
    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'backup',
        data: cards
      }),
    });
    return true;
  } catch (e) {
    console.error("Backup Error", e);
    return false;
  }
};

// Restore (Fetch) ALL cards from Google Sheet
export const restoreFromSheet = async (webhookUrl: string): Promise<BusinessCard[]> => {
  if (!webhookUrl) throw new Error("URL missing");

  // Basic Validation
  if (!webhookUrl.includes('script.google.com')) {
    throw new Error("올바르지 않은 URL입니다.\n'script.google.com'으로 시작하는 Web App URL을 입력해주세요.\n(구글 시트 주소가 아닙니다)");
  }

  // Add cache buster to prevent cached responses
  const urlObj = new URL(webhookUrl);
  urlObj.searchParams.append('t', new Date().getTime().toString());

  try {
    const response = await fetch(urlObj.toString(), {
      method: 'GET',
      redirect: 'follow', // Explicitly follow redirects from script.google.com
    });
    
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.status}`);
    }

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      if (data.error) {
        throw new Error(data.error);
      }
      if (Array.isArray(data)) {
          return data as BusinessCard[];
      }
      return [];
    } catch (parseError) {
      console.error("JSON Parse Error. Raw response:", text);
      if (text.includes("<!DOCTYPE html>") || text.includes("Google Accounts")) {
         throw new Error("인증 페이지가 반환되었습니다.\nApps Script 배포 시 '액세스 권한'을 '모든 사용자(Anyone)'로 설정했는지 확인하세요.");
      }
      throw new Error("서버에서 올바른 데이터를 받지 못했습니다.\nApps Script 코드가 최신인지 확인하고 '새 배포'를 진행해주세요.");
    }
  } catch (e) {
    console.error("Restore Error", e);
    throw e;
  }
};

// Test Connection
export const testSheetConnection = async (webhookUrl: string): Promise<{ success: boolean; message: string }> => {
  if (!webhookUrl) return { success: false, message: "URL이 비어있습니다." };
  
  if (!webhookUrl.includes('script.google.com')) {
    return { success: false, message: "올바른 Apps Script URL 형식이 아닙니다." };
  }

  const urlObj = new URL(webhookUrl);
  urlObj.searchParams.append('t', new Date().getTime().toString()); // Cache buster

  try {
    const response = await fetch(urlObj.toString(), {
      method: 'GET',
      redirect: 'follow',
    });

    if (!response.ok) {
       return { success: false, message: `HTTP 오류: ${response.status}` };
    }

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      if (data.error) {
        return { success: false, message: `스크립트 오류: ${data.error}` };
      }
      if (Array.isArray(data)) {
        return { success: true, message: `연동 성공! 시트에 저장된 명함: ${data.length}개` };
      }
      return { success: false, message: "응답 형식이 올바르지 않습니다 (배열이 아님)." };
    } catch (e) {
      if (text.includes("<!DOCTYPE html>")) {
         return { success: false, message: "권한 오류: '모든 사용자(Anyone)' 권한 확인 필요" };
      }
      return { success: false, message: "데이터 파싱 실패. 배포 코드를 확인하세요." };
    }
  } catch (e: any) {
    return { success: false, message: `네트워크 오류: ${e.message}` };
  }
};

export const downloadCSV = (cards: BusinessCard[]) => {
  const headers = ['Name', 'Title', 'Company', 'Phone', 'Email', 'Address', 'Website', 'Date'];
  const rows = cards.map(c => [
    `"${c.name}"`,
    `"${c.jobTitle}"`,
    `"${c.company}"`,
    `"${c.phone}"`,
    `"${c.email}"`,
    `"${c.address}"`,
    `"${c.website}"`,
    `"${c.scannedAt}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `smartcard_export_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}