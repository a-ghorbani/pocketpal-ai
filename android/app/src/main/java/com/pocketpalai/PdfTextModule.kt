package com.pocketpal

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File

/**
 * Extracts the text layer of a PDF via pdfbox-android. Returns an empty
 * string for scanned/image-only PDFs (no text layer); the JS caller
 * treats that as "not extractable" rather than an error.
 */
class PdfTextModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "PdfTextExtractor"

  @ReactMethod
  fun extractText(path: String, promise: Promise) {
    var doc: PDDocument? = null
    try {
      val file = File(path)
      if (!file.exists() || file.length() == 0L) {
        promise.reject("ENOENT", "file not found: $path")
        return
      }
      doc = PDDocument.load(file)
      val stripper = PDFTextStripper()
      // Sort restores reading order for PDFs whose content streams are
      // written out of visual order (common with generators).
      stripper.sortByPosition = true
      val text = stripper.getText(doc) ?: ""
      promise.resolve(text.trim())
    } catch (e: OutOfMemoryError) {
      promise.reject("ENOMEM", "pdf too large to extract")
    } catch (e: Throwable) {
      promise.reject("PDF_ERROR", e.message ?: "pdf extraction failed")
    } finally {
      try {
        doc?.close()
      } catch (_: Throwable) {}
    }
  }
}
