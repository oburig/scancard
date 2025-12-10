export interface BusinessCard {
  id: string;
  name: string;
  jobTitle: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  scannedAt: string; // ISO Date string
  notes?: string;
  imageUrl?: string; // Base64 string of the card image
}

export enum ViewState {
  LIST = 'LIST',
  SCAN = 'SCAN',
  EDIT = 'EDIT',
  SETTINGS = 'SETTINGS'
}

export interface AppSettings {
  googleSheetWebhookUrl: string;
}