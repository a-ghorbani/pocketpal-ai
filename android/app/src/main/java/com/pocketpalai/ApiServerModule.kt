package com.pocketpal

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.pocketpal.specs.NativeApiServerSpec
import java.io.BufferedWriter
import java.io.IOException
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

private const val REQUEST_EVENT = "onApiServerRequest"
private const val MAX_BODY_BYTES = 32 * 1024 * 1024
private const val REQUEST_TIMEOUT_MINUTES = 15L

@ReactModule(name = NativeApiServerSpec.NAME)
class ApiServerModule(reactContext: ReactApplicationContext) :
    NativeApiServerSpec(reactContext) {

  private val running = AtomicBoolean(false)
  private var serverSocket: ServerSocket? = null
  private var acceptExecutor: ExecutorService? = null
  private var workerExecutor: ExecutorService? = null
  private var timeoutExecutor: ScheduledExecutorService? = null
  private val openSockets = ConcurrentHashMap<String, Socket>()
  private val openStreams = ConcurrentHashMap<String, BufferedWriter>()

  private fun sendEvent(eventName: String, params: WritableMap) {
    reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(eventName, params)
  }

  override fun addListener(eventName: String) {}

  override fun removeListeners(count: Double) {}

  override fun start(port: Double, promise: Promise) {
    if (running.get()) {
      promise.reject("ALREADY_RUNNING", "API server is already running")
      return
    }
    if (port.toInt() !in 1024..65535) {
      promise.reject("INVALID_PORT", "Port must be between 1024 and 65535")
      return
    }
    try {
      val serverSocket = ServerSocket()
      serverSocket.reuseAddress = true
      serverSocket.bind(InetSocketAddress(port.toInt()))

      val acceptExecutor = Executors.newSingleThreadExecutor()
      val workerExecutor = Executors.newCachedThreadPool()
      val timeoutExecutor = Executors.newSingleThreadScheduledExecutor()

      this.serverSocket = serverSocket
      this.acceptExecutor = acceptExecutor
      this.workerExecutor = workerExecutor
      this.timeoutExecutor = timeoutExecutor
      running.set(true)

      acceptExecutor.execute {
        while (running.get() && !serverSocket.isClosed) {
          try {
            val socket = serverSocket.accept()
            workerExecutor.execute { handleConnection(socket) }
          } catch (e: IOException) {
            if (running.get()) {
              continue
            }
          }
        }
      }
      promise.resolve(true)
    } catch (e: Exception) {
      running.set(false)
      serverSocket = null
      promise.reject("START_ERROR", e.message ?: "Failed to start API server")
    }
  }

  override fun stop(promise: Promise) {
    try {
      running.set(false)
      openSockets.keys.toList().forEach { cleanupRequest(it) }
      openStreams.keys.toList().forEach { cleanupRequest(it) }
      try {
        serverSocket?.close()
      } catch (_: IOException) {}
      acceptExecutor?.shutdownNow()
      workerExecutor?.shutdownNow()
      timeoutExecutor?.shutdownNow()
      acceptExecutor = null
      workerExecutor = null
      timeoutExecutor = null
      serverSocket = null
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("STOP_ERROR", e.message ?: "Failed to stop API server")
    }
  }

  override fun isRunning(promise: Promise) {
    promise.resolve(running.get())
  }

  override fun sendResponse(
      requestId: String,
      statusCode: Double,
      headersJson: String,
      body: String,
      promise: Promise
  ) {
    val socket = openSockets[requestId]
    if (socket == null || socket.isClosed) {
      openSockets.remove(requestId)
      promise.reject("REQUEST_NOT_FOUND", "Unknown or closed request: $requestId")
      return
    }
    try {
      val bodyBytes = body.toByteArray(StandardCharsets.UTF_8)
      val customHeaders = parseHeaders(headersJson)
      val headers = LinkedHashMap<String, String>()
      headers["Content-Type"] = "application/json; charset=utf-8"
      headers["Content-Length"] = bodyBytes.size.toString()
      headers["Access-Control-Allow-Origin"] = "*"
      headers["Connection"] = "close"
      customHeaders.forEach { (key, value) ->
        if (!key.equals("content-type", ignoreCase = true)) {
          headers[key] = value
        }
      }
      socket.getOutputStream().let { out ->
        val writer = BufferedWriter(OutputStreamWriter(out, StandardCharsets.UTF_8))
        writeResponseHead(writer, statusCode.toInt(), headers)
        writer.flush()
        out.write(bodyBytes)
        out.flush()
      }
      cleanupRequest(requestId)
      promise.resolve(true)
    } catch (e: IOException) {
      cleanupRequest(requestId)
      promise.reject("WRITE_ERROR", e.message ?: "Failed to write response")
    }
  }

  override fun startSSE(requestId: String, promise: Promise) {
    val socket = openSockets[requestId]
    if (socket == null || socket.isClosed) {
      promise.reject("REQUEST_NOT_FOUND", "Unknown or closed request: $requestId")
      return
    }
    try {
      val writer =
          BufferedWriter(
              OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8))
      val headers =
          linkedMapOf(
              "Content-Type" to "text/event-stream; charset=utf-8",
              "Cache-Control" to "no-cache",
              "Connection" to "keep-alive",
              "Access-Control-Allow-Origin" to "*",
              "X-Accel-Buffering" to "no")
      writeResponseHead(writer, 200, headers)
      writer.flush()
      openStreams[requestId] = writer
      promise.resolve(true)
    } catch (e: IOException) {
      cleanupRequest(requestId)
      promise.reject("WRITE_ERROR", e.message ?: "Failed to start SSE stream")
    }
  }

  override fun sendSSEChunk(requestId: String, payload: String, promise: Promise) {
    val writer = openStreams[requestId]
    if (writer == null) {
      promise.reject("REQUEST_NOT_FOUND", "No active SSE stream: $requestId")
      return
    }
    try {
      writer.write("data: $payload\n\n")
      writer.flush()
      promise.resolve(true)
    } catch (e: IOException) {
      cleanupRequest(requestId)
      promise.reject("WRITE_ERROR", e.message ?: "Client disconnected")
    }
  }

  override fun finishSSE(requestId: String, promise: Promise) {
    val writer = openStreams[requestId]
    if (writer == null) {
      promise.reject("REQUEST_NOT_FOUND", "No active SSE stream: $requestId")
      return
    }
    try {
      writer.write("data: [DONE]\n\n")
      writer.flush()
      cleanupRequest(requestId)
      promise.resolve(true)
    } catch (e: IOException) {
      cleanupRequest(requestId)
      promise.reject("WRITE_ERROR", e.message ?: "Client disconnected")
    }
  }

  private fun handleConnection(socket: Socket) {
    val requestId = java.util.UUID.randomUUID().toString()
    try {
      socket.tcpNoDelay = true
      val reader = InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8)
      val requestLine = readLine(reader) ?: return
      val parts = requestLine.split(" ")
      if (parts.size < 2) {
        writeSimpleError(socket, 400, "Malformed request line")
        return
      }
      val method = parts[0].uppercase()
      val pathWithQuery = parts[1]
      val path = pathWithQuery.substringBefore('?')

      val headers = LinkedHashMap<String, String>()
      while (true) {
        val line = readLine(reader) ?: break
        if (line.isEmpty()) break
        val idx = line.indexOf(':')
        if (idx > 0) {
          headers[line.substring(0, idx).trim().lowercase()] = line.substring(idx + 1).trim()
        }
      }

      val contentLength = headers["content-length"]?.toIntOrNull() ?: 0
      if (contentLength > MAX_BODY_BYTES) {
        writeSimpleError(socket, 413, "Request body too large")
        return
      }
      val body = StringBuilder()
      if (contentLength > 0) {
        val buffer = CharArray(8192)
        var remaining = contentLength
        while (remaining > 0) {
          val read = reader.read(buffer, 0, minOf(remaining, buffer.size))
          if (read < 0) break
          body.append(buffer, 0, read)
          remaining -= read
        }
      }

      openSockets[requestId] = socket
      timeoutExecutor?.schedule(
          { cleanupRequest(requestId) }, REQUEST_TIMEOUT_MINUTES, TimeUnit.MINUTES)

      val params =
          Arguments.createMap().apply {
            putString("requestId", requestId)
            putString("method", method)
            putString("path", path)
            putString("headers", JSONObject(headers).toString())
            putString("body", body.toString())
          }
      sendEvent(REQUEST_EVENT, params)
    } catch (e: IOException) {
      cleanupRequest(requestId)
    } catch (e: Exception) {
      try {
        writeSimpleError(socket, 500, "Internal error: ${e.message}")
      } catch (_: Exception) {}
      cleanupRequest(requestId)
    }
  }

  private fun readLine(reader: InputStreamReader): String? {
    val sb = StringBuilder()
    while (true) {
      val c = reader.read()
      if (c < 0) {
        return if (sb.isEmpty()) null else sb.toString()
      }
      if (c == '\n'.code) {
        if (sb.isNotEmpty() && sb[sb.length - 1] == '\r') {
          sb.setLength(sb.length - 1)
        }
        return sb.toString()
      }
      sb.append(c.toChar())
    }
  }

  private fun parseHeaders(headersJson: String): Map<String, String> {
    if (headersJson.isBlank()) return emptyMap()
    return try {
      val json = JSONObject(headersJson)
      val result = LinkedHashMap<String, String>()
      for (key in json.keys()) {
        result[key] = json.optString(key, "")
      }
      result
    } catch (_: Exception) {
      emptyMap()
    }
  }

  private fun statusReason(statusCode: Int): String =
      when (statusCode) {
        200 -> "OK"
        201 -> "Created"
        204 -> "No Content"
        400 -> "Bad Request"
        401 -> "Unauthorized"
        403 -> "Forbidden"
        404 -> "Not Found"
        408 -> "Request Timeout"
        413 -> "Payload Too Large"
        429 -> "Too Many Requests"
        500 -> "Internal Server Error"
        503 -> "Service Unavailable"
        else -> "Status"
      }

  private fun writeResponseHead(
      writer: BufferedWriter,
      statusCode: Int,
      headers: Map<String, String>
  ) {
    writer.write("HTTP/1.1 $statusCode ${statusReason(statusCode)}\r\n")
    for ((key, value) in headers) {
      writer.write("$key: $value\r\n")
    }
    writer.write("\r\n")
  }

  private fun writeSimpleError(socket: Socket, statusCode: Int, message: String) {
    try {
      val body = JSONObject().put("error", message).toString()
      val bytes = body.toByteArray(StandardCharsets.UTF_8)
      socket.getOutputStream().let { out ->
        val writer = BufferedWriter(OutputStreamWriter(out, StandardCharsets.UTF_8))
        val headers =
            linkedMapOf(
                "Content-Type" to "application/json; charset=utf-8",
                "Content-Length" to bytes.size.toString(),
                "Connection" to "close")
        writeResponseHead(writer, statusCode, headers)
        writer.flush()
        out.write(bytes)
        out.flush()
      }
      socket.close()
    } catch (_: Exception) {}
  }

  private fun cleanupRequest(requestId: String) {
    openStreams.remove(requestId)?.let { writer ->
      try {
        writer.close()
      } catch (_: IOException) {}
    }
    openSockets.remove(requestId)?.let { socket ->
      try {
        socket.close()
      } catch (_: IOException) {}
    }
  }

  override fun invalidate() {
    running.set(false)
    try {
      serverSocket?.close()
    } catch (_: IOException) {}
    acceptExecutor?.shutdownNow()
    workerExecutor?.shutdownNow()
    timeoutExecutor?.shutdownNow()
    super.invalidate()
  }
}
