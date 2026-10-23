package com.pocketpal

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.pocketpal.specs.NativePdfTextSpec
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

@ReactModule(name = NativePdfTextSpec.NAME)
class PdfTextModule(reactContext: ReactApplicationContext) :
    NativePdfTextSpec(reactContext) {

  private val executor: ExecutorService = Executors.newSingleThreadExecutor()
  private var resourcesLoaded = false

  override fun extractPages(path: String, from: Double, to: Double, promise: Promise) {
    executor.execute {
      var document: PDDocument? = null
      try {
        if (!resourcesLoaded) {
          PDFBoxResourceLoader.init(reactApplicationContext.applicationContext)
          resourcesLoaded = true
        }
        document = PDDocument.load(
          File(path.removePrefix("file://")),
          MemoryUsageSetting.setupTempFileOnly(),
        )
        val pageCount = document.numberOfPages
        val first = maxOf(1, from.toInt())
        val last = minOf(pageCount, to.toInt())
        val stripper = PDFTextStripper()
        val pages = Arguments.createArray()
        for (page in first..last) {
          stripper.startPage = page
          stripper.endPage = page
          pages.pushString(stripper.getText(document))
        }
        val result = Arguments.createMap()
        result.putInt("pageCount", pageCount)
        result.putArray("pages", pages)
        promise.resolve(result)
      } catch (e: InvalidPasswordException) {
        promise.reject("E_PDF_ENCRYPTED", e.message, e)
      } catch (e: Throwable) {
        promise.reject("E_PDF_UNREADABLE", e.message, e)
      } finally {
        try {
          document?.close()
        } catch (_: Throwable) {
        }
      }
    }
  }

  override fun invalidate() {
    executor.shutdown()
    super.invalidate()
  }
}
