package com.example.wheres_my_family_android.ui.main

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.wheres_my_family_android.data.FamilyMember
import com.example.wheres_my_family_android.services.ApiClient
import com.example.wheres_my_family_android.services.BackgroundLocationService
import com.example.wheres_my_family_android.services.DiagnosticLogger
import com.example.wheres_my_family_android.services.SecurePreferencesService
import com.example.wheres_my_family_android.services.SmsPackager
import com.google.android.gms.location.LocationServices
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long

data class Announcement(
    val id: String = "",
    val message: String = "",
    val severity: String = "info"
)

data class MainScreenUiState(
    val userName: String = "",
    val customKey: String = "",
    val isTrackingActive: Boolean = false,
    val familyMembers: List<FamilyMember> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val showOnboarding: Boolean = false,
    val announcement: Announcement? = null,
    val isShowingConsole: Boolean = false,
    val isShowingSmsImport: Boolean = false,
    val isShowingSmsSOSSheet: Boolean = false,
    val isShowingSettings: Boolean = false,
    val localSmsSOSPayload: String = "",
    val isShowingFeedback: Boolean = false,
    val isSubmittingFeedback: Boolean = false,
    val feedbackStatusMessage: Pair<String, Boolean>? = null,
    val emergencyContacts: String = ""
)

class MainScreenViewModel(context: Context) : ViewModel() {

    private val prefs = SecurePreferencesService(context)
    private val appContext = context.applicationContext
    private val _uiState = MutableStateFlow(MainScreenUiState())
    val uiState: StateFlow<MainScreenUiState> = _uiState.asStateFlow()

    private var pollJob: Job? = null
    private val dismissedAnnouncements = mutableListOf<String>()

    init {
        val name = prefs.getUserName()
        val key = prefs.getCustomFamilyKey()
        val contacts = prefs.getEmergencyContacts()
        val isOnboarded = name.isNotEmpty() && key.isNotEmpty()

        _uiState.update { 
            it.copy(
                userName = name,
                customKey = key,
                emergencyContacts = contacts,
                showOnboarding = !isOnboarded
            )
        }
        startPolling()
    }

    fun startPolling() {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            while (true) {
                try {
                    val rawJson = ApiClient.fetchLocations()
                    val key = _uiState.value.customKey.ifEmpty { "WheresMyFamilySecureKey2026" }
                    val members = ApiClient.parseLocations(rawJson, key)
                    val userName = _uiState.value.userName

                    // Process remote configs
                    var activeAnnouncement: Announcement? = null
                    try {
                        val json = Json { ignoreUnknownKeys = true }
                        val rootObj = json.parseToJsonElement(rawJson).jsonObject
                        rootObj["_config"]?.let { configElement ->
                            val configObj = configElement.jsonObject
                            configObj["announcement"]?.let { annElement ->
                                val annObj = annElement.jsonObject
                                val annId = annObj["id"]?.jsonPrimitive?.content ?: ""
                                val message = annObj["message"]?.jsonPrimitive?.content ?: ""
                                val severity = annObj["severity"]?.jsonPrimitive?.content ?: "info"
                                
                                if (annId.isNotEmpty() && !dismissedAnnouncements.includesCompat(annId)) {
                                    activeAnnouncement = Announcement(id = annId, message = message, severity = severity)
                                }
                            }
                        }

                        // Local foreground nudge & ping polling checks
                        if (userName.isNotEmpty() && rootObj.containsKey(userName)) {
                            val userObj = rootObj[userName]?.jsonObject
                            val nudgeRequested = userObj?.get("nudgeRequested")?.jsonPrimitive?.boolean ?: false
                            val pingRequested = userObj?.get("pingRequested")?.jsonPrimitive?.boolean ?: false

                            if (nudgeRequested) {
                                triggerForegroundNudge(userName)
                            }
                            if (pingRequested) {
                                triggerForegroundPing(userName, key)
                            }
                        }
                    } catch (configEx: Exception) {
                        // Suppress parse failures on configs to preserve main loop
                    }

                    _uiState.update { 
                        it.copy(
                            familyMembers = members, 
                            announcement = activeAnnouncement,
                            errorMessage = null
                        ) 
                    }
                } catch (e: Exception) {
                    _uiState.update { it.copy(errorMessage = "Failed to sync: ${e.message}") }
                }
                delay(5000)
            }
        }
    }

    private fun triggerForegroundNudge(userName: String) {
        viewModelScope.launch {
            DiagnosticLogger.addDiagnosticLog("[Nudge] RECEIVED a nudge vibration request in foreground!")
            
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = appContext.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vibratorManager.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                appContext.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            val pattern = longArrayOf(0, 500, 200, 500)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(pattern, -1)
            }

            ApiClient.clearNudgeState(userName)
        }
    }

    private fun triggerForegroundPing(userName: String, key: String) {
        viewModelScope.launch {
            DiagnosticLogger.addDiagnosticLog("[Ping] RECEIVED a ping request in foreground! Responding immediately.")
            val client = LocationServices.getFusedLocationProviderClient(appContext)
            try {
                client.lastLocation.addOnSuccessListener { loc ->
                    if (loc != null) {
                        viewModelScope.launch {
                            ApiClient.publishLocation(
                                name = userName,
                                latitude = loc.latitude,
                                longitude = loc.longitude,
                                familyKey = key,
                                status = "Ping Response (FG)",
                                battery = 100,
                                charging = false,
                                deviceStatus = "Active",
                                trail = prefs.getLocalTrail()
                            )
                            DiagnosticLogger.addDiagnosticLog("[Ping Success] Responded to foreground ping.")
                        }
                    }
                }
            } catch (secEx: SecurityException) {
                DiagnosticLogger.addDiagnosticLog("[Ping Error] Location permissions missing: ${secEx.message}")
            }
        }
    }

    fun updateProfile(context: Context, name: String, key: String, contacts: String = "") {
        prefs.saveUserName(name)
        prefs.saveCustomFamilyKey(key)
        prefs.saveEmergencyContacts(contacts)
        _uiState.update {
            it.copy(
                userName = name.trim(),
                customKey = key.trim(),
                emergencyContacts = contacts.trim(),
                showOnboarding = false
            )
        }
        DiagnosticLogger.addDiagnosticLog("[Settings] Profile updated for user: ${name.trim()}")
        startPolling()
    }

    fun toggleTracking(context: Context, active: Boolean) {
        _uiState.update { it.copy(isTrackingActive = active) }
        val intent = Intent(context, BackgroundLocationService::class.java)
        if (active) {
            DiagnosticLogger.addDiagnosticLog("[Service] Starting live background coordinates sharing.")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } else {
            DiagnosticLogger.addDiagnosticLog("[Service] Stopping background coordinates sharing.")
            context.stopService(intent)
        }
    }

    fun requestNudge(member: FamilyMember) {
        viewModelScope.launch {
            DiagnosticLogger.addDiagnosticLog("[Nudge] Requesting high-priority nudge for: ${member.name}")
            val success = ApiClient.requestNudgeMember(member.name, member)
            if (success) {
                DiagnosticLogger.addDiagnosticLog("[Nudge Success] Dispatched nudge to ${member.name}.")
            } else {
                DiagnosticLogger.addDiagnosticLog("[Nudge Error] Nudge failed to post.")
            }
        }
    }

    fun requestPing(member: FamilyMember) {
        viewModelScope.launch {
            DiagnosticLogger.addDiagnosticLog("[Ping] Triggering instant location query for: ${member.name}")
            val success = ApiClient.requestPingMember(member.name, member)
            if (success) {
                DiagnosticLogger.addDiagnosticLog("[Ping Success] Dispatched ping to ${member.name}.")
            } else {
                DiagnosticLogger.addDiagnosticLog("[Ping Error] Ping failed to post.")
            }
        }
    }

    fun deleteMember(member: FamilyMember) {
        viewModelScope.launch {
            DiagnosticLogger.addDiagnosticLog("[System] Retiring family node for: ${member.name}")
            val success = ApiClient.deleteMember(member.name)
            if (success) {
                DiagnosticLogger.addDiagnosticLog("[System Success] Removed ${member.name} from tracked nodes.")
                startPolling()
            } else {
                DiagnosticLogger.addDiagnosticLog("[System Error] Failed to delete member node.")
            }
        }
    }

    fun generateSmsSOS() {
        val client = LocationServices.getFusedLocationProviderClient(appContext)
        try {
            client.lastLocation.addOnSuccessListener { loc ->
                if (loc != null) {
                    val key = _uiState.value.customKey.ifEmpty { "WheresMyFamilySecureKey2026" }
                    val payload = SmsPackager.packageLocationToSMS(
                        latitude = loc.latitude,
                        longitude = loc.longitude,
                        battery = 100,
                        status = "EMERGENCY SOS",
                        key = key
                    )
                    _uiState.update { it.copy(localSmsSOSPayload = payload, isShowingSmsSOSSheet = true) }
                    DiagnosticLogger.addDiagnosticLog("[SMS SOS] Formulated encrypted fallback SOS string.")
                } else {
                    _uiState.update { it.copy(localSmsSOSPayload = "Error: FusedLocation returned null. Ensure location is enabled.") }
                }
            }
        } catch (secEx: SecurityException) {
            _uiState.update { it.copy(localSmsSOSPayload = "Error: Fine location permissions missing.") }
        }
    }

    fun dismissAnnouncement(id: String) {
        dismissedAnnouncements.add(id)
        _uiState.update { it.copy(announcement = null) }
    }

    fun setShowingConsole(visible: Boolean) {
        _uiState.update { it.copy(isShowingConsole = visible) }
    }

    fun setShowingSmsImport(visible: Boolean) {
        _uiState.update { it.copy(isShowingSmsImport = visible) }
    }

    fun setShowingSmsSOSSheet(visible: Boolean) {
        _uiState.update { it.copy(isShowingSmsSOSSheet = visible) }
    }

    fun setShowingSettings(visible: Boolean) {
        _uiState.update { it.copy(isShowingSettings = visible) }
    }

    fun setShowingFeedback(visible: Boolean) {
        _uiState.update { it.copy(isShowingFeedback = visible, feedbackStatusMessage = null) }
    }

    fun submitFeedback(category: String, title: String, details: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSubmittingFeedback = true, feedbackStatusMessage = null) }
            
            DiagnosticLogger.addDiagnosticLog("[Feedback] Dispatching $category issue: \"$title\" to secure Toronto backend proxy")
            
            val label = when (category.lowercase()) {
                "feature" -> "enhancement"
                "optimization" -> "performance"
                "question" -> "question"
                else -> "bug"
            }
            
            val userName = _uiState.value.userName.ifEmpty { "Not Set" }
            val trackingMode = if (_uiState.value.isTrackingActive) "active" else "inactive"
            val timestamp = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())
            val osVersion = Build.VERSION.RELEASE
            val model = Build.MODEL
            
            val diagnostics = """
                
                ---
                ### 🛠️ Background Diagnostic Details (Triage)
                | Field | Value |
                | :--- | :--- |
                | **User Account** | $userName |
                | **Timestamp** | $timestamp (local) |
                | **Platform / OS** | Android (Version $osVersion, Model $model) |
                | **Active Tracking Mode** | $trackingMode |
            """.trimIndent()
            
            val finalBody = "${details.trim()}\n\n$diagnostics"
            
            val githubUrl = ApiClient.submitFeedback(title, finalBody, label)
            
            if (githubUrl != null) {
                DiagnosticLogger.addDiagnosticLog("[Feedback Success] Created GitHub issue: $githubUrl")
                _uiState.update { 
                    it.copy(
                        isSubmittingFeedback = false,
                        feedbackStatusMessage = Pair("Success! Created issue on GitHub!\n\n$githubUrl", true)
                    )
                }
            } else {
                DiagnosticLogger.addDiagnosticLog("[Feedback Error] Backend rejected submission.")
                _uiState.update { 
                    it.copy(
                        isSubmittingFeedback = false,
                        feedbackStatusMessage = Pair("GCP Backend rejected the feedback payload or timed out.", false)
                    )
                }
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        pollJob?.cancel()
    }

    private fun List<String>.includesCompat(element: String): Boolean {
        return this.contains(element)
    }
}
