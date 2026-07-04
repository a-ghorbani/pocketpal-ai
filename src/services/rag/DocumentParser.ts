/**
 * DocumentParser — extracts text from various document formats.
 *
 * Supported formats:
 * - .txt: plain text
 * - .md: markdown (stripped to plain text)
 * - .html: HTML (tags stripped)
 * - .json: JSON (values extracted as text)
 * - .pdf: PDF text extraction (requires native module)
 *
 * Architecture: All parsing happens on-device.
 */

import type {DocumentFormat} from './types';

export class DocumentParser {
  /**
   * Parse a document and extract its text content.
   */
  static parse(content: string, format: DocumentFormat): string {
    switch (format) {
      case 'txt':
        return this.parseTxt(content);
      case 'md':
        return this.parseMarkdown(content);
      case 'html':
        return this.parseHtml(content);
      case 'json':
        return this.parseJson(content);
      case 'pdf':
        return this.parsePdf(content);
      default:
        return content;
    }
  }

  /**
   * Detect format from file extension.
   */
  static detectFormat(filename: string): DocumentFormat {
    const ext = filename.toLowerCase().split('.').pop();
    switch (ext) {
      case 'txt':
        return 'txt';
      case 'md':
      case 'markdown':
        return 'md';
      case 'html':
      case 'htm':
        return 'html';
      case 'json':
        return 'json';
      case 'pdf':
        return 'pdf';
      default:
        return 'txt';
    }
  }

  private static parseTxt(content: string): string {
    return content.trim();
  }

  /**
   * Parse markdown: strip syntax while preserving readable text.
   */
  private static parseMarkdown(content: string): string {
    return content
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      // Remove inline code
      .replace(/`([^`]+)`/g, '$1')
      // Remove images
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      // Convert links to text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove headers markers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold/italic markers
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
      .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
      // Remove blockquote markers
      .replace(/^>\s+/gm, '')
      // Remove list markers
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      // Remove horizontal rules
      .replace(/^---+$/gm, '')
      // Clean up whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Parse HTML: strip tags and extract text.
   */
  private static parseHtml(content: string): string {
    return content
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Parse JSON: extract string values recursively.
   */
  private static parseJson(content: string): string {
    try {
      const data = JSON.parse(content);
      return this.extractJsonText(data);
    } catch {
      return content;
    }
  }

  /**
   * Recursively extract text from JSON values.
   */
  private static extractJsonText(data: any): string {
    if (typeof data === 'string') {
      return data;
    }
    if (typeof data === 'number' || typeof data === 'boolean') {
      return String(data);
    }
    if (Array.isArray(data)) {
      return data.map(item => this.extractJsonText(item)).join('\n');
    }
    if (typeof data === 'object' && data !== null) {
      return Object.entries(data)
        .map(([key, value]) => {
          const valText = this.extractJsonText(value);
          return `${key}: ${valText}`;
        })
        .join('\n');
    }
    return '';
  }

  /**
   * Parse PDF: placeholder for native module integration.
   * PDF text extraction requires a native module (e.g., react-native-pdf).
   */
  private static parsePdf(content: string): string {
    // TODO: Integrate with native PDF text extraction
    // For now, return as-is (base64 or raw bytes will be handled by native)
    if (!content || content.trim().length === 0) {
      throw new Error('PDF parsing requires native module integration');
    }
    return content;
  }
}
