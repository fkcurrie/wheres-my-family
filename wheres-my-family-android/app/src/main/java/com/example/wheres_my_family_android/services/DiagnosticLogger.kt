package com.example.wheres_my_family_android.services

import android.content.Context
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object DiagnosticLogger {

    private const val LOG_LIMIT = 80
    private const val PREFS_NAME = "diagnostic_logger_prefs"
    private const val KEY_LOGS = "diagnostic_logs"

    private val _logsFlow = MutableStateFlow<List<String>>(emptyList())
    val logsFlow: StateFlow<List<String>> = _logsFlow.asStateFlow()

    private val loggerScope = CoroutineScope(Dispatchers.IO)
    private var appContext: Context? = null

    fun init(context: Context) {
        appContext = context.applicationContext
        loadLogs()
    }

    private fun loadLogs() {
        val ctx = appContext ?: return
        val sharedPref = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val savedLogsSet = sharedPref.getStringSet(KEY_LOGS, emptySet()) ?: emptySet()
        // SharedPreferences string sets don't maintain order. Let's parse and sort if possible, or just build the list.
        // For diagnostic logs, we can store them as a combined newline string or a JSON array to preserve chronological order.
        val combined = sharedPref.getString("combined_logs", "") ?: ""
        val list = if (combined.isNotEmpty()) combined.split("\n").filter { it.isNotEmpty() } else emptyList()
        _logsFlow.update { list }
    }

    private fun saveLogs(logs: List<String>) {
        val ctx = appContext ?: return
        val sharedPref = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val combined = logs.joinToString("\n")
        sharedPref.edit().putString("combined_logs", combined).apply()
    }

    fun addDiagnosticLog(msg: String) {
        val timeFormatter = SimpleDateFormat("HH:mm:ss", Locale.US)
        val timestamp = timeFormatter.format(Date())
        val formattedLog = "[$timestamp] $msg"

        // Update local logs list
        _logsFlow.update { current ->
            val updated = mutableListOf(formattedLog)
            updated.addAll(current)
            if (updated.size > LOG_LIMIT) {
                updated.subList(0, LOG_LIMIT)
            } else {
                updated
            }
        }
        saveLogs(_logsFlow.value)

        // Dispatch remote log asynchronously
        dispatchRemoteLog(msg)
    }

    fun clearLogs() {
        _logsFlow.update { emptyList() }
        saveLogs(emptyList())
    }

    private fun dispatchRemoteLog(msg: String) {
        loggerScope.launch {
            try {
                val ctx = appContext ?: return@launch
                val prefs = SecurePreferencesService(ctx)
                val deviceName = prefs.getUserName().ifEmpty { "AndroidDevice" }

                // Automatically mask GPS coordinates (e.g. 43.1234 or -79.1234)
                val sanitizedMsg = msg.replace(Regex("-?\\d+\\.\\d+"), "[COORDS_MASKED]")

                // Classify log severity
                val lowerMsg = msg.lowercase(Locale.US)
                val severity = when {
                    lowerMsg.contains("error") || lowerMsg.contains("failed") || lowerMsg.contains("exception") -> "ERROR"
                    lowerMsg.contains("warn") -> "WARNING"
                    else -> "INFO"
                }

                val isoFormatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
                val isoTimestamp = isoFormatter.format(Date())

                val payload = buildJsonObject {
                    put("type", "log")
                    put("deviceName", deviceName)
                    put("platform", "android")
                    put("severity", severity)
                    put("message", sanitizedMsg)
                    put("timestamp", isoTimestamp)
                }

                ApiClient.client.post(ApiClient.MANTLE_DB_URL) {
                    contentType(ContentType.Application.Json)
                    header("X-Mantle-Key", ApiClient.MANTLE_KEY)
                    setBody(payload)
                }
            } catch (e: Exception) {
                // Fail silently to prevent recursive logging loops
            }
        }
    }
}
