package com.example.wheres_my_family_android.ui.main

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.wheres_my_family_android.data.FamilyMember
import com.example.wheres_my_family_android.services.ApiClient
import com.example.wheres_my_family_android.services.BackgroundLocationService
import com.example.wheres_my_family_android.services.SecurePreferencesService
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class MainScreenUiState(
    val userName: String = "",
    val customKey: String = "",
    val isTrackingActive: Boolean = false,
    val familyMembers: List<FamilyMember> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class MainScreenViewModel(context: Context) : ViewModel() {

    private val prefs = SecurePreferencesService(context)
    private val _uiState = MutableStateFlow(MainScreenUiState())
    val uiState: StateFlow<MainScreenUiState> = _uiState.asStateFlow()

    private var pollJob: Job? = null

    init {
        val name = prefs.getUserName()
        val key = prefs.getCustomFamilyKey()
        _uiState.update { 
            it.copy(
                userName = name,
                customKey = key
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
                    _uiState.update { it.copy(familyMembers = members, errorMessage = null) }
                } catch (e: Exception) {
                    _uiState.update { it.copy(errorMessage = "Failed to sync: ${e.message}") }
                }
                delay(5000)
            }
        }
    }

    fun updateProfile(context: Context, name: String, key: String) {
        prefs.saveUserName(name)
        prefs.saveCustomFamilyKey(key)
        _uiState.update {
            it.copy(
                userName = name.trim(),
                customKey = key.trim()
            )
        }
        startPolling()
    }

    fun toggleTracking(context: Context, active: Boolean) {
        _uiState.update { it.copy(isTrackingActive = active) }
        val intent = Intent(context, BackgroundLocationService::class.java)
        if (active) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } else {
            context.stopService(intent)
        }
    }

    override fun onCleared() {
        super.onCleared()
        pollJob?.cancel()
    }
}
