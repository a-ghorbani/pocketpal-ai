import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface PdfPages {
  pageCount: number;
  pages: string[];
}

export interface Spec extends TurboModule {
  /**
   * Reads the text of pages `from..to` (1-based, inclusive; `to` is clamped to
   * the page count). `to < from` reads no text and only reports `pageCount`.
   * Rejects with `E_PDF_UNREADABLE` or `E_PDF_ENCRYPTED`.
   */
  extractPages(path: string, from: number, to: number): Promise<PdfPages>;
}

export default TurboModuleRegistry.get<Spec>('PdfTextModule');
